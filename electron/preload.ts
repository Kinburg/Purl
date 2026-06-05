import { contextBridge, ipcRenderer } from 'electron';

const titleBarStyle = ipcRenderer.sendSync('config:getTitleBarStyleSync') as 'custom' | 'native';

contextBridge.exposeInMainWorld('electronAPI', {
  titleBarStyle,
  // Paths
  getProjectsDir: (): Promise<string> =>
    ipcRenderer.invoke('fs:getProjectsDir'),
  getExampleWorkflowsDir: (): Promise<string> =>
    ipcRenderer.invoke('fs:getExampleWorkflowsDir'),

  // Filesystem
  readFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke('fs:readFile', filePath),

  readFileBinary: (filePath: string): Promise<number[]> =>
    ipcRenderer.invoke('fs:readFileBinary', filePath),

  writeFile: (filePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke('fs:writeFile', filePath, content),

  writeFileBinary: (filePath: string, bytes: number[]): Promise<void> =>
    ipcRenderer.invoke('fs:writeFileBinary', filePath, bytes),

  copyFile: (src: string, dest: string): Promise<void> =>
    ipcRenderer.invoke('fs:copyFile', src, dest),

  mkdir: (dirPath: string): Promise<void> =>
    ipcRenderer.invoke('fs:mkdir', dirPath),

  exists: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke('fs:exists', filePath),

  renameDir: (oldPath: string, newPath: string): Promise<void> =>
    ipcRenderer.invoke('fs:rename', oldPath, newPath),

  listDir: (dirPath: string): Promise<{ name: string; isDir: boolean }[]> =>
    ipcRenderer.invoke('fs:listDir', dirPath),

  deleteFile: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('fs:deleteFile', filePath),

  deleteDir: (dirPath: string): Promise<void> =>
    ipcRenderer.invoke('fs:deleteDir', dirPath),

  stat: (filePath: string): Promise<{ size: number; mtimeMs: number }> =>
    ipcRenderer.invoke('fs:stat', filePath),

  // Dialogs
  openFileDialog: (options?: Electron.OpenDialogOptions): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openFile', options),

  openFilesDialog: (options?: Electron.OpenDialogOptions): Promise<string[]> =>
    ipcRenderer.invoke('dialog:openFiles', options),

  openFolderDialog: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openFolder', defaultPath),

  saveFileDialog: (options?: Electron.SaveDialogOptions): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveFile', options),

  // Shell
  openPath: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('shell:openPath', filePath),

  // HTTP proxy (avoids renderer CORS for local APIs)
  httpRequest: (req: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<{ status: number; headers: Record<string, string>; text: string }> =>
    ipcRenderer.invoke('http:request', req),

  httpRequestBinary: (req: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<{ status: number; headers: Record<string, string>; bytes: number[] }> =>
    ipcRenderer.invoke('http:requestBinary', req),

  // Window controls (custom title bar)
  minimizeWindow:    (): Promise<void>    => ipcRenderer.invoke('window:minimize'),
  maximizeWindow:    (): Promise<void>    => ipcRenderer.invoke('window:maximize'),
  closeWindow:       (): Promise<void>    => ipcRenderer.invoke('window:close'),
  isWindowMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),

  onWindowMaximized: (callback: (maximized: boolean) => void): (() => void) => {
    const handler = (_e: unknown, maximized: boolean) => callback(maximized);
    ipcRenderer.on('window:maximized', handler);
    // Returned unsubscribe — caller is expected to invoke this from a React
    // useEffect cleanup so HMR re-runs don't pile up listeners.
    return () => { ipcRenderer.removeListener('window:maximized', handler); };
  },

  // App config
  getTitleBarStyle: (): Promise<'custom' | 'native'> =>
    ipcRenderer.invoke('config:getTitleBarStyle'),

  setTitleBarStyle: (style: 'custom' | 'native'): Promise<void> =>
    ipcRenderer.invoke('config:setTitleBarStyle', style),

  // Close confirmation
  onCloseRequested: (callback: () => void): (() => void) => {
    ipcRenderer.on('app:close-requested', callback);
    return () => { ipcRenderer.removeListener('app:close-requested', callback); };
  },
  confirmClose: (): void => { ipcRenderer.send('app:close-confirm'); },
  cancelClose:  (): void => { ipcRenderer.send('app:close-cancel');  },
});
