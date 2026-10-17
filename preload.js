// The only bridge between the sandboxed renderer and the main process.
// Exposes a tiny, explicit API; no Node globals leak into the page.
// Bundled by electron-vite into out/preload/index.js (CommonJS, as sandboxed
// preloads require).

import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('planner', {
  load: () => ipcRenderer.invoke('planner:load'),
  save: (data) => ipcRenderer.invoke('planner:save', data),
  notify: (payload) => ipcRenderer.invoke('planner:notify', payload),
  onNotifyFailed: (cb) => ipcRenderer.on('planner:notifyFailed', (_e, reminder) => cb(reminder)),
  export: (data) => ipcRenderer.invoke('planner:export', data),
  importPlans: () => ipcRenderer.invoke('planner:import'),
  // True in a packaged build; used to suppress dev-only test hooks.
  isPackaged: ipcRenderer.sendSync('mufka:isPackaged'),
  // Menu bar actions (Dosya, Görünüm tabs, new note).
  onMenu: (cb) => ipcRenderer.on('menu:action', (_e, action) => cb(action)),
});

contextBridge.exposeInMainWorld('notes', {
  tree: () => ipcRenderer.invoke('notes:tree'),
  all: () => ipcRenderer.invoke('notes:all'),
  read: (rel) => ipcRenderer.invoke('notes:read', rel),
  write: (rel, content) => ipcRenderer.invoke('notes:write', rel, content),
  create: (parentRel, name) => ipcRenderer.invoke('notes:create', parentRel, name),
  createFolder: (parentRel, name) => ipcRenderer.invoke('notes:createFolder', parentRel, name),
  rename: (rel, newName) => ipcRenderer.invoke('notes:rename', rel, newName),
  renameFolder: (rel, newName) => ipcRenderer.invoke('notes:renameFolder', rel, newName),
  move: (srcRel, destFolderRel) => ipcRenderer.invoke('notes:move', srcRel, destFolderRel),
  remove: (rel) => ipcRenderer.invoke('notes:delete', rel),
  removeFolder: (rel) => ipcRenderer.invoke('notes:deleteFolder', rel),
  dailyDates: () => ipcRenderer.invoke('notes:dailyDates'),
  readDaily: (dateKey) => ipcRenderer.invoke('notes:readDaily', dateKey),
  writeDaily: (dateKey, content) => ipcRenderer.invoke('notes:writeDaily', dateKey, content),
  deleteDaily: (dateKey) => ipcRenderer.invoke('notes:deleteDaily', dateKey),
  reveal: () => ipcRenderer.invoke('notes:reveal'),
  vaultInfo: () => ipcRenderer.invoke('vault:info'),
  chooseVault: () => ipcRenderer.invoke('vault:choose'),
  useDefaultVault: () => ipcRenderer.invoke('vault:useDefault'),
  openExternal: (url) => ipcRenderer.invoke('notes:openExternal', url),
  copy: (text) => ipcRenderer.invoke('app:copy', text),
  exportMarkdown: (title, content) => ipcRenderer.invoke('notes:exportMarkdown', title, content),
  exportPDF: (title, src, noteDir) => ipcRenderer.invoke('notes:exportPDF', title, src, noteDir),
  // Attachments (<vault>/Ekler).
  attachList: () => ipcRenderer.invoke('attach:list'),
  // noteDir: the folder of the note the files are added to (attachments may
  // live next to notes, lib/layout.mjs)
  attachPaste: (noteDir) => ipcRenderer.invoke('attach:paste', noteDir),
  attachPick: (noteDir) => ipcRenderer.invoke('attach:pick', noteDir),
  attachAddFiles: (paths, noteDir) => ipcRenderer.invoke('attach:addFiles', paths, noteDir),
  // File.path was removed in Electron 32; this is its replacement for files
  // dropped from Finder.
  pathForFile: (file) => webUtils.getPathForFile(file),
  layout: () => ipcRenderer.invoke('notes:layout'),
  bookmarks: () => ipcRenderer.invoke('bookmarks:list'),
  treeStyles: () => ipcRenderer.invoke('treestyle:read'),
  saveTreeStyles: (data) => ipcRenderer.invoke('treestyle:write', data),
  toggleBookmark: (rel) => ipcRenderer.invoke('bookmarks:toggle', rel),
  attachOpen: (rel) => ipcRenderer.invoke('attach:open', rel),
  attachUnused: () => ipcRenderer.invoke('attach:unused'),
  attachTrash: (names) => ipcRenderer.invoke('attach:trash', names),
  // Fired when the window regains focus so the renderer can re-read the folder.
  onChanged: (cb) => ipcRenderer.on('notes:changed', () => cb()),
});

// Wispr Flow connection (sign-in happens in the browser; tokens stay in main).
contextBridge.exposeInMainWorld('wispr', {
  status: () => ipcRenderer.invoke('wispr:status'),
  connect: () => ipcRenderer.invoke('wispr:connect'),
  cancel: () => ipcRenderer.invoke('wispr:cancel'),
  disconnect: () => ipcRenderer.invoke('wispr:disconnect'),
  refresh: () => ipcRenderer.invoke('wispr:refresh'),
  // Bring Wispr Flow meetings into the vault now (it also runs every 15 min).
  sync: () => ipcRenderer.invoke('wispr:sync'),
  onSynced: (cb) => ipcRenderer.on('wispr:synced', (_e, r) => cb(r)),
});

// Calendars shown in the Planner (read-only; sign-in and requests stay in main).
contextBridge.exposeInMainWorld('calendars', {
  status: () => ipcRenderer.invoke('calendar:status'),
  // provider: 'microsoft' | 'google'
  connect: (provider) => ipcRenderer.invoke('calendar:connect', provider),
  cancel: (provider) => ipcRenderer.invoke('calendar:cancel', provider),
  disconnect: (provider) => ipcRenderer.invoke('calendar:disconnect', provider),
  refresh: () => ipcRenderer.invoke('calendar:refresh'),
  setShown: (provider, calendarId, shown) => ipcRenderer.invoke('calendar:setShown', provider, calendarId, shown),
  events: (from, to) => ipcRenderer.invoke('calendar:events', from, to),
  // Main says the calendars changed (connected, hidden, refreshed…).
  onChanged: (cb) => ipcRenderer.on('calendar:changed', () => cb()),
});
