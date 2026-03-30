#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

INTERFACE="${CAPTURE_INTERFACE:-en0}"
DURATION="${CAPTURE_DURATION:-180}"
FILTER="${CAPTURE_FILTER:-tcp port 443 or udp port 443 or port 53}"
OUT_DIR="$ROOT_DIR/artifacts/network"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$OUT_DIR/ps-cloud-metadata-$TIMESTAMP.pcap"

mkdir -p "$OUT_DIR"

if ! command -v tcpdump >/dev/null 2>&1; then
  echo "tcpdump is required." >&2
  exit 1
fi

echo "[ps-wen] Capturing local metadata"
echo "  interface: $INTERFACE"
echo "  duration : $DURATION seconds"
echo "  filter   : $FILTER"
echo "  output   : $OUT_FILE"
echo
echo "Use this while exercising the client on your device."
echo

CMD=(tcpdump -i "$INTERFACE" -w "$OUT_FILE" "$FILTER")
if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  CMD=(sudo "${CMD[@]}")
fi

set +e
"${CMD[@]}" &
TCPDUMP_PID=$!
set -e

cleanup() {
  if kill -0 "$TCPDUMP_PID" >/dev/null 2>&1; then
    kill -INT "$TCPDUMP_PID" >/dev/null 2>&1 || true
    wait "$TCPDUMP_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

sleep "$DURATION"
cleanup
trap - EXIT

echo
echo "Saved capture to: $OUT_FILE"
echo "Next: npm run summarize:metadata -- $OUT_FILE"
