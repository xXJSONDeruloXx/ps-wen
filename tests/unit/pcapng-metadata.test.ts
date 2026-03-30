import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTlsServerName, summarizePcapngMetadata } from '../../scripts/lib/pcapng-metadata.js';

function pad32(bytes: Buffer) {
  const padding = (4 - (bytes.length % 4)) % 4;
  return padding === 0 ? bytes : Buffer.concat([bytes, Buffer.alloc(padding)]);
}

function makeBlock(blockType: number, body: Buffer) {
  const totalLength = 12 + body.length;
  const block = Buffer.alloc(totalLength);
  block.writeUInt32LE(blockType, 0);
  block.writeUInt32LE(totalLength, 4);
  body.copy(block, 8);
  block.writeUInt32LE(totalLength, totalLength - 4);
  return block;
}

function buildSectionHeaderBlock() {
  const body = Buffer.alloc(16);
  body.writeUInt32LE(0x1a2b3c4d, 0);
  body.writeUInt16LE(1, 4);
  body.writeUInt16LE(0, 6);
  body.writeBigInt64LE(BigInt(-1), 8);
  return makeBlock(0x0a0d0d0a, body);
}

function buildInterfaceDescriptionBlock() {
  const body = Buffer.alloc(8);
  body.writeUInt16LE(1, 0);
  body.writeUInt16LE(0, 2);
  body.writeUInt32LE(0xffff, 4);
  return makeBlock(0x00000001, body);
}

function buildEnhancedPacketBlock(packet: Buffer) {
  const packetData = pad32(packet);
  const body = Buffer.alloc(20 + packetData.length);
  body.writeUInt32LE(0, 0);
  body.writeUInt32LE(0, 4);
  body.writeUInt32LE(0, 8);
  body.writeUInt32LE(packet.length, 12);
  body.writeUInt32LE(packet.length, 16);
  packetData.copy(body, 20);
  return makeBlock(0x00000006, body);
}

function ipv4Bytes(ip: string) {
  return Buffer.from(ip.split('.').map((part) => Number(part)));
}

function buildEthernetIpv4Frame(ipPayload: Buffer) {
  const frame = Buffer.alloc(14 + ipPayload.length);
  frame.writeUInt16BE(0x0800, 12);
  ipPayload.copy(frame, 14);
  return frame;
}

function buildUdpIpv4Frame(args: {
  srcIp: string;
  dstIp: string;
  srcPort: number;
  dstPort: number;
  payload: Buffer;
}) {
  const udpLength = 8 + args.payload.length;
  const ipTotalLength = 20 + udpLength;
  const ip = Buffer.alloc(ipTotalLength);
  ip[0] = 0x45;
  ip.writeUInt16BE(ipTotalLength, 2);
  ip[8] = 64;
  ip[9] = 17;
  ipv4Bytes(args.srcIp).copy(ip, 12);
  ipv4Bytes(args.dstIp).copy(ip, 16);
  ip.writeUInt16BE(args.srcPort, 20);
  ip.writeUInt16BE(args.dstPort, 22);
  ip.writeUInt16BE(udpLength, 24);
  args.payload.copy(ip, 28);
  return buildEthernetIpv4Frame(ip);
}

function buildTcpIpv4Frame(args: {
  srcIp: string;
  dstIp: string;
  srcPort: number;
  dstPort: number;
  seq: number;
  payload: Buffer;
}) {
  const tcpLength = 20 + args.payload.length;
  const ipTotalLength = 20 + tcpLength;
  const ip = Buffer.alloc(ipTotalLength);
  ip[0] = 0x45;
  ip.writeUInt16BE(ipTotalLength, 2);
  ip[8] = 64;
  ip[9] = 6;
  ipv4Bytes(args.srcIp).copy(ip, 12);
  ipv4Bytes(args.dstIp).copy(ip, 16);

  ip.writeUInt16BE(args.srcPort, 20);
  ip.writeUInt16BE(args.dstPort, 22);
  ip.writeUInt32BE(args.seq, 24);
  ip.writeUInt8(0x50, 32);
  ip.writeUInt8(0x18, 33);
  args.payload.copy(ip, 40);
  return buildEthernetIpv4Frame(ip);
}

function encodeDnsName(name: string) {
  return Buffer.concat([
    ...name.split('.').map((label) => Buffer.concat([Buffer.from([label.length]), Buffer.from(label, 'ascii')])),
    Buffer.from([0])
  ]);
}

function buildDnsQuery(name: string) {
  return Buffer.concat([
    Buffer.from([0x12, 0x34, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    encodeDnsName(name),
    Buffer.from([0x00, 0x01, 0x00, 0x01])
  ]);
}

function buildDnsResponse(name: string, ip: string) {
  return Buffer.concat([
    Buffer.from([0x12, 0x34, 0x81, 0x80, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]),
    encodeDnsName(name),
    Buffer.from([0x00, 0x01, 0x00, 0x01]),
    Buffer.from([0xc0, 0x0c, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x3c, 0x00, 0x04]),
    ipv4Bytes(ip)
  ]);
}

function buildTlsClientHelloSni(serverName: string) {
  const serverNameBytes = Buffer.from(serverName, 'ascii');
  const serverNameList = Buffer.concat([
    Buffer.from([0x00]),
    Buffer.from([(serverNameBytes.length >> 8) & 0xff, serverNameBytes.length & 0xff]),
    serverNameBytes
  ]);
  const serverNameExtensionData = Buffer.concat([
    Buffer.from([(serverNameList.length >> 8) & 0xff, serverNameList.length & 0xff]),
    serverNameList
  ]);
  const serverNameExtension = Buffer.concat([
    Buffer.from([0x00, 0x00]),
    Buffer.from([(serverNameExtensionData.length >> 8) & 0xff, serverNameExtensionData.length & 0xff]),
    serverNameExtensionData
  ]);

  const handshakeBody = Buffer.concat([
    Buffer.from([0x03, 0x03]),
    Buffer.alloc(32, 0x11),
    Buffer.from([0x00]),
    Buffer.from([0x00, 0x02, 0x13, 0x01]),
    Buffer.from([0x01, 0x00]),
    Buffer.from([(serverNameExtension.length >> 8) & 0xff, serverNameExtension.length & 0xff]),
    serverNameExtension
  ]);

  const handshakeHeader = Buffer.from([
    0x01,
    (handshakeBody.length >> 16) & 0xff,
    (handshakeBody.length >> 8) & 0xff,
    handshakeBody.length & 0xff
  ]);
  const recordPayload = Buffer.concat([handshakeHeader, handshakeBody]);

  return Buffer.concat([
    Buffer.from([0x16, 0x03, 0x01, (recordPayload.length >> 8) & 0xff, recordPayload.length & 0xff]),
    recordPayload
  ]);
}

function buildPcapng(packets: Buffer[]) {
  return Buffer.concat([
    buildSectionHeaderBlock(),
    buildInterfaceDescriptionBlock(),
    ...packets.map((packet) => buildEnhancedPacketBlock(packet))
  ]);
}

test('extractTlsServerName reads a minimal client hello SNI', () => {
  const payload = buildTlsClientHelloSni('psnow.playstation.com');
  assert.equal(extractTlsServerName(payload), 'psnow.playstation.com');
});

test('summarizePcapngMetadata extracts DNS, SNI, remote endpoints, and high-volume transport candidates', () => {
  const dnsQuery = buildUdpIpv4Frame({
    srcIp: '192.168.0.10',
    dstIp: '192.168.0.1',
    srcPort: 53000,
    dstPort: 53,
    payload: buildDnsQuery('psnow.playstation.com')
  });
  const dnsResponse = buildUdpIpv4Frame({
    srcIp: '192.168.0.1',
    dstIp: '192.168.0.10',
    srcPort: 53,
    dstPort: 53000,
    payload: buildDnsResponse('psnow.playstation.com', '23.213.71.109')
  });
  const tlsClientHello = buildTcpIpv4Frame({
    srcIp: '192.168.0.10',
    dstIp: '23.213.71.109',
    srcPort: 54000,
    dstPort: 443,
    seq: 1000,
    payload: buildTlsClientHelloSni('psnow.playstation.com')
  });
  const udpTransportOut = buildUdpIpv4Frame({
    srcIp: '192.168.0.10',
    dstIp: '104.142.165.13',
    srcPort: 61000,
    dstPort: 2053,
    payload: Buffer.alloc(60000, 0xaa)
  });
  const udpTransportIn = buildUdpIpv4Frame({
    srcIp: '104.142.165.13',
    dstIp: '192.168.0.10',
    srcPort: 2053,
    dstPort: 61000,
    payload: Buffer.alloc(60000, 0xbb)
  });

  const summary = summarizePcapngMetadata(buildPcapng([dnsQuery, dnsResponse, tlsClientHello, udpTransportOut, udpTransportIn]));

  assert.equal(summary.packetCount, 5);
  assert.deepEqual(summary.dnsServers, ['192.168.0.1']);
  assert.deepEqual(summary.playstationSignals, ['psnow.playstation.com']);
  assert.ok(summary.localIps.includes('192.168.0.10'));
  assert.ok(summary.dnsQueries.some((entry) => entry.name === 'psnow.playstation.com' && entry.qtypes.includes('A') && entry.count === 1));
  assert.deepEqual(summary.tlsServerNames, [
    {
      serverName: 'psnow.playstation.com',
      remoteIps: ['23.213.71.109'],
      flowCount: 1
    }
  ]);
  assert.ok(
    summary.remoteEndpoints.some(
      (entry) =>
        entry.remoteIp === '23.213.71.109' &&
        entry.hostnames.includes('psnow.playstation.com') &&
        entry.tcp443BytesOut > 0
    )
  );
  assert.ok(
    summary.remoteServices.some(
      (entry) =>
        entry.remoteIp === '104.142.165.13' &&
        entry.protocol === 'udp' &&
        entry.remotePort === 2053 &&
        entry.bytesOut > 0 &&
        entry.bytesIn > 0
    )
  );
  assert.ok(
    summary.transportCandidates.some(
      (entry) => entry.remoteIp === '104.142.165.13' && entry.protocol === 'udp' && entry.remotePort === 2053
    )
  );
});
