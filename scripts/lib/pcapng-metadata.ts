import net from 'node:net';

export type DnsQuestionSummary = {
  name: string;
  qtypes: string[];
  count: number;
  servers: string[];
};

export type TlsServerNameSummary = {
  serverName: string;
  remoteIps: string[];
  flowCount: number;
};

export type RemoteEndpointSummary = {
  remoteIp: string;
  hostnames: string[];
  tcp443BytesOut: number;
  tcp443BytesIn: number;
  udp443PacketsOut: number;
  udp443PacketsIn: number;
};

export type PcapngMetadataSummary = {
  packetCount: number;
  localIps: string[];
  dnsServers: string[];
  dnsQueries: DnsQuestionSummary[];
  tlsServerNames: TlsServerNameSummary[];
  remoteEndpoints: RemoteEndpointSummary[];
  playstationSignals: string[];
  sonySignals: string[];
};

type ParsedBlock = {
  blockType: number;
  body: Buffer;
};

type ParsedDnsQuestion = {
  name: string;
  qtype: number;
};

type ParsedDnsAnswer = {
  name: string;
  type: number;
  value?: string;
};

type ParsedDnsMessage = {
  isResponse: boolean;
  questions: ParsedDnsQuestion[];
  answers: ParsedDnsAnswer[];
};

type ParsedIpPacket = {
  srcIp: string;
  dstIp: string;
  protocol: 'tcp' | 'udp';
  srcPort: number;
  dstPort: number;
  payload: Buffer;
  ipByteLength: number;
  tcpSeq?: number;
};

type TcpFlowAccumulator = {
  srcIp: string;
  dstIp: string;
  dstPort: number;
  segments: Map<number, Buffer>;
  serverName?: string;
  stopped?: boolean;
};

type DnsQuestionAccumulator = {
  qtypes: Set<string>;
  count: number;
  servers: Set<string>;
};

type TlsServerNameAccumulator = {
  remoteIps: Set<string>;
  flowCount: number;
};

type RemoteEndpointAccumulator = {
  hostnames: Set<string>;
  tcp443BytesOut: number;
  tcp443BytesIn: number;
  udp443PacketsOut: number;
  udp443PacketsIn: number;
};

const PCAPNG_SECTION_HEADER_BLOCK = 0x0a0d0d0a;
const PCAPNG_ENHANCED_PACKET_BLOCK = 0x00000006;

const DNS_TYPE_LABELS = new Map<number, string>([
  [1, 'A'],
  [5, 'CNAME'],
  [28, 'AAAA'],
  [65, 'HTTPS']
]);

function uniqueSorted(values: Iterable<string>) {
  return [...new Set([...values].filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function toBuffer(bytes: Uint8Array | Buffer) {
  return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
}

function readPcapngBlocks(bytes: Buffer): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  let offset = 0;

  while (offset + 12 <= bytes.length) {
    const blockType = bytes.readUInt32LE(offset);
    const blockLength = bytes.readUInt32LE(offset + 4);
    if (blockLength < 12 || offset + blockLength > bytes.length) break;
    const body = bytes.subarray(offset + 8, offset + blockLength - 4);

    if (blockType === PCAPNG_SECTION_HEADER_BLOCK) {
      const byteOrderMagic = body.readUInt32LE(0);
      if (byteOrderMagic !== 0x1a2b3c4d) {
        throw new Error('Unsupported big-endian pcapng sections are not implemented');
      }
    }

    blocks.push({ blockType, body });
    offset += blockLength;
  }

  return blocks;
}

function dnsTypeLabel(type: number) {
  return DNS_TYPE_LABELS.get(type) ?? `TYPE${type}`;
}

export function isLocalIp(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map((part) => Number(part));
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    return normalized === '::1' || normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd');
  }

  return false;
}

function parseDnsName(payload: Buffer, offset: number, visited = new Set<number>()): { name: string; nextOffset: number } | null {
  const labels: string[] = [];
  let cursor = offset;

  while (cursor < payload.length) {
    if (visited.has(cursor)) return null;
    visited.add(cursor);

    const length = payload[cursor];
    if (length === 0) {
      cursor += 1;
      return { name: labels.join('.'), nextOffset: cursor };
    }

    if ((length & 0xc0) === 0xc0) {
      if (cursor + 1 >= payload.length) return null;
      const pointer = ((length & 0x3f) << 8) | payload[cursor + 1];
      const pointed = parseDnsName(payload, pointer, visited);
      if (!pointed) return null;
      labels.push(pointed.name);
      cursor += 2;
      return { name: labels.join('.'), nextOffset: cursor };
    }

    if (cursor + 1 + length > payload.length) return null;
    const label = payload.subarray(cursor + 1, cursor + 1 + length).toString('ascii');
    labels.push(label);
    cursor += 1 + length;
  }

  return null;
}

export function parseDnsMessage(payloadBytes: Uint8Array | Buffer, transport: 'udp' | 'tcp' = 'udp'): ParsedDnsMessage | null {
  const payload = toBuffer(payloadBytes);
  const bytes = transport === 'tcp' && payload.length >= 2 ? payload.subarray(2) : payload;
  if (bytes.length < 12) return null;

  const flags = bytes.readUInt16BE(2);
  const qdCount = bytes.readUInt16BE(4);
  const anCount = bytes.readUInt16BE(6);
  const nsCount = bytes.readUInt16BE(8);
  const arCount = bytes.readUInt16BE(10);
  if (qdCount > 64 || anCount > 128 || nsCount > 128 || arCount > 128) return null;

  let offset = 12;
  const questions: ParsedDnsQuestion[] = [];
  for (let index = 0; index < qdCount; index += 1) {
    const parsedName = parseDnsName(bytes, offset);
    if (!parsedName || parsedName.nextOffset + 4 > bytes.length) return null;
    const qtype = bytes.readUInt16BE(parsedName.nextOffset);
    questions.push({ name: parsedName.name, qtype });
    offset = parsedName.nextOffset + 4;
  }

  const answers: ParsedDnsAnswer[] = [];
  for (let index = 0; index < anCount; index += 1) {
    const parsedName = parseDnsName(bytes, offset);
    if (!parsedName || parsedName.nextOffset + 10 > bytes.length) return null;

    const type = bytes.readUInt16BE(parsedName.nextOffset);
    const dataLength = bytes.readUInt16BE(parsedName.nextOffset + 8);
    const dataOffset = parsedName.nextOffset + 10;
    if (dataOffset + dataLength > bytes.length) return null;

    let value: string | undefined;
    if (type === 1 && dataLength === 4) {
      value = [...bytes.subarray(dataOffset, dataOffset + 4)].join('.');
    } else if (type === 28 && dataLength === 16) {
      const parts: string[] = [];
      for (let cursor = dataOffset; cursor < dataOffset + 16; cursor += 2) {
        parts.push(bytes.readUInt16BE(cursor).toString(16));
      }
      value = parts.join(':');
    } else if (type === 5) {
      const parsedValue = parseDnsName(bytes, dataOffset);
      value = parsedValue?.name;
    }

    answers.push({ name: parsedName.name, type, value });
    offset = dataOffset + dataLength;
  }

  return {
    isResponse: (flags & 0x8000) !== 0,
    questions,
    answers
  };
}

export function extractTlsServerName(payloadBytes: Uint8Array | Buffer): string | null {
  const payload = toBuffer(payloadBytes);
  if (payload.length < 5) return null;
  if (payload[0] !== 22) return null;

  const recordLength = payload.readUInt16BE(3);
  if (payload.length < 5 + recordLength) return null;
  const handshake = payload.subarray(5, 5 + recordLength);
  if (handshake.length < 4 || handshake[0] !== 1) return null;

  const handshakeLength = (handshake[1] << 16) | (handshake[2] << 8) | handshake[3];
  if (handshake.length < 4 + handshakeLength) return null;

  let offset = 4;
  if (offset + 2 + 32 > handshake.length) return null;
  offset += 2 + 32;

  if (offset + 1 > handshake.length) return null;
  const sessionIdLength = handshake[offset];
  offset += 1 + sessionIdLength;

  if (offset + 2 > handshake.length) return null;
  const cipherSuiteLength = handshake.readUInt16BE(offset);
  offset += 2 + cipherSuiteLength;

  if (offset + 1 > handshake.length) return null;
  const compressionMethodLength = handshake[offset];
  offset += 1 + compressionMethodLength;

  if (offset + 2 > handshake.length) return null;
  const extensionsLength = handshake.readUInt16BE(offset);
  offset += 2;
  const extensionEnd = Math.min(offset + extensionsLength, handshake.length);

  while (offset + 4 <= extensionEnd) {
    const extensionType = handshake.readUInt16BE(offset);
    const extensionLength = handshake.readUInt16BE(offset + 2);
    offset += 4;
    if (offset + extensionLength > extensionEnd) break;

    if (extensionType === 0) {
      const extension = handshake.subarray(offset, offset + extensionLength);
      if (extension.length < 2) return null;

      let nameOffset = 2;
      while (nameOffset + 3 <= extension.length) {
        const nameType = extension[nameOffset];
        const nameLength = extension.readUInt16BE(nameOffset + 1);
        nameOffset += 3;
        if (nameOffset + nameLength > extension.length) break;
        if (nameType === 0) {
          return extension.subarray(nameOffset, nameOffset + nameLength).toString('ascii');
        }
        nameOffset += nameLength;
      }
    }

    offset += extensionLength;
  }

  return null;
}

function parseIPv4Packet(frame: Buffer, offset: number): ParsedIpPacket | null {
  if (frame.length < offset + 20) return null;
  const versionAndHeaderLength = frame[offset];
  const headerLength = (versionAndHeaderLength & 0x0f) * 4;
  if (headerLength < 20 || frame.length < offset + headerLength) return null;

  const totalLength = frame.readUInt16BE(offset + 2);
  const protocol = frame[offset + 9];
  const srcIp = [...frame.subarray(offset + 12, offset + 16)].join('.');
  const dstIp = [...frame.subarray(offset + 16, offset + 20)].join('.');
  const payload = frame.subarray(offset + headerLength, Math.min(offset + totalLength, frame.length));

  return parseTransportPacket(srcIp, dstIp, protocol, payload, totalLength);
}

function parseIPv6Address(bytes: Buffer) {
  const segments: string[] = [];
  for (let offset = 0; offset < 16; offset += 2) {
    segments.push(bytes.readUInt16BE(offset).toString(16));
  }
  return segments.join(':');
}

function parseIPv6Packet(frame: Buffer, offset: number): ParsedIpPacket | null {
  if (frame.length < offset + 40) return null;
  const payloadLength = frame.readUInt16BE(offset + 4);
  const nextHeader = frame[offset + 6];
  const srcIp = parseIPv6Address(frame.subarray(offset + 8, offset + 24));
  const dstIp = parseIPv6Address(frame.subarray(offset + 24, offset + 40));
  const payload = frame.subarray(offset + 40, Math.min(offset + 40 + payloadLength, frame.length));

  return parseTransportPacket(srcIp, dstIp, nextHeader, payload, payloadLength + 40);
}

function parseTransportPacket(srcIp: string, dstIp: string, protocol: number, payload: Buffer, ipByteLength: number): ParsedIpPacket | null {
  if (protocol === 17) {
    if (payload.length < 8) return null;
    const srcPort = payload.readUInt16BE(0);
    const dstPort = payload.readUInt16BE(2);
    const length = payload.readUInt16BE(4);
    return {
      srcIp,
      dstIp,
      protocol: 'udp',
      srcPort,
      dstPort,
      payload: payload.subarray(8, Math.min(length, payload.length)),
      ipByteLength
    };
  }

  if (protocol === 6) {
    if (payload.length < 20) return null;
    const srcPort = payload.readUInt16BE(0);
    const dstPort = payload.readUInt16BE(2);
    const tcpSeq = payload.readUInt32BE(4);
    const dataOffset = (payload[12] >> 4) * 4;
    if (dataOffset < 20 || payload.length < dataOffset) return null;
    return {
      srcIp,
      dstIp,
      protocol: 'tcp',
      srcPort,
      dstPort,
      payload: payload.subarray(dataOffset),
      ipByteLength,
      tcpSeq
    };
  }

  return null;
}

function parseEthernetFrame(frame: Buffer): ParsedIpPacket | null {
  if (frame.length < 14) return null;

  let etherType = frame.readUInt16BE(12);
  let offset = 14;
  if (etherType === 0x8100 && frame.length >= 18) {
    etherType = frame.readUInt16BE(16);
    offset = 18;
  }

  if (etherType === 0x0800) return parseIPv4Packet(frame, offset);
  if (etherType === 0x86dd) return parseIPv6Packet(frame, offset);
  return null;
}

function upsertSetMap(map: Map<string, Set<string>>, key: string, value: string) {
  const values = map.get(key) ?? new Set<string>();
  values.add(value);
  map.set(key, values);
}

function tryResolveTlsServerName(flow: TcpFlowAccumulator) {
  if (flow.serverName || flow.stopped || flow.segments.size === 0) return;

  const orderedSegments = [...flow.segments.entries()].sort((a, b) => a[0] - b[0]);
  let expectedSeq = orderedSegments[0][0];
  const chunks: Buffer[] = [];
  let accumulatedLength = 0;

  for (const [seq, payload] of orderedSegments) {
    if (accumulatedLength > 65535) {
      flow.stopped = true;
      return;
    }

    if (seq > expectedSeq && chunks.length > 0) {
      break;
    }

    let nextChunk = payload;
    if (seq < expectedSeq) {
      const overlap = expectedSeq - seq;
      nextChunk = overlap < payload.length ? payload.subarray(overlap) : Buffer.alloc(0);
    }

    if (nextChunk.length > 0) {
      chunks.push(nextChunk);
      accumulatedLength += nextChunk.length;
    }
    expectedSeq = Math.max(expectedSeq, seq + payload.length);

    const serverName = extractTlsServerName(Buffer.concat(chunks));
    if (serverName) {
      flow.serverName = serverName;
      flow.segments.clear();
      return;
    }
  }
}

export function summarizePcapngMetadata(bytes: Uint8Array | Buffer): PcapngMetadataSummary {
  const blocks = readPcapngBlocks(toBuffer(bytes));
  const localIpCounts = new Map<string, number>();
  const dnsServerIps = new Set<string>();
  const dnsQuestionSummaries = new Map<string, DnsQuestionAccumulator>();
  const hostnameByIp = new Map<string, Set<string>>();
  const tlsServerNames = new Map<string, TlsServerNameAccumulator>();
  const remoteEndpoints = new Map<string, RemoteEndpointAccumulator>();
  const tcpFlows = new Map<string, TcpFlowAccumulator>();

  let packetCount = 0;

  for (const block of blocks) {
    if (block.blockType !== PCAPNG_ENHANCED_PACKET_BLOCK) continue;
    if (block.body.length < 20) continue;

    const capturedLength = block.body.readUInt32LE(12);
    const packetBytes = block.body.subarray(20, 20 + capturedLength);
    const packet = parseEthernetFrame(packetBytes);
    if (!packet) continue;
    packetCount += 1;

    if (isLocalIp(packet.srcIp)) {
      localIpCounts.set(packet.srcIp, (localIpCounts.get(packet.srcIp) ?? 0) + 1);
    }
    if (isLocalIp(packet.dstIp)) {
      localIpCounts.set(packet.dstIp, (localIpCounts.get(packet.dstIp) ?? 0) + 1);
    }

    const srcIsLocal = isLocalIp(packet.srcIp);
    const dstIsLocal = isLocalIp(packet.dstIp);
    const remoteIp = srcIsLocal && !dstIsLocal ? packet.dstIp : !srcIsLocal && dstIsLocal ? packet.srcIp : undefined;
    if (remoteIp) {
      const summary = remoteEndpoints.get(remoteIp) ?? {
        hostnames: new Set<string>(),
        tcp443BytesOut: 0,
        tcp443BytesIn: 0,
        udp443PacketsOut: 0,
        udp443PacketsIn: 0
      };

      if (packet.protocol === 'tcp' && packet.dstPort === 443 && srcIsLocal) {
        summary.tcp443BytesOut += packet.ipByteLength;
      }
      if (packet.protocol === 'tcp' && packet.srcPort === 443 && dstIsLocal) {
        summary.tcp443BytesIn += packet.ipByteLength;
      }
      if (packet.protocol === 'udp' && packet.dstPort === 443 && srcIsLocal) {
        summary.udp443PacketsOut += 1;
      }
      if (packet.protocol === 'udp' && packet.srcPort === 443 && dstIsLocal) {
        summary.udp443PacketsIn += 1;
      }

      remoteEndpoints.set(remoteIp, summary);
    }

    if (packet.protocol === 'udp' || packet.protocol === 'tcp') {
      const dnsTransport = packet.protocol;
      if (packet.dstPort === 53 && srcIsLocal) {
        dnsServerIps.add(packet.dstIp);
        const message = parseDnsMessage(packet.payload, dnsTransport);
        if (message) {
          for (const question of message.questions) {
            const summary = dnsQuestionSummaries.get(question.name) ?? {
              qtypes: new Set<string>(),
              count: 0,
              servers: new Set<string>()
            };
            summary.qtypes.add(dnsTypeLabel(question.qtype));
            summary.count += 1;
            summary.servers.add(packet.dstIp);
            dnsQuestionSummaries.set(question.name, summary);
          }
        }
      }

      if (packet.srcPort === 53 && dstIsLocal) {
        const message = parseDnsMessage(packet.payload, dnsTransport);
        if (message?.isResponse) {
          for (const answer of message.answers) {
            if (!answer.value) continue;
            upsertSetMap(hostnameByIp, answer.value, answer.name);
          }
        }
      }
    }

    if (packet.protocol === 'tcp' && srcIsLocal && packet.dstPort === 443 && packet.payload.length > 0 && typeof packet.tcpSeq === 'number') {
      const flowKey = `${packet.srcIp}:${packet.srcPort}->${packet.dstIp}:${packet.dstPort}`;
      const flow =
        tcpFlows.get(flowKey) ??
        ({
          srcIp: packet.srcIp,
          dstIp: packet.dstIp,
          dstPort: packet.dstPort,
          segments: new Map<number, Buffer>()
        } satisfies TcpFlowAccumulator);

      if (!flow.serverName && !flow.stopped) {
        flow.segments.set(packet.tcpSeq, packet.payload);
        tryResolveTlsServerName(flow);
        if (flow.serverName) {
          upsertSetMap(hostnameByIp, flow.dstIp, flow.serverName);
          const summary = tlsServerNames.get(flow.serverName) ?? { remoteIps: new Set<string>(), flowCount: 0 };
          summary.remoteIps.add(flow.dstIp);
          summary.flowCount += 1;
          tlsServerNames.set(flow.serverName, summary);
        }
      }

      tcpFlows.set(flowKey, flow);
    }
  }

  for (const [remoteIp, names] of hostnameByIp.entries()) {
    const remoteEndpoint = remoteEndpoints.get(remoteIp);
    if (!remoteEndpoint) continue;
    for (const name of names) remoteEndpoint.hostnames.add(name);
  }

  const allHostnames = uniqueSorted([
    ...dnsQuestionSummaries.keys(),
    ...tlsServerNames.keys(),
    ...[...remoteEndpoints.values()].flatMap((summary) => [...summary.hostnames])
  ]);

  return {
    packetCount,
    localIps: [...localIpCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([ip]) => ip),
    dnsServers: uniqueSorted(dnsServerIps),
    dnsQueries: [...dnsQuestionSummaries.entries()]
      .map(([name, summary]) => ({
        name,
        qtypes: uniqueSorted(summary.qtypes),
        count: summary.count,
        servers: uniqueSorted(summary.servers)
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    tlsServerNames: [...tlsServerNames.entries()]
      .map(([serverName, summary]) => ({
        serverName,
        remoteIps: uniqueSorted(summary.remoteIps),
        flowCount: summary.flowCount
      }))
      .sort((a, b) => a.serverName.localeCompare(b.serverName)),
    remoteEndpoints: [...remoteEndpoints.entries()]
      .map(([remoteIp, summary]) => ({
        remoteIp,
        hostnames: uniqueSorted(summary.hostnames),
        tcp443BytesOut: summary.tcp443BytesOut,
        tcp443BytesIn: summary.tcp443BytesIn,
        udp443PacketsOut: summary.udp443PacketsOut,
        udp443PacketsIn: summary.udp443PacketsIn
      }))
      .filter(
        (summary) =>
          summary.tcp443BytesOut > 0 ||
          summary.tcp443BytesIn > 0 ||
          summary.udp443PacketsOut > 0 ||
          summary.udp443PacketsIn > 0
      )
      .sort((a, b) => {
        const aBytes = a.tcp443BytesOut + a.tcp443BytesIn;
        const bBytes = b.tcp443BytesOut + b.tcp443BytesIn;
        return bBytes - aBytes || a.remoteIp.localeCompare(b.remoteIp);
      }),
    playstationSignals: allHostnames.filter((value) => /playstation|psnow/i.test(value)),
    sonySignals: allHostnames.filter((value) => /sony/i.test(value))
  };
}
