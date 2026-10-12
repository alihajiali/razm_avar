const { fileURLToPath } = require('node:url');
const path = require('node:path');
const { NetworkSession, discoverServers } = require('./network.cjs');
function installNetworkIPC(ipcMain, root) {
  const sessions = new Map();
  function sessionFor(event) {
    if (event.senderFrame !== event.sender.mainFrame) throw Error('Unsupported frame');
    let filename;
    try {
      filename = fileURLToPath(event.senderFrame.url);
    } catch {
      throw Error('Unsupported page');
    }
    if (path.resolve(filename) !== path.join(root, 'index.html')) throw Error('Unsupported page');
    const session = sessions.get(event.sender.id);
    if (!session || session.closed) throw Error('Window closed');
    return session;
  }
  for (const [channel, action] of [
    ['host', (s, v) => s.hostGame(v)],
    ['join', (s, v) => s.joinGame(v)],
    ['leave', (s) => s.leave()],
    [
      'scan',
      async (s) => {
        if (s.scanning) throw Error('جست‌وجو در حال انجام است.');
        s.scanning = true;
        try {
          return await discoverServers();
        } finally {
          s.scanning = false;
        }
      },
    ],
  ])
    ipcMain.handle('sector-net:' + channel, async (event, value) => {
      try {
        return { ok: true, value: await action(sessionFor(event), value || {}) };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    });
  ipcMain.on('sector-net:input', (event, input) => {
    try {
      sessionFor(event).input(input);
    } catch {}
  });
  return (win) => {
    const session = new NetworkSession();
    sessions.set(win.webContents.id, session);
    session.on('event', (value) => {
      if (!win.isDestroyed() && !win.webContents.isDestroyed())
        win.webContents.send('sector-net:event', value);
    });
    win.webContents.on('did-start-loading', () => session.leave());
    win.on('closed', () => {
      sessions.delete(win.webContents.id);
      session.close();
    });
    return session;
  };
}
module.exports = { installNetworkIPC };
