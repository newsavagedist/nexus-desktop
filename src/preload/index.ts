import { contextBridge, ipcRenderer } from 'electron'

const api = {
  tools: {
    run: (name: string, args: unknown) => ipcRenderer.invoke('nexus:tools:run', name, args),
    cancel: (id: string) => ipcRenderer.send('nexus:tools:cancel', id),
  },
  permissions: {
    request: (action: string, details: unknown) =>
      ipcRenderer.invoke('nexus:permissions:request', action, details),
    getPolicy: () => ipcRenderer.invoke('nexus:permissions:getPolicy'),
    setPolicy: (policy: string) => ipcRenderer.invoke('nexus:permissions:setPolicy', policy),
  },
  providers: {
    list: () => ipcRenderer.invoke('nexus:providers:list'),
    send: (messages: unknown, options: unknown) =>
      ipcRenderer.invoke('nexus:providers:send', messages, options),
  },
  vault: {
    getKeys: () => ipcRenderer.invoke('nexus:vault:getKeys'),
    setKey: (provider: string, key: string) =>
      ipcRenderer.invoke('nexus:vault:setKey', provider, key),
    deleteKey: (provider: string) => ipcRenderer.invoke('nexus:vault:deleteKey', provider),
  },
  db: {
    query: (sql: string, params?: unknown[]) =>
      ipcRenderer.invoke('nexus:db:query', sql, params),
  },
  window: {
    minimize: () => ipcRenderer.send('nexus:window:minimize'),
    maximize: () => ipcRenderer.send('nexus:window:maximize'),
    close: () => ipcRenderer.send('nexus:window:close'),
  },
}

contextBridge.exposeInMainWorld('nexus', api)
