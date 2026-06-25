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
    setPolicy: (pattern: string, decision: string) =>
      ipcRenderer.invoke('nexus:permissions:setPolicy', pattern, decision),
    onRequest: (callback: (data: { id: string; action: string; detail: string }) => void) => {
      const handler = (_: any, data: { id: string; action: string; detail: string }) => callback(data)
      ipcRenderer.on('nexus:permission:request', handler)
      return () => ipcRenderer.removeListener('nexus:permission:request', handler)
    },
    respond: (id: string, granted: boolean) =>
      ipcRenderer.send('nexus:permissions:response', id, granted),
  },
  providers: {
    list: () => ipcRenderer.invoke('nexus:providers:list'),
    modelsByClass: (modelClass: string) => ipcRenderer.invoke('nexus:providers:modelsByClass', modelClass),
    modelsByProvider: (providerId: string) => ipcRenderer.invoke('nexus:providers:modelsByProvider', providerId),
    getProvider: (modelId: string) => ipcRenderer.invoke('nexus:providers:getProvider', modelId),
    send: (messages: unknown, options: unknown) =>
      ipcRenderer.invoke('nexus:providers:send', messages, options),
  },
  vault: {
    getKeys: () => ipcRenderer.invoke('nexus:vault:getKeys'),
    setKey: (provider: string, key: string) =>
      ipcRenderer.invoke('nexus:vault:setKey', provider, key),
    deleteKey: (provider: string) => ipcRenderer.invoke('nexus:vault:deleteKey', provider),
    resolveKey: (provider: string) => ipcRenderer.invoke('nexus:vault:resolveKey', provider),
  },
  window: {
    minimize: () => ipcRenderer.send('nexus:window:minimize'),
    maximize: () => ipcRenderer.send('nexus:window:maximize'),
    close: () => ipcRenderer.send('nexus:window:close'),
  },
}

contextBridge.exposeInMainWorld('nexus', api)
