#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <pcap-file>" >&2
  exit 1
fi

PCAP_FILE="$1"
if [[ ! -f "$PCAP_FILE" ]]; then
  echo "Missing pcap: $PCAP_FILE" >&2
  exit 1
fi

if ! command -v tshark >/dev/null 2>&1; then
  echo "tshark is required for pcap summaries." >&2
  echo "Install Wireshark/tshark, then rerun." >&2
  exit 1
fi

echo "== Endpoints (IP conversations) =="
tshark -r "$PCAP_FILE" -q -z conv,ip | sed -n '1,80p'
echo

echo "== DNS queries =="
tshark -r "$PCAP_FILE" -Y 'dns.qry.name' -T fields -e frame.time_relative -e ip.dst -e dns.qry.name 2>/dev/null | head -n 80

echo
if tshark -r "$PCAP_FILE" -Y 'tls.handshake.extensions_server_name' -c 1 >/dev/null 2>&1; then
  echo "== TLS SNI =="
  tshark -r "$PCAP_FILE" -Y 'tls.handshake.extensions_server_name' -T fields -e frame.time_relative -e ip.dst -e tls.handshake.extensions_server_name 2>/dev/null | sort -u | head -n 120
  echo
fi

if tshark -r "$PCAP_FILE" -Y 'quic' -c 1 >/dev/null 2>&1; then
  echo "== QUIC packets observed =="
  tshark -r "$PCAP_FILE" -Y 'quic' -T fields -e frame.time_relative -e ip.dst -e udp.dstport 2>/dev/null | head -n 80
  echo
fi

echo "Summary complete for $PCAP_FILE"
