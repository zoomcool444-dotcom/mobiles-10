export type DeviceUsbStatus =
  | 'online'
  | 'offline'
  | 'unauthorized'
  | 'disconnected';

export type MirrorStreamStatus = 'stopped' | 'streaming' | 'error';

export type AppiumSessionStatus = 'idle' | 'active' | 'error' | 'unavailable';

export type VirtualAppId =
  | 'launcher'
  | 'chrome'
  | 'store'
  | 'downloads'
  | 'webapp'
  | 'settings'
  | 'notes'
  | 'calculator'
  | 'gallery';

export interface InstalledVirtualApp {
  id: string;
  name: string;
  packageName: string;
  url: string;
  color: string;
  source: 'chrome' | 'store';
  version: string;
  sizeMb: string;
  installedAt: string;
}

export interface VirtualDownloadItem {
  id: string;
  fileName: string;
  url: string;
  sizeMb: string;
  status: 'installed' | 'downloaded';
  downloadedAt: string;
  appId?: string;
}

export interface VirtualPageSnapshot {
  url: string;
  title: string;
  description: string;
  headings: string[];
  paragraphs: string[];
  links: { label: string; href: string }[];
  fetchedAt: string;
  error?: string;
}

export interface VirtualPhoneState {
  isVirtual: boolean;
  activeApp: VirtualAppId;
  activeWebAppId: string | null;
  history: string[];
  historyIndex: number;
  noteText: string;
  pageSnapshot: VirtualPageSnapshot | null;
  pageLoading: boolean;
  scrollY: number;
  lastInteractionAt: string;
  installedApps: InstalledVirtualApp[];
  downloads: VirtualDownloadItem[];
}

export interface PhysicalDeviceSlot {
  slotId: string; // "01" .. "10"
  name: string; // "Device 01" .. "Device 10"
  serial: string | null;
  usbPort: string | null;
  usbStatus: DeviceUsbStatus;
  active: boolean;
  model: string;
  manufacturer: string;
  androidVersion: string;
  battery: number | null;
  batteryCharging: boolean;
  resolution: string;
  browserStatus: string;
  currentActivity: string;
  currentUrl: string | null;
  mirrorStatus: MirrorStreamStatus;
  scrcpyPid: number | null;
  appiumStatus: AppiumSessionStatus;
  appiumPort: number;
  lastFrameBase64: string | null;
  lastFrameAt: string | null;
  lastSeenAt: string | null;
  fps: number;
  virtualState?: VirtualPhoneState;
}

export type LogLevel = 'info' | 'success' | 'warn' | 'error';
export type LogSource = 'ADB' | 'scrcpy' | 'Appium' | 'Bridge' | 'Fleet' | 'VirtualOS';

export interface ConnectionLogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: LogSource;
  deviceId: string | null;
  deviceName: string | null;
  message: string;
}

export interface BridgeDiagnostics {
  mode: 'virtual' | 'hardware';
  pythonBridgeUrl: string;
  pythonBridgeConnected: boolean;
  localAdbAvailable: boolean;
  scrcpyAvailable: boolean;
  appiumAvailable: boolean;
  hostPlatform: string;
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface CapturedScreenshot {
  id: string;
  slotId: string;
  deviceName: string;
  serial: string | null;
  capturedAt: string;
  imageBase64: string;
  resolution: string;
}

export type WorkspaceView = 'rack' | 'matrix' | 'logs' | 'setup';
export type DeviceFilter = 'all' | 'online' | 'offline' | 'mirroring';
