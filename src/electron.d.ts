interface ElectronAPI {
  // Title bar style (resolved synchronously at preload time)
  titleBarStyle: 'custom' | 'native';

  // Paths
  getProjectsDir(): Promise<string>;
  getExampleWorkflowsDir(): Promise<string>;

  // Filesystem
  readFile(filePath: string): Promise<string>;
  readFileBinary(filePath: string): Promise<number[]>;
  writeFile(filePath: string, content: string): Promise<void>;
  writeFileBinary(filePath: string, bytes: number[]): Promise<void>;
  copyFile(src: string, dest: string): Promise<void>;
  mkdir(dirPath: string): Promise<void>;
  exists(filePath: string): Promise<boolean>;
  renameDir(oldPath: string, newPath: string): Promise<void>;
  listDir(dirPath: string): Promise<{ name: string; isDir: boolean }[]>;
  deleteFile(filePath: string): Promise<void>;
  deleteDir(dirPath: string): Promise<void>;
  stat(filePath: string): Promise<{ size: number; mtimeMs: number }>;
  /** Register additional allowed filesystem roots (user-configured external dirs
   *  such as a typed ComfyUI workflows folder). Path-confinement (main process). */
  registerRoots(paths: string[]): Promise<void>;

  // Dialogs
  openFileDialog(options?: {
    filters?: { name: string; extensions: string[] }[];
    title?: string;
  }): Promise<string | null>;

  openFilesDialog(options?: {
    filters?: { name: string; extensions: string[] }[];
    title?: string;
  }): Promise<string[]>;

  openFolderDialog(defaultPath?: string): Promise<string | null>;

  saveFileDialog(options?: {
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
    title?: string;
    buttonLabel?: string;
  }): Promise<string | null>;

  // Shell
  openPath(filePath: string): Promise<void>;

  // HTTP proxy (main process)
  httpRequest(req: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<{ status: number; headers: Record<string, string>; text: string }>;
  httpRequestBinary(req: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<{ status: number; headers: Record<string, string>; bytes: number[] }>;

  // Play preview — stash the built doc for the `purl-play` origin to serve.
  setPlayDoc(html: string): Promise<void>;

  // Window controls (custom title bar)
  minimizeWindow(): Promise<void>;
  maximizeWindow(): Promise<void>;
  closeWindow(): Promise<void>;
  isWindowMaximized(): Promise<boolean>;
  /** Open the DevTools console (detached window). */
  openDevTools(): Promise<void>;
  /** Subscribe to maximize/unmaximize notifications. Returns an unsubscribe fn. */
  onWindowMaximized(callback: (maximized: boolean) => void): () => void;

  // App config
  getTitleBarStyle(): Promise<'custom' | 'native'>;
  setTitleBarStyle(style: 'custom' | 'native'): Promise<void>;

  // Close confirmation
  /** Subscribe to main-process close-requested events. Returns an unsubscribe fn. */
  onCloseRequested(callback: () => void): () => void;
  confirmClose(): void;
  cancelClose(): void;
}

declare interface Window {
  electronAPI?: ElectronAPI;
}

/** App version injected by Vite `define` at build time. */
declare const __APP_VERSION__: string;
