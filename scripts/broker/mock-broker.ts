import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import net from 'node:net';

type ParsedArgs = {
  flags: Record<string, string | true>;
};

type JsonRecord = Record<string, unknown>;

type CommandStats = Record<string, number>;

type BrokerState = {
  startedAt: string;
  host: string;
  port: number;
  logPath: string;
  statePath: string;
  mockClientIds: {
    gkClientId: string;
    ps3GKClientID: string;
    streamServerClientId: string;
  };
  activeConnections: number;
  totalConnections: number;
  totalMessagesIn: number;
  totalMessagesOut: number;
  commandCounts: CommandStats;
  lastSettings: unknown | null;
  lastAuthCodes: unknown | null;
  lastTitleInfo: unknown | null;
  lastRequestGame: unknown | null;
  lastStartGameAt: string | null;
  lastStopAt: string | null;
  lastCommand: string | null;
  lastInboundText: string | null;
  lastOutboundText: string | null;
  lastTarget: string | null;
  recentlySeenCommands: string[];
};

type Connection = {
  id: string;
  socket: net.Socket;
  buffer: Buffer;
  remoteAddress: string;
  remotePort: number;
};

type ParsedFrame = {
  fin: boolean;
  opcode: number;
  payload: Buffer;
  remaining: Buffer;
};

type LogEntry = {
  ts: string;
  connectionId: string;
  direction: 'in' | 'out' | 'lifecycle';
  kind: 'text' | 'binary' | 'event' | 'info';
  sizeBytes?: number;
  text?: string;
  json?: unknown;
  note?: string;
  remoteAddress?: string;
  remotePort?: number;
};

function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineVal] = token.slice(2).split('=', 2);
    if (inlineVal !== undefined) {
      flags[rawKey] = inlineVal;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      flags[rawKey] = true;
      continue;
    }
    flags[rawKey] = next;
    i++;
  }
  return { flags };
}

function ensureNumber(value: string | true | undefined, fallback: number) {
  if (typeof value !== 'string') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asPath(value: string | true | undefined, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function usage(): never {
  throw new Error(
    [
      'Usage:',
      '  npm run broker:emulator',
      '  npm run broker:emulator -- --host localhost --port 1235',
      '  npm run broker:emulator -- --out artifacts/broker/mock-broker-session.jsonl --state-out artifacts/broker/mock-broker-state.json',
      '  npm run broker:emulator -- --gk-client-id <id> --ps3-client-id <id> --stream-client-id <id>',
      '',
      'Starts a local mock PlayStation Plus broker on ws://localhost:1235/ by default.',
      'Logs all inbound/outbound frames to JSONL and stores the latest mock state in JSON.',
    ].join('\n')
  );
}

function safeJsonParse(text: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function uniqueRecent(values: string[], next: string, max = 20) {
  const filtered = values.filter((value) => value !== next);
  filtered.push(next);
  return filtered.slice(-max);
}

function computeAcceptKey(secWebSocketKey: string) {
  return crypto
    .createHash('sha1')
    .update(secWebSocketKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11', 'utf8')
    .digest('base64');
}

function encodeTextFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  if (len < 126) {
    return Buffer.concat([Buffer.from([0x81, len]), payload]);
  }
  if (len < 65536) {
    const header = Buffer.allocUnsafe(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
    return Buffer.concat([header, payload]);
  }
  const header = Buffer.allocUnsafe(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeUInt32BE(Math.floor(len / 2 ** 32), 2);
  header.writeUInt32BE(len >>> 0, 6);
  return Buffer.concat([header, payload]);
}

function encodeControlFrame(opcode: 0x8 | 0x9 | 0xa, payload: Uint8Array = new Uint8Array()): Buffer {
  const payloadBuffer = Buffer.from(payload);
  const len = payloadBuffer.length;
  if (len >= 126) {
    throw new Error('Control frames must be <126 bytes');
  }
  return Buffer.concat([Buffer.from([0x80 | opcode, len]), payloadBuffer]);
}

function tryParseFrame(buffer: Buffer): ParsedFrame | null {
  if (buffer.length < 2) return null;
  const first = buffer[0];
  const second = buffer[1];
  const fin = Boolean(first & 0x80);
  const opcode = first & 0x0f;
  const masked = Boolean(second & 0x80);
  let payloadLen = second & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (buffer.length < 4) return null;
    payloadLen = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buffer.length < 10) return null;
    const high = buffer.readUInt32BE(2);
    const low = buffer.readUInt32BE(6);
    payloadLen = high * 2 ** 32 + low;
    offset = 10;
  }

  if (!Number.isSafeInteger(payloadLen) || payloadLen < 0) {
    throw new Error(`Invalid WebSocket payload length: ${payloadLen}`);
  }

  let mask: Buffer | null = null;
  if (masked) {
    if (buffer.length < offset + 4) return null;
    mask = buffer.subarray(offset, offset + 4);
    offset += 4;
  }

  if (buffer.length < offset + payloadLen) return null;
  const payload = Buffer.from(buffer.subarray(offset, offset + payloadLen));
  if (mask) {
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= mask[i % 4];
    }
  }

  return {
    fin,
    opcode,
    payload,
    remaining: buffer.subarray(offset + payloadLen),
  };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.flags.help) usage();

  const host = typeof parsed.flags.host === 'string' ? parsed.flags.host : 'localhost';
  const port = ensureNumber(parsed.flags.port, 1235);
  const logPath = path.resolve(asPath(parsed.flags.out, 'artifacts/broker/mock-broker-session.jsonl'));
  const statePath = path.resolve(asPath(parsed.flags['state-out'], 'artifacts/broker/mock-broker-state.json'));

  await fsp.mkdir(path.dirname(logPath), { recursive: true });
  await fsp.mkdir(path.dirname(statePath), { recursive: true });

  const logStream = fs.createWriteStream(logPath, { flags: 'a' });

  const state: BrokerState = {
    startedAt: new Date().toISOString(),
    host,
    port,
    logPath,
    statePath,
    mockClientIds: {
      gkClientId: typeof parsed.flags['gk-client-id'] === 'string' ? parsed.flags['gk-client-id'] : crypto.randomUUID(),
      ps3GKClientID: typeof parsed.flags['ps3-client-id'] === 'string' ? parsed.flags['ps3-client-id'] : crypto.randomUUID(),
      streamServerClientId:
        typeof parsed.flags['stream-client-id'] === 'string' ? parsed.flags['stream-client-id'] : crypto.randomUUID(),
    },
    activeConnections: 0,
    totalConnections: 0,
    totalMessagesIn: 0,
    totalMessagesOut: 0,
    commandCounts: {},
    lastSettings: null,
    lastAuthCodes: null,
    lastTitleInfo: null,
    lastRequestGame: null,
    lastStartGameAt: null,
    lastStopAt: null,
    lastCommand: null,
    lastInboundText: null,
    lastOutboundText: null,
    lastTarget: null,
    recentlySeenCommands: [],
  };

  const activeConnections = new Map<string, Connection>();

  async function writeState() {
    await fsp.writeFile(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
  }

  function appendLog(entry: LogEntry) {
    logStream.write(JSON.stringify(entry) + '\n');
    const summary = `${entry.ts} [${entry.connectionId}] ${entry.direction}/${entry.kind}` +
      (entry.text ? ` ${entry.text.slice(0, 180)}` : entry.note ? ` ${entry.note}` : '');
    console.log(summary);
  }

  function sendText(connection: Connection, json: JsonRecord | string, kind: LogEntry['kind'] = 'text') {
    const text = typeof json === 'string' ? json : JSON.stringify(json);
    connection.socket.write(encodeTextFrame(text));
    state.totalMessagesOut += 1;
    state.lastOutboundText = text;
    appendLog({
      ts: new Date().toISOString(),
      connectionId: connection.id,
      direction: 'out',
      kind,
      sizeBytes: Buffer.byteLength(text),
      text,
      json: typeof json === 'string' ? safeJsonParse(json) : json,
    });
    void writeState();
  }

  function sendEvent(connection: Connection, name: string, payload: unknown = {}, code: string | number = 1) {
    sendText(connection, { name, code, payload }, 'event');
  }

  function recordCommand(command: string, target: string | null, text: string) {
    state.commandCounts[command] = (state.commandCounts[command] ?? 0) + 1;
    state.lastCommand = command;
    state.lastTarget = target;
    state.lastInboundText = text;
    state.recentlySeenCommands = uniqueRecent(state.recentlySeenCommands, command);
  }

  function ack(connection: Connection, command: string, extra: JsonRecord = {}) {
    sendText(connection, { result: true, command, mocked: true, ...extra });
  }

  function normalizeObject(value: unknown): JsonRecord {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
  }

  function handleCommand(connection: Connection, command: string, params: unknown, target: string | null) {
    switch (command) {
      case 'testConnection': {
        ack(connection, command, { mode: 'testConnection' });
        sendEvent(connection, 'PROCESS_END', { command, ok: true, mocked: true }, 1);
        return;
      }
      case 'requestClientId': {
        sendEvent(connection, 'GOT_CLIENT_ID', {
          ...state.mockClientIds,
          clientId: state.mockClientIds.gkClientId,
          ps3GkClientId: state.mockClientIds.ps3GKClientID,
        });
        sendEvent(connection, 'PROCESS_END', { command, ok: true, mocked: true }, 1);
        return;
      }
      case 'setSettings': {
        const settings = normalizeObject(params);
        state.lastSettings = settings;
        ack(connection, command, { appliedKeys: Object.keys(settings) });
        sendEvent(connection, 'PROCESS_END', { command, ok: true, mocked: true }, 1);
        return;
      }
      case 'setAuthCodes': {
        const authCodes = normalizeObject(params);
        state.lastAuthCodes = authCodes;
        ack(connection, command, { receivedKeys: Object.keys(authCodes) });
        sendEvent(connection, 'PROCESS_END', { command, ok: true, mocked: true }, 1);
        return;
      }
      case 'setTitleInfo': {
        const titleInfo = normalizeObject(params);
        state.lastTitleInfo = titleInfo;
        ack(connection, command, { receivedKeys: Object.keys(titleInfo) });
        sendEvent(connection, 'PROCESS_END', { command, ok: true, mocked: true }, 1);
        return;
      }
      case 'requestGame': {
        state.lastRequestGame = params ?? null;
        const forceLogout = typeof params === 'boolean'
          ? params
          : Boolean(normalizeObject(params).forceLogout);
        ack(connection, command, { forceLogout });
        sendEvent(connection, 'launchResponse', { mocked: true, forceLogout, target }, '002.0007');
        sendEvent(connection, 'GOT_LAUNCH_SPEC', { mocked: true, forceLogout, target }, '002.0006');
        sendEvent(connection, 'PROCESS_END', { command, ok: true, mocked: true }, 1);
        return;
      }
      case 'startGame': {
        state.lastStartGameAt = new Date().toISOString();
        ack(connection, command);
        sendEvent(connection, 'sessionStart', { mocked: true, status: 'Streaming' }, '002.0001');
        sendEvent(connection, 'VIDEO_START', { mocked: true, status: 'Streaming' }, '022.0015');
        sendEvent(connection, 'IS_STREAMING', { isStreaming: 'true' }, 'isStreaming');
        return;
      }
      case 'stop': {
        state.lastStopAt = new Date().toISOString();
        ack(connection, command);
        sendEvent(connection, 'PROCESS_END', { command, ok: true, mocked: true }, 1);
        return;
      }
      case 'isStreaming': {
        ack(connection, command, { value: Boolean(state.lastStartGameAt && state.lastStartGameAt !== state.lastStopAt) });
        return;
      }
      case 'isQueued': {
        ack(connection, command, { value: false });
        return;
      }
      case 'getVersion': {
        ack(connection, command, { version: 'mock-broker/0.1.0' });
        return;
      }
      default: {
        ack(connection, command, { note: 'No specialized handler registered; returning a generic mocked success.' });
      }
    }
  }

  function handleText(connection: Connection, text: string) {
    state.totalMessagesIn += 1;
    const parsedJson = safeJsonParse(text);
    appendLog({
      ts: new Date().toISOString(),
      connectionId: connection.id,
      direction: 'in',
      kind: 'text',
      sizeBytes: Buffer.byteLength(text),
      text,
      json: parsedJson,
      remoteAddress: connection.remoteAddress,
      remotePort: connection.remotePort,
    });

    const obj = parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)
      ? (parsedJson as JsonRecord)
      : null;

    const command = obj && typeof obj.command === 'string' ? obj.command : null;
    const target = obj && typeof obj.target === 'string' ? obj.target : null;

    if (!command) {
      sendText(connection, { result: true, mocked: true, note: 'Received non-command payload', received: parsedJson ?? text });
      return;
    }

    recordCommand(command, target, text);
    handleCommand(connection, command, obj?.params, target);
    void writeState();
  }

  function handleFrame(connection: Connection, frame: ParsedFrame) {
    if (!frame.fin) {
      appendLog({
        ts: new Date().toISOString(),
        connectionId: connection.id,
        direction: 'lifecycle',
        kind: 'info',
        note: 'Fragmented WebSocket frame received; closing unsupported connection.',
      });
      connection.socket.end(encodeControlFrame(0x8));
      return;
    }

    if (frame.opcode === 0x1) {
      handleText(connection, frame.payload.toString('utf8'));
      return;
    }

    if (frame.opcode === 0x8) {
      appendLog({
        ts: new Date().toISOString(),
        connectionId: connection.id,
        direction: 'lifecycle',
        kind: 'info',
        note: 'Close frame received from client.',
      });
      connection.socket.end(encodeControlFrame(0x8));
      return;
    }

    if (frame.opcode === 0x9) {
      connection.socket.write(encodeControlFrame(0xA, frame.payload));
      appendLog({
        ts: new Date().toISOString(),
        connectionId: connection.id,
        direction: 'out',
        kind: 'info',
        note: 'Pong sent in response to ping.',
      });
      return;
    }

    if (frame.opcode === 0xA) {
      appendLog({
        ts: new Date().toISOString(),
        connectionId: connection.id,
        direction: 'lifecycle',
        kind: 'info',
        note: 'Pong received.',
      });
      return;
    }

    appendLog({
      ts: new Date().toISOString(),
      connectionId: connection.id,
      direction: 'in',
      kind: 'binary',
      sizeBytes: frame.payload.length,
      note: `Unsupported opcode ${frame.opcode}; ignoring payload.`,
    });
  }

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify(
        {
          ok: true,
          mocked: true,
          protocol: 'ws',
          broker: `ws://${host}:${port}/`,
          statePath,
          logPath,
          mockClientIds: state.mockClientIds,
        },
        null,
        2
      ) + '\n'
    );
  });

  server.on('upgrade', (req, socket, head) => {
    const rawSocket = socket as net.Socket;
    const secKey = req.headers['sec-websocket-key'];
    if (typeof secKey !== 'string' || !secKey) {
      rawSocket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      rawSocket.destroy();
      return;
    }

    const acceptKey = computeAcceptKey(secKey);
    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '\r\n',
    ];
    rawSocket.write(headers.join('\r\n'));
    rawSocket.setNoDelay(true);

    const connection: Connection = {
      id: crypto.randomUUID(),
      socket: rawSocket,
      buffer: head && head.length ? Buffer.from(head) : Buffer.alloc(0),
      remoteAddress: rawSocket.remoteAddress ?? 'unknown',
      remotePort: rawSocket.remotePort ?? 0,
    };

    activeConnections.set(connection.id, connection);
    state.activeConnections = activeConnections.size;
    state.totalConnections += 1;

    appendLog({
      ts: new Date().toISOString(),
      connectionId: connection.id,
      direction: 'lifecycle',
      kind: 'info',
      note: `Client connected via upgrade ${req.url ?? '/'} .`,
      remoteAddress: connection.remoteAddress,
      remotePort: connection.remotePort,
    });
    void writeState();

    const processBuffer = () => {
      while (true) {
        let frame: ParsedFrame | null;
        try {
          frame = tryParseFrame(connection.buffer);
        } catch (error) {
          appendLog({
            ts: new Date().toISOString(),
            connectionId: connection.id,
            direction: 'lifecycle',
            kind: 'info',
            note: `Frame parse error: ${error instanceof Error ? error.message : String(error)}`,
          });
          connection.socket.destroy();
          return;
        }
        if (!frame) return;
        connection.buffer = frame.remaining;
        handleFrame(connection, frame);
      }
    };

    if (connection.buffer.length) processBuffer();

    rawSocket.on('data', (chunk) => {
      connection.buffer = Buffer.concat([connection.buffer, Buffer.from(chunk)]);
      processBuffer();
    });

    rawSocket.on('close', () => {
      activeConnections.delete(connection.id);
      state.activeConnections = activeConnections.size;
      appendLog({
        ts: new Date().toISOString(),
        connectionId: connection.id,
        direction: 'lifecycle',
        kind: 'info',
        note: 'Client socket closed.',
      });
      void writeState();
    });

    rawSocket.on('error', (error) => {
      appendLog({
        ts: new Date().toISOString(),
        connectionId: connection.id,
        direction: 'lifecycle',
        kind: 'info',
        note: `Socket error: ${error.message}`,
      });
    });
  });

  server.on('clientError', (error, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    console.error('[mock-broker] clientError:', error.message);
  });

  await writeState();

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });

  console.log(`[mock-broker] listening on ws://${host}:${port}/`);
  console.log(`[mock-broker] log:   ${logPath}`);
  console.log(`[mock-broker] state: ${statePath}`);
  console.log(`[mock-broker] mock client IDs:`);
  console.log(`  gkClientId           ${state.mockClientIds.gkClientId}`);
  console.log(`  ps3GKClientID        ${state.mockClientIds.ps3GKClientID}`);
  console.log(`  streamServerClientId ${state.mockClientIds.streamServerClientId}`);

  const shutdown = async (signal: string) => {
    console.log(`[mock-broker] shutting down on ${signal}`);
    for (const connection of activeConnections.values()) {
      connection.socket.end(encodeControlFrame(0x8));
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await writeState();
    await new Promise<void>((resolve) => logStream.end(resolve));
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[mock-broker] fatal:', error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
