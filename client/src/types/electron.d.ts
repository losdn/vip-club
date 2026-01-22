interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  openModelChat: (data: { modelId: number; modelName: string; url: string; proxyUrl?: string; unrestricted?: boolean }) => Promise<{ status: string }>;
  clearModelSession: (data: { modelId: number }) => Promise<{ status: string }>;
  getModelCookies: (data: { modelId: number }) => Promise<any[]>;
  getModelLocalStorage: (data: { modelId: number }) => Promise<any>;
  onSessionExpired: (callback: (modelId: number) => void) => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
