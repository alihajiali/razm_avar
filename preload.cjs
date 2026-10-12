const { contextBridge, ipcRenderer } = require('electron');
const invoke = async (channel, value) => {
  const result = await ipcRenderer.invoke('sector-net:' + channel, value);
  if (!result.ok) throw Error(result.error);
  return result.value;
};
contextBridge.exposeInMainWorld('sectorNetwork', {
  host: (options) => invoke('host', options),
  join: (options) => invoke('join', options),
  scan: () => invoke('scan'),
  leave: () => invoke('leave'),
  input: (value) => ipcRenderer.send('sector-net:input', value),
  onEvent: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('sector-net:event', listener);
    return () => ipcRenderer.removeListener('sector-net:event', listener);
  },
});
