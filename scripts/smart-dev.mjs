#!/usr/bin/env node
import { spawn } from 'node:child_process';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

function fail(message) {
  console.error(`[smart-dev] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const separatorIndex = argv.indexOf('--');
  const flagArgs = separatorIndex >= 0 ? argv.slice(0, separatorIndex) : argv;
  const commandArgs = separatorIndex >= 0 ? argv.slice(separatorIndex + 1) : [];
  const options = {
    host: '127.0.0.1',
    probePath: '/',
    preferredPort: null,
    scanLimit: 20,
    matches: [],
  };

  for (let index = 0; index < flagArgs.length; index += 1) {
    const arg = flagArgs[index];
    const nextValue = () => {
      index += 1;
      if (index >= flagArgs.length) {
        fail(`Missing value for ${arg}`);
      }
      return flagArgs[index];
    };

    switch (arg) {
      case '--preferred-port':
        options.preferredPort = Number.parseInt(nextValue(), 10);
        break;
      case '--host':
        options.host = nextValue();
        break;
      case '--probe-path':
        options.probePath = nextValue();
        break;
      case '--match':
        options.matches.push(nextValue());
        break;
      case '--scan-limit':
        options.scanLimit = Number.parseInt(nextValue(), 10);
        break;
      default:
        fail(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.preferredPort) || options.preferredPort < 1) {
    fail('--preferred-port must be a positive integer');
  }

  if (!Number.isInteger(options.scanLimit) || options.scanLimit < 1) {
    fail('--scan-limit must be a positive integer');
  }

  if (!options.matches.length) {
    fail('At least one --match marker is required');
  }

  if (!commandArgs.length) {
    fail('A launch command is required after --');
  }

  return { options, commandArgs };
}

function getProbeHosts(host) {
  const hosts = [host, '127.0.0.1', 'localhost'];
  return [...new Set(hosts.filter(Boolean))];
}

function canConnect(port, host) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    const finish = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function isPortOccupied(port, options) {
  for (const host of getProbeHosts(options.host)) {
    if (await canConnect(port, host)) {
      return true;
    }
  }
  return false;
}

async function readProbeText(port, host, probePath) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(`http://${host}:${port}${probePath}`, {
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
      },
    });

    if (!response.ok) {
      return null;
    }

    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function looksLikeSameApp(port, options) {
  const probeHosts = getProbeHosts(options.host);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    for (const probeHost of probeHosts) {
      const text = await readProbeText(port, probeHost, options.probePath);
      if (text && options.matches.every((marker) => text.includes(marker))) {
        return true;
      }
    }

    if (attempt < 4) {
      await delay(400);
    }
  }

  return false;
}

async function resolvePort(options) {
  for (let offset = 0; offset < options.scanLimit; offset += 1) {
    const port = options.preferredPort + offset;
    if (await looksLikeSameApp(port, options)) {
      return { action: 'reuse', port };
    }
    if (!(await isPortOccupied(port, options))) {
      return { action: 'start', port };
    }
    console.log(`[smart-dev] Port ${port} is busy with a different app, checking the next port.`);
  }

  fail(`Unable to find a compatible port after checking ${options.scanLimit} ports starting at ${options.preferredPort}`);
}

function applyPlaceholders(parts, port, host) {
  return parts.map((part) => part.replaceAll('__PORT__', String(port)).replaceAll('__HOST__', host));
}

async function main() {
  const { options, commandArgs } = parseArgs(process.argv.slice(2));
  const resolution = await resolvePort(options);
  const origin = `http://${options.host}:${resolution.port}`;

  if (resolution.action === 'reuse') {
    console.log(`[smart-dev] Reusing existing app at ${origin}${options.probePath}`);
    process.exit(0);
  }

  const [command, ...rawArgs] = applyPlaceholders(commandArgs, resolution.port, options.host);
  console.log(`[smart-dev] Starting app on ${origin}${options.probePath === '/' ? '/' : options.probePath}`);

  const child = spawn(command, rawArgs, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      PORT: String(resolution.port),
      DEV_PORT: String(resolution.port),
      VITE_PORT: String(resolution.port),
      VITE_DEV_PORT: String(resolution.port),
      SMART_DEV_PORT: String(resolution.port),
      HOST: process.env.HOST || options.host,
    },
  });

  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.on('SIGINT', forwardSignal);
  process.on('SIGTERM', forwardSignal);

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

await main();
