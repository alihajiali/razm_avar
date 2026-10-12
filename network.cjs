const net = require('node:net'),
  dgram = require('node:dgram'),
  os = require('node:os'),
  crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const VERSION = 1,
  GAME_PORT = 27777,
  DISCOVERY_PORT = 27778,
  GROUP = '239.255.77.77',
  MAGIC = 'sector-zero-lan';
const worldModule = () => import('./multiplayer-world.mjs');
const write = (socket, value) => {
  if (socket.destroyed) return;
  if (socket.writableLength > 131072) {
    socket.destroy();
    return;
  }
  socket.write(JSON.stringify(value) + '\n');
};
function frames(socket, onMessage, maxBytes = 32768) {
  let buffer = '';
  socket.setEncoding('utf8');
  socket.on('data', (chunk) => {
    buffer += chunk;
    while (buffer.includes('\n')) {
      const pos = buffer.indexOf('\n');
      if (pos > maxBytes) {
        socket.destroy();
        return;
      }
      const line = buffer.slice(0, pos);
      buffer = buffer.slice(pos + 1);
      try {
        const message = JSON.parse(line);
        if (!message || typeof message !== 'object' || Array.isArray(message)) {
          socket.destroy();
          return;
        }
        onMessage(message);
      } catch {
        socket.destroy();
        return;
      }
    }
    if (Buffer.byteLength(buffer) > maxBytes) socket.destroy();
  });
}
function localAddresses() {
  const list = [];
  for (const interfaces of Object.values(os.networkInterfaces()))
    for (const iface of interfaces || [])
      if (iface.family === 'IPv4' && !iface.internal) list.push(iface.address);
  return [...new Set(list)];
}
function broadcasts() {
  const list = ['255.255.255.255'];
  for (const interfaces of Object.values(os.networkInterfaces()))
    for (const iface of interfaces || [])
      if (iface.family === 'IPv4' && !iface.internal) {
        const ip = iface.address.split('.').map(Number),
          mask = iface.netmask.split('.').map(Number);
        list.push(ip.map((v, i) => v | (~mask[i] & 255)).join('.'));
      }
  return [...new Set(list)];
}
function portValue(value, allowZero = false) {
  const port = Number(value ?? GAME_PORT);
  if (!Number.isInteger(port) || (port < 1024 && !(allowZero && port === 0)) || port > 65535)
    throw Error('پورت باید عددی بین ۱۰۲۴ و ۶۵۵۳۵ باشد.');
  return port;
}
function endpoint(value) {
  if (typeof value !== 'string' || value.length > 260) throw Error('آدرس سرور معتبر نیست.');
  const match = value.trim().match(/^([a-zA-Z0-9.-]+)(?::(\d{1,5}))?$/);
  if (!match || !match[1] || match[1].includes('..'))
    throw Error('آدرس را به شکل 192.168.1.20:27777 وارد کن.');
  return { host: match[1], port: portValue(match[2]) };
}
class GameHost {
  constructor(world, options) {
    this.world = world;
    this.name = options.name;
    this.id = crypto.randomUUID();
    this.clients = new Map();
    this.sockets = new Set();
    this.port = 0;
    this.discovery = null;
    this.stopping = false;
  }
  static async start(options = {}) {
    const { MultiplayerWorld, cleanName } = await worldModule();
    const host = new GameHost(
      new MultiplayerWorld({ map: options.map, maxPlayers: options.maxPlayers }),
      { name: cleanName(options.serverName, 'میدان رزم‌آور') },
    );
    try {
      await host.listen(portValue(options.port, true), options.bindAddress || '0.0.0.0');
      return host;
    } catch (error) {
      await host.stop();
      if (error.code === 'EADDRINUSE')
        throw Error('این پورت در حال استفاده است؛ پورت دیگری انتخاب کن.');
      throw error;
    }
  }
  async listen(port, address) {
    this.server = net.createServer((socket) => this.accept(socket));
    this.server.on('error', () => {});
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen({ port, host: address }, () => {
        this.server.removeListener('error', reject);
        resolve();
      });
    });
    this.port = this.server.address().port;
    await this.startDiscovery();
    let previous = performance.now();
    this.timer = setInterval(() => {
      const now = performance.now(),
        dt = Math.min(0.1, (now - previous) / 1000);
      previous = now;
      for (let remaining = dt; remaining > 0; remaining -= 0.025)
        this.world.tick(Math.min(0.025, remaining));
      const snapshot = this.world.snapshot();
      for (const socket of this.clients.values()) write(socket, snapshot);
    }, 50);
    this.timer.unref();
  }
  accept(socket) {
    if (this.sockets.size >= this.world.maxPlayers + 8) {
      socket.destroy();
      return;
    }
    this.sockets.add(socket);
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 3000);
    socket.on('error', () => {});
    let id = null,
      windowStart = Date.now(),
      count = 0;
    const handshake = setTimeout(() => socket.destroy(), 5000);
    handshake.unref();
    socket.setTimeout(10000, () => socket.destroy());
    frames(
      socket,
      (message) => {
        if (Date.now() - windowStart >= 1000) {
          count = 0;
          windowStart = Date.now();
        }
        if (++count > 100) {
          socket.destroy();
          return;
        }
        if (!id) {
          if (message.type !== 'hello' || message.version !== VERSION) {
            write(socket, { type: 'error', message: 'نسخهٔ بازی با سرور سازگار نیست.' });
            socket.end();
            return;
          }
          try {
            const p = this.world.addPlayer(message.name);
            id = p.id;
            this.clients.set(id, socket);
            clearTimeout(handshake);
            write(socket, {
              type: 'welcome',
              version: VERSION,
              id,
              map: this.world.map.id,
              serverName: this.name,
              maxPlayers: this.world.maxPlayers,
            });
          } catch (error) {
            write(socket, { type: 'error', message: error.message });
            socket.end();
          }
          return;
        }
        if (message.type === 'input') this.world.input(id, message.input);
        else if (message.type === 'ping') write(socket, { type: 'pong', sent: message.sent });
      },
      2048,
    );
    socket.on('close', () => {
      clearTimeout(handshake);
      this.sockets.delete(socket);
      if (id) {
        this.clients.delete(id);
        this.world.removePlayer(id);
      }
    });
  }
  advertisement() {
    return {
      magic: MAGIC,
      version: VERSION,
      type: 'server',
      id: this.id,
      name: this.name,
      map: this.world.map.id,
      port: this.port,
      players: this.world.players.size,
      maxPlayers: this.world.maxPlayers,
    };
  }
  async startDiscovery() {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.discovery = socket;
    socket.on('error', () => {});
    let ready = false;
    await new Promise((resolve) => {
      socket.once('error', () => resolve());
      socket.bind(DISCOVERY_PORT, '0.0.0.0', () => {
        ready = true;
        try {
          socket.addMembership(GROUP);
          socket.setMulticastTTL(1);
        } catch {}
        resolve();
      });
    });
    if (!ready) {
      try {
        socket.close();
      } catch {}
      this.discovery = null;
      return;
    }
    socket.on('message', (data, rinfo) => {
      if (data.length > 1024) return;
      let query;
      try {
        query = JSON.parse(data);
      } catch {
        return;
      }
      if (query.magic !== MAGIC || query.type !== 'discover' || query.version !== VERSION) return;
      const now = Date.now();
      this.lastQuery ??= new Map();
      if (now - (this.lastQuery.get(rinfo.address) || 0) < 150) return;
      if (this.lastQuery.size > 256) this.lastQuery.clear();
      this.lastQuery.set(rinfo.address, now);
      socket.send(
        Buffer.from(JSON.stringify(this.advertisement())),
        rinfo.port,
        rinfo.address,
        () => {},
      );
    });
    socket.unref();
  }
  async stop() {
    if (this.stopping) return;
    this.stopping = true;
    clearInterval(this.timer);
    if (this.discovery)
      try {
        this.discovery.close();
      } catch {}
    for (const socket of this.sockets) socket.destroy();
    if (this.server?.listening) await new Promise((resolve) => this.server.close(resolve));
  }
}
async function discoverServers({
  timeout = 1600,
  targets = [GROUP, ...broadcasts(), '127.0.0.1'],
} = {}) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4'),
      found = new Map();
    let done = false,
      timer,
      repeat;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(repeat);
      try {
        socket.close();
      } catch {}
      resolve([...found.values()].sort((a, b) => a.name.localeCompare(b.name)));
    };
    socket.on('error', finish);
    socket.on('message', (data, rinfo) => {
      if (data.length > 2048) return;
      try {
        const v = JSON.parse(data);
        if (
          v.magic !== MAGIC ||
          v.type !== 'server' ||
          v.version !== VERSION ||
          typeof v.id !== 'string' ||
          !Number.isInteger(v.port) ||
          v.port < 1024 ||
          v.port > 65535 ||
          !net.isIPv4(rinfo.address)
        )
          return;
        found.set(v.id, {
          id: v.id,
          name: typeof v.name === 'string' ? v.name.slice(0, 24) : 'میدان رزم‌آور',
          map: typeof v.map === 'string' ? v.map.slice(0, 20) : 'dust',
          address: `${rinfo.address}:${v.port}`,
          players: Math.max(0, Math.min(8, Number(v.players) || 0)),
          maxPlayers: Math.max(2, Math.min(8, Number(v.maxPlayers) || 8)),
        });
      } catch {}
    });
    socket.bind(0, '0.0.0.0', () => {
      if (done) return;
      try {
        socket.setBroadcast(true);
        socket.setMulticastTTL(1);
      } catch {}
      const query = Buffer.from(
        JSON.stringify({ magic: MAGIC, version: VERSION, type: 'discover' }),
      );
      const send = () => {
        for (const target of targets) socket.send(query, DISCOVERY_PORT, target, () => {});
      };
      send();
      repeat = setInterval(send, 350);
      timer = setTimeout(finish, timeout);
    });
  });
}
class GameClient extends EventEmitter {
  async connect(address, name) {
    const { host, port } = endpoint(address);
    clearInterval(this.heartbeat);
    this.socket?.destroy();
    this.welcome = null;
    this.socket = net.createConnection({ host, port });
    const socket = this.socket;
    this.socket.setNoDelay(true);
    this.socket.setKeepAlive(true, 3000);
    this.lastReceived = Date.now();
    let welcomed = false;
    return new Promise((resolve, reject) => {
      const deadline = setTimeout(() => {
        reject(Error('اتصال به سرور زمان‌بر شد؛ آدرس و پورت را بررسی کن.'));
        this.socket.destroy();
      }, 6000);
      this.socket.on('connect', () =>
        write(this.socket, { type: 'hello', version: VERSION, name }),
      );
      this.socket.on('error', (error) => {
        if (!welcomed)
          reject(
            Error(
              error.code === 'ECONNREFUSED'
                ? 'سرور در این آدرس در دسترس نیست.'
                : `خطای اتصال: ${error.code || error.message}`,
            ),
          );
      });
      this.socket.on('close', () => {
        clearTimeout(deadline);
        if (this.socket !== socket) return;
        clearInterval(this.heartbeat);
        this.emit('disconnect', { message: 'ارتباط با سرور قطع شد.' });
        if (!welcomed) reject(Error('سرور اتصال را نپذیرفت.'));
      });
      frames(
        this.socket,
        (message) => {
          if (this.socket !== socket) return;
          this.lastReceived = Date.now();
          if (message.type === 'error') {
            reject(Error(message.message));
            this.emit('serverError', message);
            this.socket.destroy();
          } else if (message.type === 'welcome') {
            welcomed = true;
            clearTimeout(deadline);
            this.welcome = message;
            resolve(message);
            this.heartbeat = setInterval(() => {
              if (Date.now() - this.lastReceived > 8000) this.socket.destroy();
              else write(this.socket, { type: 'ping', sent: Date.now() });
            }, 2000);
          } else if (message.type === 'snapshot') this.emit('snapshot', message);
          else if (message.type === 'pong')
            this.emit('ping', Math.max(0, Date.now() - message.sent));
        },
        65536,
      );
    });
  }
  input(input) {
    if (this.welcome) write(this.socket, { type: 'input', input });
  }
  close() {
    clearInterval(this.heartbeat);
    this.welcome = null;
    this.socket?.destroy();
  }
}
class NetworkSession extends EventEmitter {
  constructor() {
    super();
    this.host = null;
    this.client = null;
    this.busy = false;
    this.closed = false;
    this.epoch = 0;
  }
  async hostGame(options = {}) {
    if (this.busy) throw Error('اتصال دیگری در حال انجام است.');
    this.busy = true;
    try {
      await this.leave();
      const epoch = this.epoch,
        host = await GameHost.start(options);
      if (this.closed || epoch !== this.epoch) {
        await host.stop();
        throw Error('لغو اتصال');
      }
      this.host = host;
      const welcome = await this.connect(`127.0.0.1:${this.host.port}`, options.playerName);
      return {
        ...welcome,
        hosting: true,
        port: this.host.port,
        addresses: localAddresses().map((ip) => `${ip}:${this.host.port}`),
        discoveryAvailable: !!this.host.discovery,
      };
    } catch (error) {
      await this.leave();
      throw error;
    } finally {
      this.busy = false;
    }
  }
  async joinGame(options = {}) {
    if (this.busy) throw Error('اتصال دیگری در حال انجام است.');
    this.busy = true;
    try {
      await this.leave();
      return { ...(await this.connect(options.address, options.playerName)), hosting: false };
    } catch (error) {
      await this.leave();
      throw error;
    } finally {
      this.busy = false;
    }
  }
  async connect(address, name) {
    const client = new GameClient();
    this.client = client;
    client.on('snapshot', (snapshot) => {
      if (this.client === client) this.emit('event', snapshot);
    });
    client.on('ping', (ping) => {
      if (this.client === client) this.emit('event', { type: 'ping', ping });
    });
    client.on('disconnect', (message) => {
      if (this.client === client) {
        this.client = null;
        if (this.host) {
          const host = this.host;
          this.host = null;
          host.stop();
        }
        this.emit('event', { type: 'disconnect', ...message });
      }
    });
    return client.connect(address, name);
  }
  input(input) {
    this.client?.input(input);
  }
  async leave() {
    this.epoch++;
    const client = this.client;
    this.client = null;
    client?.close();
    const host = this.host;
    this.host = null;
    await host?.stop();
  }
  async close() {
    this.closed = true;
    await this.leave();
  }
}
module.exports = {
  GameHost,
  GameClient,
  NetworkSession,
  discoverServers,
  endpoint,
  GAME_PORT,
  DISCOVERY_PORT,
  VERSION,
  localAddresses,
};
