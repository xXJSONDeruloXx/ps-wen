import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveArtifactPath } from '../lib/env.js';
import { summarizePcapngMetadata } from '../lib/pcapng-metadata.js';

function defaultOutputPath(inputPath: string) {
  return inputPath.replace(/\.pcapng$/i, '.summary.json');
}

async function main() {
  const inputPath = resolveArtifactPath(process.argv[2], 'artifacts/network/capture.pcapng');
  const outputPath = resolveArtifactPath(process.argv[3], defaultOutputPath(inputPath));

  const bytes = await fs.readFile(inputPath);
  const summary = summarizePcapngMetadata(bytes);
  const output = {
    generatedAt: new Date().toISOString(),
    source: inputPath,
    ...summary
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${outputPath}`);
  console.log(`Packets: ${summary.packetCount}`);
  console.log(`Local IPs: ${summary.localIps.join(', ') || '(none)'}`);
  console.log(`DNS servers: ${summary.dnsServers.join(', ') || '(none)'}`);
  console.log('');

  console.log('== DNS queries ==');
  for (const entry of summary.dnsQueries.slice(0, 80)) {
    console.log(`${entry.name} [${entry.qtypes.join(', ')}] x${entry.count}`);
  }
  if (summary.dnsQueries.length === 0) {
    console.log('(none)');
  }
  console.log('');

  console.log('== TLS SNI ==');
  for (const entry of summary.tlsServerNames.slice(0, 80)) {
    console.log(`${entry.serverName} -> ${entry.remoteIps.join(', ')} (flows=${entry.flowCount})`);
  }
  if (summary.tlsServerNames.length === 0) {
    console.log('(none)');
  }
  console.log('');

  console.log('== Remote 443 endpoints ==');
  for (const entry of summary.remoteEndpoints.slice(0, 80)) {
    console.log(
      `${entry.remoteIp} hosts=[${entry.hostnames.join(', ')}] tcpOut=${entry.tcp443BytesOut} tcpIn=${entry.tcp443BytesIn} udpOut=${entry.udp443PacketsOut} udpIn=${entry.udp443PacketsIn}`
    );
  }
  if (summary.remoteEndpoints.length === 0) {
    console.log('(none)');
  }
  console.log('');

  console.log('== High-volume transport candidates ==');
  for (const entry of summary.transportCandidates.slice(0, 40)) {
    console.log(
      `${entry.protocol.toUpperCase()} ${entry.remoteIp}:${entry.remotePort} hosts=[${entry.hostnames.join(', ')}] bytesOut=${entry.bytesOut} bytesIn=${entry.bytesIn} packetsOut=${entry.packetsOut} packetsIn=${entry.packetsIn}`
    );
  }
  if (summary.transportCandidates.length === 0) {
    console.log('(none)');
  }
  console.log('');

  console.log('== PlayStation / Sony signals ==');
  const signals = [...summary.playstationSignals, ...summary.sonySignals.filter((value) => !summary.playstationSignals.includes(value))];
  for (const value of signals) {
    console.log(value);
  }
  if (signals.length === 0) {
    console.log('(none)');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
