import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('reqlyWizard', {
  state: () => ipcRenderer.invoke('wizard:state'),
  connect: (agentId: string) => ipcRenderer.invoke('wizard:connect', agentId),
  installPath: () => ipcRenderer.invoke('wizard:install-path'),
  done: () => ipcRenderer.invoke('wizard:done'),
  openExternal: (url: string) => ipcRenderer.invoke('wizard:open-external', url),
});
