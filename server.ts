import 'dotenv/config';
import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { WebSocketServer, WebSocket } from 'ws';

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT || 3000);
let pythonBridgeUrl = (process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:5000').replace(/\/+$/, '');
let activeMode: 'virtual' | 'hardware' = 'virtual';

type VirtualAppId =
  | 'launcher'
  | 'chrome'
  | 'store'
  | 'downloads'
  | 'webapp'
  | 'settings'
  | 'notes'
  | 'calculator'
  | 'gallery';

interface InstalledVirtualApp {
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

interface VirtualDownloadItem {
  id: string;
  fileName: string;
  url: string;
  sizeMb: string;
  status: 'installed' | 'downloaded';
  downloadedAt: string;
  appId?: string;
}

interface VirtualPageSnapshot {
  url: string;
  title: string;
  description: string;
  headings: string[];
  paragraphs: string[];
  links: { label: string; href: string }[];
  fetchedAt: string;
  error?: string;
}

interface VirtualPhoneState {
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

interface DeviceSlot {
  slotId: string;
  name: string;
  serial: string | null;
  usbPort: string | null;
  usbStatus: 'online' | 'offline' | 'unauthorized' | 'disconnected';
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
  mirrorStatus: 'stopped' | 'streaming' | 'error';
  scrcpyPid: number | null;
  appiumStatus: 'idle' | 'active' | 'error' | 'unavailable';
  appiumPort: number;
  lastFrameBase64: string | null;
  lastFrameAt: string | null;
  lastSeenAt: string | null;
  fps: number;
  virtualState?: VirtualPhoneState;
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error';
  source: 'ADB' | 'scrcpy' | 'Appium' | 'Bridge' | 'Fleet' | 'VirtualOS';
  deviceId: string | null;
  deviceName: string | null;
  message: string;
}

interface DiagnosticsState {
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

const VIRTUAL_SPECS = [
  { model: 'Pixel 8 Pro', manufacturer: 'Google', androidVersion: '14', resolution: '1344×2992', battery: 94, charging: true },
  { model: 'Galaxy S24', manufacturer: 'Samsung', androidVersion: '14', resolution: '1080×2340', battery: 88, charging: false },
  { model: 'OnePlus 12', manufacturer: 'OnePlus', androidVersion: '14', resolution: '1440×3168', battery: 82, charging: true },
  { model: 'Pixel 7a', manufacturer: 'Google', androidVersion: '14', resolution: '1080×2400', battery: 76, charging: false },
  { model: 'Xiaomi 14', manufacturer: 'Xiaomi', androidVersion: '14', resolution: '1200×2670', battery: 91, charging: false },
  { model: 'Galaxy A55', manufacturer: 'Samsung', androidVersion: '14', resolution: '1080×2340', battery: 79, charging: true },
  { model: 'Nothing Phone (2)', manufacturer: 'Nothing', androidVersion: '14', resolution: '1080×2412', battery: 85, charging: false },
  { model: 'Motorola Edge 50', manufacturer: 'Motorola', androidVersion: '14', resolution: '1220×2712', battery: 73, charging: false },
  { model: 'Pixel 8', manufacturer: 'Google', androidVersion: '14', resolution: '1080×2400', battery: 96, charging: true },
  { model: 'Realme GT 6', manufacturer: 'Realme', androidVersion: '14', resolution: '1264×2780', battery: 84, charging: false },
];

const APP_ACTIVITIES: Record<VirtualAppId, string> = {
  launcher: 'com.android.launcher3/.Launcher',
  chrome: 'com.android.chrome/com.google.android.apps.chrome.Main',
  store: 'com.android.vending/.AssetBrowserActivity',
  downloads: 'com.android.documentsui/.files.FilesActivity',
  webapp: 'com.android.chrome/org.chromium.chrome.browser.webapps.WebappActivity',
  settings: 'com.android.settings/.Settings',
  notes: 'com.android.notes/.NotesActivity',
  calculator: 'com.android.calculator2/.Calculator',
  gallery: 'com.android.gallery3d/.app.GalleryActivity',
};

const APP_COLORS = [
  '#2563eb',
  '#059669',
  '#7c3aed',
  '#d97706',
  '#e11d48',
  '#0891b2',
  '#4f46e5',
];

function createVirtualDeviceAt(idx: number): DeviceSlot {
  const now = new Date().toISOString();
  const spec = VIRTUAL_SPECS[idx % VIRTUAL_SPECS.length];
  const num = String(idx + 1).padStart(2, '0');
  const serialSuffix = String(84 + (idx % 15));
  return {
    slotId: num,
    name: `Device ${num}`,
    serial: `VAND-${num}-${spec.manufacturer.slice(0, 3).toUpperCase()}${serialSuffix}`,
    usbPort: `Slot ${num}`,
    usbStatus: 'online',
    active: true,
    model: spec.model,
    manufacturer: spec.manufacturer,
    androidVersion: spec.androidVersion,
    battery: Math.max(55, Math.min(99, spec.battery - (idx % 9))),
    batteryCharging: spec.charging,
    resolution: spec.resolution,
    browserStatus: 'Chrome Ready',
    currentActivity: APP_ACTIVITIES.launcher,
    currentUrl: null,
    mirrorStatus: 'streaming',
    scrcpyPid: 4100 + idx,
    appiumStatus: 'active',
    appiumPort: 4723 + idx,
    lastFrameBase64: null,
    lastFrameAt: now,
    lastSeenAt: now,
    fps: 60,
    virtualState: {
      isVirtual: true,
      activeApp: 'launcher',
      activeWebAppId: null,
      history: [],
      historyIndex: -1,
      noteText: `Device ${num} (${spec.model}) — Ready for Android browser & app workflows.`,
      pageSnapshot: null,
      pageLoading: false,
      scrollY: 0,
      lastInteractionAt: now,
      installedApps: [],
      downloads: [],
    },
  };
}

function createVirtualDevices(count = 10): DeviceSlot[] {
  const safeCount = Math.max(1, Math.min(100, Math.floor(count)));
  return Array.from({ length: safeCount }, (_, idx) => createVirtualDeviceAt(idx));
}

function resizeVirtualFleet(targetCount: number): DeviceSlot[] {
  const safeCount = Math.max(1, Math.min(100, Math.floor(targetCount)));
  if (safeCount === virtualDevices.length) return virtualDevices;
  if (safeCount < virtualDevices.length) {
    virtualDevices = virtualDevices.slice(0, safeCount);
  } else {
    const start = virtualDevices.length;
    for (let i = start; i < safeCount; i++) {
      virtualDevices.push(createVirtualDeviceAt(i));
    }
  }
  return virtualDevices;
}

function createEmptyHardwareSlots(): DeviceSlot[] {
  return Array.from({ length: 10 }, (_, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    return {
      slotId: num,
      name: `Device ${num}`,
      serial: null,
      usbPort: `Slot ${num}`,
      usbStatus: 'offline',
      active: false,
      model: '—',
      manufacturer: '—',
      androidVersion: '—',
      battery: null,
      batteryCharging: false,
      resolution: '—',
      browserStatus: 'Offline',
      currentActivity: '—',
      currentUrl: null,
      mirrorStatus: 'stopped',
      scrcpyPid: null,
      appiumStatus: 'unavailable',
      appiumPort: 4723 + idx,
      lastFrameBase64: null,
      lastFrameAt: null,
      lastSeenAt: null,
      fps: 0,
    };
  });
}

let virtualDevices: DeviceSlot[] = createVirtualDevices();
let hardwareDevices: DeviceSlot[] = createEmptyHardwareSlots();
let localLogs: LogEntry[] = [];
let diagnostics: DiagnosticsState = {
  mode: activeMode,
  pythonBridgeUrl,
  pythonBridgeConnected: false,
  localAdbAvailable: false,
  scrcpyAvailable: false,
  appiumAvailable: false,
  hostPlatform: process.platform,
  lastSyncAt: new Date().toISOString(),
  lastError: null,
};

const DISALLOWED_URL_PATTERNS = [
  /ad-?click/i,
  /click-?farm/i,
  /auto-?surf/i,
  /view-?bot/i,
  /reward-?bot/i,
  /traffic-?exchange/i,
];

function validateAuthorizedUrl(rawInput: string): { valid: boolean; error?: string; normalized?: string } {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { valid: false, error: 'Please enter a URL or search query.' };
  }

  // If the user types a plain search query (spaces or no dot), route to DuckDuckGo mobile search
  const looksLikeSearch = trimmed.includes(' ') || (!trimmed.includes('.') && !trimmed.startsWith('http'));
  const candidate = looksLikeSearch
    ? `https://html.duckduckgo.com/html/?q=${encodeURIComponent(trimmed)}`
    : trimmed.match(/^https?:\/\//i)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Only http:// and https:// URLs are permitted.' };
    }
    const href = parsed.toString();
    for (const pattern of DISALLOWED_URL_PATTERNS) {
      if (pattern.test(href)) {
        return {
          valid: false,
          error: 'URL blocked by authorized testing policy (prohibited automation target).',
        };
      }
    }
    return { valid: true, normalized: href };
  } catch {
    return { valid: false, error: 'Please provide a valid URL (e.g. https://example.com).' };
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' '));
}

function deriveAppNameFromUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const lastSeg = parsed.pathname.split('/').filter(Boolean).pop() || '';
    if (lastSeg.toLowerCase().endsWith('.apk')) {
      return lastSeg
        .replace(/\.apk$/i, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .slice(0, 20);
    }
    const host = parsed.hostname.replace(/^www\.|^m\./i, '');
    const base = host.split('.')[0] || 'WebApp';
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return 'Android App';
  }
}

function derivePackageName(appName: string): string {
  const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'app';
  return `com.android.webapp.${slug}`;
}

async function fetchWebPageSnapshot(targetUrl: string): Promise<VirtualPageSnapshot> {
  const fetchedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    const html = (await response.text()).slice(0, 150000);
    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ');

    const titleMatch = cleaned.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? stripTags(titleMatch[1]) : new URL(targetUrl).hostname;

    const metaDescMatch =
      cleaned.match(/<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i) ||
      cleaned.match(/<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["'][^>]*>/i);
    const description = metaDescMatch ? decodeHtmlEntities(metaDescMatch[1]) : '';

    const headings: string[] = [];
    for (const match of cleaned.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
      const txt = stripTags(match[1]);
      if (txt && txt.length > 2 && headings.length < 8 && !headings.includes(txt)) {
        headings.push(txt.slice(0, 120));
      }
    }

    const paragraphs: string[] = [];
    for (const match of cleaned.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
      const txt = stripTags(match[1]);
      if (txt && txt.length > 20 && paragraphs.length < 6) {
        paragraphs.push(txt.slice(0, 280));
      }
    }

    const links: { label: string; href: string }[] = [];
    for (const match of cleaned.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const rawHref = match[1].trim();
      const label = stripTags(match[2]);
      if (!label || label.length < 2 || rawHref.startsWith('javascript:')) continue;
      try {
        const resolved = new URL(rawHref, targetUrl).toString();
        if (resolved.startsWith('http') && links.length < 12) {
          links.push({ label: label.slice(0, 60), href: resolved });
        }
      } catch {
        // Ignore invalid relative href
      }
    }

    return {
      url: response.url || targetUrl,
      title: title || new URL(targetUrl).hostname,
      description: description || paragraphs[0] || `Loaded ${targetUrl} on Android Chrome.`,
      headings,
      paragraphs,
      links,
      fetchedAt,
    };
  } catch (err) {
    return {
      url: targetUrl,
      title: new URL(targetUrl).hostname,
      description: `Live page preview unavailable (${err instanceof Error ? err.message : 'network error'}).`,
      headings: [],
      paragraphs: [],
      links: [],
      fetchedAt,
      error: err instanceof Error ? err.message : 'Unable to fetch target URL',
    };
  } finally {
    clearTimeout(timer);
  }
}

const wssClients = new Set<WebSocket>();

function broadcast(payload: Record<string, unknown>) {
  const data = JSON.stringify(payload);
  for (const client of wssClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

function getActiveDevices(): DeviceSlot[] {
  return activeMode === 'virtual' ? virtualDevices : hardwareDevices;
}

function appendLog(
  level: LogEntry['level'],
  source: LogEntry['source'],
  message: string,
  deviceId: string | null = null,
  deviceName: string | null = null
) {
  const entry: LogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    level,
    source,
    deviceId,
    deviceName,
    message,
  };
  localLogs = [entry, ...localLogs].slice(0, 500);
  broadcast({ type: 'log:entry', entry });
  return entry;
}

async function checkBinary(name: string): Promise<boolean> {
  try {
    await execFileAsync('which', [name], { timeout: 1500 });
    return true;
  } catch {
    return false;
  }
}

async function probeLocalAdbOnly(): Promise<DeviceSlot[]> {
  const adbAvailable = await checkBinary('adb');
  const scrcpyAvailable = await checkBinary('scrcpy');
  const appiumAvailable = await checkBinary('appium');

  diagnostics = {
    ...diagnostics,
    mode: activeMode,
    pythonBridgeUrl,
    pythonBridgeConnected: false,
    localAdbAvailable: adbAvailable,
    scrcpyAvailable,
    appiumAvailable,
    hostPlatform: process.platform,
    lastSyncAt: new Date().toISOString(),
  };

  if (!adbAvailable) {
    return createEmptyHardwareSlots();
  }

  try {
    const { stdout } = await execFileAsync('adb', ['devices', '-l'], { timeout: 3000 });
    const lines = stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('List of devices'));

    const slots = createEmptyHardwareSlots();
    lines.slice(0, 10).forEach((line, idx) => {
      const parts = line.split(/\s+/);
      const serial = parts[0] || null;
      const state = parts[1] || 'offline';
      const usbToken = parts.find((p) => p.startsWith('usb:')) || null;
      const modelToken = parts.find((p) => p.startsWith('model:')) || null;
      if (serial) {
        slots[idx].serial = serial;
        slots[idx].usbPort = usbToken ? usbToken.replace('usb:', '') : `Slot ${slots[idx].slotId}`;
        slots[idx].usbStatus =
          state === 'device' ? 'online' : state === 'unauthorized' ? 'unauthorized' : 'offline';
        slots[idx].model = modelToken ? modelToken.replace('model:', '').replace(/_/g, ' ') : 'Android Device';
        slots[idx].lastSeenAt = new Date().toISOString();
      }
    });
    return slots;
  } catch (err) {
    diagnostics.lastError = err instanceof Error ? err.message : 'ADB execution error';
    return createEmptyHardwareSlots();
  }
}

async function proxyToPython(
  method: string,
  endpoint: string,
  body?: unknown,
  timeoutMs = 10000
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${pythonBridgeUrl}${endpoint}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

let pythonWs: WebSocket | null = null;
let pythonWsReconnectTimer: NodeJS.Timeout | null = null;

function connectPythonWebSocket() {
  if (activeMode !== 'hardware') return;
  if (pythonWs && (pythonWs.readyState === WebSocket.OPEN || pythonWs.readyState === WebSocket.CONNECTING)) {
    return;
  }
  const wsTarget = pythonBridgeUrl.replace(/^http/i, 'ws') + '/ws';
  try {
    const ws = new WebSocket(wsTarget);
    pythonWs = ws;

    ws.on('open', () => {
      diagnostics.pythonBridgeConnected = true;
      diagnostics.lastError = null;
      appendLog('success', 'Bridge', `Connected live WebSocket to Python hardware service (${pythonBridgeUrl})`);
      syncFromPythonOrLocal();
    });

    ws.on('message', (raw) => {
      if (activeMode !== 'hardware') return;
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (msg.type === 'devices:sync' && Array.isArray(msg.devices)) {
          hardwareDevices = msg.devices as DeviceSlot[];
          if (msg.diagnostics && typeof msg.diagnostics === 'object') {
            diagnostics = {
              ...diagnostics,
              ...(msg.diagnostics as Partial<DiagnosticsState>),
              mode: activeMode,
              pythonBridgeUrl,
              pythonBridgeConnected: true,
              lastSyncAt: new Date().toISOString(),
            };
          }
          broadcast({ type: 'devices:sync', devices: hardwareDevices, diagnostics });
        } else if (msg.type === 'device:updated' && msg.device) {
          const updated = msg.device as DeviceSlot;
          hardwareDevices = hardwareDevices.map((d) => (d.slotId === updated.slotId ? updated : d));
          broadcast({ type: 'device:updated', device: updated });
        } else if (msg.type === 'device:frame') {
          broadcast(msg);
        } else if (msg.type === 'log:entry' && msg.entry) {
          const entry = msg.entry as LogEntry;
          if (!localLogs.some((l) => l.id === entry.id)) {
            localLogs = [entry, ...localLogs].slice(0, 500);
          }
          broadcast({ type: 'log:entry', entry });
        }
      } catch {
        // Ignore malformed frame
      }
    });

    ws.on('close', () => {
      pythonWs = null;
      if (diagnostics.pythonBridgeConnected) {
        diagnostics.pythonBridgeConnected = false;
        if (activeMode === 'hardware') {
          appendLog('warn', 'Bridge', `Lost WebSocket connection to Python hardware service (${pythonBridgeUrl})`);
          broadcast({ type: 'devices:sync', devices: hardwareDevices, diagnostics });
        }
      }
      if (activeMode === 'hardware' && !pythonWsReconnectTimer) {
        pythonWsReconnectTimer = setTimeout(() => {
          pythonWsReconnectTimer = null;
          connectPythonWebSocket();
        }, 4000);
      }
    });

    ws.on('error', () => {
      ws.close();
    });
  } catch {
    if (activeMode === 'hardware' && !pythonWsReconnectTimer) {
      pythonWsReconnectTimer = setTimeout(() => {
        pythonWsReconnectTimer = null;
        connectPythonWebSocket();
      }, 4000);
    }
  }
}

async function syncFromPythonOrLocal() {
  diagnostics.mode = activeMode;
  if (activeMode === 'virtual') {
    diagnostics.lastSyncAt = new Date().toISOString();
    broadcast({ type: 'devices:sync', devices: virtualDevices, diagnostics });
    return;
  }

  try {
    const res = await proxyToPython('GET', '/api/devices', undefined, 3000);
    if (res.ok && Array.isArray(res.data.devices)) {
      hardwareDevices = res.data.devices as DeviceSlot[];
      const remoteDiag = (res.data.diagnostics || {}) as Partial<DiagnosticsState>;
      diagnostics = {
        ...diagnostics,
        ...remoteDiag,
        mode: activeMode,
        pythonBridgeUrl,
        pythonBridgeConnected: true,
        lastSyncAt: new Date().toISOString(),
        lastError: null,
      };
      broadcast({ type: 'devices:sync', devices: hardwareDevices, diagnostics });
      if (!pythonWs || pythonWs.readyState !== WebSocket.OPEN) {
        connectPythonWebSocket();
      }
      return;
    }
  } catch (err) {
    diagnostics.pythonBridgeConnected = false;
    diagnostics.lastError = err instanceof Error ? err.message : 'Python hardware bridge unreachable';
  }

  hardwareDevices = await probeLocalAdbOnly();
  broadcast({ type: 'devices:sync', devices: hardwareDevices, diagnostics });
}

function getVirtualDevice(slotId: string): DeviceSlot | undefined {
  return virtualDevices.find((d) => d.slotId === slotId);
}

function updateVirtualDeviceState(slotId: string, updater: (dev: DeviceSlot) => void): DeviceSlot | null {
  const dev = getVirtualDevice(slotId);
  if (!dev) return null;
  updater(dev);
  dev.lastSeenAt = new Date().toISOString();
  if (dev.virtualState) {
    dev.virtualState.lastInteractionAt = dev.lastSeenAt;
  }
  broadcast({ type: 'device:updated', device: dev });
  return dev;
}

function installAppOnVirtualDevice(
  dev: DeviceSlot,
  name: string,
  url: string,
  source: 'chrome' | 'store',
  color?: string
): InstalledVirtualApp {
  const vs = dev.virtualState!;
  const existing = vs.installedApps.find((a) => a.url === url || a.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    return existing;
  }
  const now = new Date().toISOString();
  const appId = `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const sizeMb = `${(4 + Math.random() * 18).toFixed(1)} MB`;
  const app: InstalledVirtualApp = {
    id: appId,
    name: name.slice(0, 22),
    packageName: derivePackageName(name),
    url,
    color: color || APP_COLORS[vs.installedApps.length % APP_COLORS.length],
    source,
    version: '1.0.0',
    sizeMb,
    installedAt: now,
  };
  vs.installedApps = [app, ...vs.installedApps].slice(0, 24);
  const fileName = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_v1.0.apk`;
  vs.downloads = [
    {
      id: `dl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      fileName,
      url,
      sizeMb,
      status: 'installed' as const,
      downloadedAt: now,
      appId: app.id,
    },
    ...vs.downloads,
  ].slice(0, 30);
  dev.lastSeenAt = now;
  vs.lastInteractionAt = now;
  return app;
}

async function openUrlOnVirtualDevice(dev: DeviceSlot, normalizedUrl: string): Promise<DeviceSlot> {
  const vs = dev.virtualState!;
  vs.activeApp = 'chrome';
  vs.activeWebAppId = null;

  // If user opens a direct .apk link in Chrome, automatically download & install it like real Android Chrome
  if (/\.apk(\?|$)/i.test(normalizedUrl)) {
    const appName = deriveAppNameFromUrl(normalizedUrl);
    installAppOnVirtualDevice(dev, appName, normalizedUrl, 'chrome');
    vs.activeApp = 'downloads';
    dev.currentUrl = normalizedUrl;
    dev.browserStatus = 'Chrome Download';
    dev.currentActivity = APP_ACTIVITIES.downloads;
    broadcast({ type: 'device:updated', device: dev });
    return dev;
  }

  const nextHistory = vs.history.slice(0, vs.historyIndex + 1);
  if (nextHistory[nextHistory.length - 1] !== normalizedUrl) {
    nextHistory.push(normalizedUrl);
  }
  vs.history = nextHistory;
  vs.historyIndex = nextHistory.length - 1;
  vs.scrollY = 0;
  vs.pageLoading = true;
  dev.currentUrl = normalizedUrl;
  dev.browserStatus = 'Chrome Active';
  dev.currentActivity = APP_ACTIVITIES.chrome;
  dev.active = true;
  dev.mirrorStatus = 'streaming';
  dev.fps = 60;
  broadcast({ type: 'device:updated', device: dev });

  // Fetch Reader-mode snapshot in background so live Chrome iframe loads immediately without double-waiting
  void fetchWebPageSnapshot(normalizedUrl)
    .then((snapshot) => {
      if (dev.currentUrl === normalizedUrl && dev.virtualState) {
        dev.virtualState.pageSnapshot = snapshot;
        dev.virtualState.pageLoading = false;
        dev.lastSeenAt = new Date().toISOString();
        broadcast({ type: 'device:updated', device: dev });
      }
    })
    .catch(() => {
      if (dev.currentUrl === normalizedUrl && dev.virtualState) {
        dev.virtualState.pageLoading = false;
        broadcast({ type: 'device:updated', device: dev });
      }
    });

  return dev;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, diagnostics });
  });

  // Helper: extract clean search query if URL is a search engine query
  function extractSearchQuery(raw: string): { isSearch: boolean; query: string } {
    try {
      const u = new URL(raw);
      const host = u.hostname.toLowerCase();
      if (
        host === 'html.duckduckgo.com' ||
        host === 'duckduckgo.com' ||
        host === 'www.duckduckgo.com' ||
        (host.endsWith('google.com') && u.pathname.startsWith('/search'))
      ) {
        return { isSearch: true, query: (u.searchParams.get('q') || '').trim() };
      }
    } catch {
      // Ignore
    }
    return { isSearch: false, query: '' };
  }

  function unwrapRedirectUrl(rawUrl: string): string {
    try {
      const u = new URL(rawUrl);
      const uddg = u.searchParams.get('uddg') || u.searchParams.get('rut_url');
      if (uddg && (uddg.startsWith('http://') || uddg.startsWith('https://'))) {
        return uddg;
      }
      if (u.hostname.endsWith('google.com') && u.pathname === '/url') {
        const target = u.searchParams.get('q') || u.searchParams.get('url');
        if (target && (target.startsWith('http://') || target.startsWith('https://'))) {
          return target;
        }
      }
    } catch {
      // Ignore
    }
    return rawUrl;
  }

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function renderMobileSearchPage(query: string): Promise<string> {
    interface SearchItem {
      title: string;
      url: string;
      domain: string;
      snippet: string;
    }

    const results: SearchItem[] = [];
    const seenUrls = new Set<string>();

    if (query) {
      // 1. Primary live search via DuckDuckGo HTML
      try {
        const ddgCtrl = new AbortController();
        const ddgTimer = setTimeout(() => ddgCtrl.abort(), 5500);
        try {
          const ddgRes = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
            method: 'GET',
            redirect: 'follow',
            signal: ddgCtrl.signal,
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
              Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
            },
          });
          if (ddgRes.ok) {
            const html = await ddgRes.text();
            const blockRegex =
              /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>|<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>)?/gi;
            let match: RegExpExecArray | null;
            while ((match = blockRegex.exec(html)) !== null && results.length < 12) {
              let rawHref = decodeHtmlEntities(match[1]);
              if (rawHref.startsWith('//')) rawHref = `https:${rawHref}`;
              const cleanUrl = unwrapRedirectUrl(rawHref);
              if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) continue;
              if (seenUrls.has(cleanUrl)) continue;
              const check = validateAuthorizedUrl(cleanUrl);
              if (!check.valid) continue;
              seenUrls.add(cleanUrl);
              let domain = cleanUrl;
              try {
                domain = new URL(cleanUrl).hostname.replace(/^www\./, '');
              } catch {
                // Keep raw
              }
              const title = stripTags(match[2]).slice(0, 120);
              const snippet = stripTags(match[3] || match[4] || '').slice(0, 220);
              if (title) {
                results.push({ title, url: cleanUrl, domain, snippet });
              }
            }
          }
        } finally {
          clearTimeout(ddgTimer);
        }
      } catch {
        // Fallback below
      }

      // 2. Fallback / supplement via Wikipedia Search API if needed so search always returns clean real results
      if (results.length < 3) {
        try {
          const wikiCtrl = new AbortController();
          const wikiTimer = setTimeout(() => wikiCtrl.abort(), 4500);
          try {
            const wikiRes = await fetch(
              `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=8&utf8=1&format=json`,
              {
                signal: wikiCtrl.signal,
                headers: {
                  'User-Agent': 'AndroidRackBrowser/1.0',
                  Accept: 'application/json',
                },
              }
            );
            if (wikiRes.ok) {
              const data = (await wikiRes.json()) as {
                query?: { search?: Array<{ title: string; snippet: string }> };
              };
              for (const item of data.query?.search || []) {
                const url = `https://en.m.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`;
                if (seenUrls.has(url)) continue;
                seenUrls.add(url);
                results.push({
                  title: `${item.title} — Wikipedia`,
                  url,
                  domain: 'en.m.wikipedia.org',
                  snippet: stripTags(item.snippet),
                });
              }
            }
          } finally {
            clearTimeout(wikiTimer);
          }
        } catch {
          // Ignore
        }
      }
    }

    const cardsHtml = results.length
      ? results
          .map(
            (r) => `
        <a class="card" href="${escapeHtml(r.url)}">
          <div class="domain">${escapeHtml(r.domain)}</div>
          <div class="title">${escapeHtml(r.title)}</div>
          ${r.snippet ? `<div class="snippet">${escapeHtml(r.snippet)}</div>` : ''}
        </a>`
          )
          .join('')
      : query
      ? `<div class="empty">No results found for "${escapeHtml(query)}". Try another search term or enter a direct website URL like <strong>wikipedia.org</strong>.</div>`
      : `<div class="quick-grid">
          <a class="quick" href="https://en.m.wikipedia.org">Wikipedia</a>
          <a class="quick" href="https://www.bbc.com/news">BBC News</a>
          <a class="quick" href="https://news.ycombinator.com">Hacker News</a>
          <a class="quick" href="https://github.com">GitHub</a>
          <a class="quick" href="https://example.com">Example.com</a>
          <a class="quick" href="https://www.openstreetmap.org">OpenStreetMap</a>
        </div>`;

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${query ? `${escapeHtml(query)} - Search` : 'Chrome Mobile Search'}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #0f172a; }
    .top { position: sticky; top: 0; background: #ffffff; border-bottom: 1px solid #e2e8f0; padding: 10px 12px; z-index: 10; }
    .brand { font-size: 13px; font-weight: 700; color: #2563eb; margin-bottom: 6px; letter-spacing: -0.01em; }
    form { display: flex; gap: 6px; }
    input { flex: 1; min-width: 0; padding: 8px 12px; border-radius: 999px; border: 1px solid #cbd5e1; font-size: 13px; outline: none; background: #f8fafc; color: #0f172a; }
    input:focus { border-color: #2563eb; background: #fff; }
    button { padding: 8px 14px; border-radius: 999px; border: 0; background: #2563eb; color: #fff; font-size: 12px; font-weight: 600; cursor: pointer; }
    .list { padding: 10px 12px 24px; display: flex; flex-direction: column; gap: 10px; }
    .meta { font-size: 11px; color: #64748b; padding: 0 2px; }
    .card { display: block; text-decoration: none; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 11px 12px; transition: border-color 0.15s, background 0.15s; }
    .card:hover { border-color: #93c5fd; background: #f8fbff; }
    .domain { font-size: 11px; color: #059669; font-weight: 500; margin-bottom: 2px; word-break: break-all; }
    .title { font-size: 14px; font-weight: 600; color: #1d4ed8; line-height: 1.3; margin-bottom: 4px; }
    .snippet { font-size: 12px; color: #475569; line-height: 1.45; }
    .empty { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; font-size: 12px; color: #475569; line-height: 1.5; }
    .quick-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .quick { display: block; text-align: center; text-decoration: none; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 8px; font-size: 12px; font-weight: 600; color: #1e293b; }
    .quick:hover { border-color: #2563eb; color: #2563eb; }
  </style>
</head>
<body>
  <div class="top">
    <div class="brand">Chrome Web Search</div>
    <form id="search-form">
      <input id="q" type="text" value="${escapeHtml(query)}" placeholder="Search Google / Web or enter URL..." autocomplete="off" />
      <button type="submit">Search</button>
    </form>
  </div>
  <div class="list">
    ${query ? `<div class="meta">${results.length} live results for "${escapeHtml(query)}"</div>` : ''}
    ${cardsHtml}
  </div>
  <script>
    document.getElementById('search-form').addEventListener('submit', function(e) {
      e.preventDefault();
      var val = (document.getElementById('q').value || '').trim();
      if (!val) return;
      window.parent.postMessage({ type: 'virtual-chrome:navigate', url: val }, '*');
    });
    document.addEventListener('click', function(e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      var href = a.getAttribute('href');
      if (!href) return;
      e.preventDefault();
      window.parent.postMessage({ type: 'virtual-chrome:navigate', url: href }, '*');
    }, true);
  </script>
</body>
</html>`;
  }

  // Built-in Authorized QA Real Task Sandbox (same-origin interactive mobile test page for the QA Real Bot)
  app.get('/api/real-tasks', (_req: Request, res: Response) => {
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>QA Real Task Sandbox</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #0f172a; padding: 12px; }
    .header { background: #0f172a; color: #fff; border-radius: 12px; padding: 12px; margin-bottom: 10px; }
    .header-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .title { font-size: 13px; font-weight: 700; letter-spacing: -0.01em; }
    .cycle { font-family: ui-monospace, monospace; font-size: 11px; color: #38bdf8; }
    .sub { font-size: 11px; color: #94a3b8; margin-top: 3px; }
    .bar-wrap { height: 6px; background: #1e293b; border-radius: 999px; overflow: hidden; margin-top: 9px; }
    .bar { height: 100%; width: 0%; background: linear-gradient(90deg, #06b6d4, #10b981); transition: width 0.3s ease; }
    .tasks { display: flex; flex-direction: column; gap: 8px; }
    .task { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 11px; display: flex; align-items: center; justify-content: space-between; gap: 10px; cursor: pointer; transition: border-color 0.2s, background 0.2s; }
    .task.active { border-color: #0284c7; background: #f0f9ff; }
    .task.done { border-color: #10b981; background: #ecfdf5; }
    .t-name { font-size: 12px; font-weight: 600; color: #0f172a; }
    .t-desc { font-size: 10px; color: #64748b; margin-top: 2px; }
    .status { font-family: ui-monospace, monospace; font-size: 10px; font-weight: 600; white-space: nowrap; color: #64748b; }
    .task.active .status { color: #0284c7; }
    .task.done .status { color: #059669; }
    .footer { margin-top: 10px; font-family: ui-monospace, monospace; font-size: 10px; color: #64748b; display: flex; justify-content: space-between; padding: 0 2px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-top">
      <div class="title">QA Real Task Runner</div>
      <div class="cycle" id="cycle-label">Cycle #1</div>
    </div>
    <div class="sub">Authorized local UI test sandbox · 3s real step interval</div>
    <div class="bar-wrap"><div class="bar" id="progress-bar"></div></div>
  </div>

  <div class="tasks" id="task-list">
    <div class="task" data-idx="0">
      <div><div class="t-name">Task 1: Viewport &amp; Render Check</div><div class="t-desc">Verify 9:16 mobile layout &amp; fonts</div></div>
      <span class="status">Pending</span>
    </div>
    <div class="task" data-idx="1">
      <div><div class="t-name">Task 2: Form &amp; Button Interaction</div><div class="t-desc">Validate touch targets &amp; input focus</div></div>
      <span class="status">Pending</span>
    </div>
    <div class="task" data-idx="2">
      <div><div class="t-name">Task 3: Navigation Flow Check</div><div class="t-desc">Verify route transition &amp; scroll state</div></div>
      <span class="status">Pending</span>
    </div>
    <div class="task" data-idx="3">
      <div><div class="t-name">Task 4: Session Health Verify</div><div class="t-desc">Confirm 60 fps &amp; clean DOM state</div></div>
      <span class="status">Pending</span>
    </div>
  </div>

  <div class="footer">
    <span id="done-count">Completed: 0 / 4</span>
    <span id="total-completed">Total Done: 0</span>
  </div>

  <script>
    var tasks = Array.prototype.slice.call(document.querySelectorAll('.task'));
    var bar = document.getElementById('progress-bar');
    var cycleLabel = document.getElementById('cycle-label');
    var doneCountEl = document.getElementById('done-count');
    var totalEl = document.getElementById('total-completed');
    var totalDone = 0;

    function updateProgress() {
      var done = tasks.filter(function(el) { return el.classList.contains('done'); }).length;
      bar.style.width = ((done / tasks.length) * 100) + '%';
      doneCountEl.textContent = 'Completed: ' + done + ' / ' + tasks.length;
      totalEl.textContent = 'Total Done: ' + totalDone;
    }

    function executeDemoTask(idx, cycle) {
      if (cycle) cycleLabel.textContent = 'Cycle #' + cycle;
      if (idx === 0) {
        tasks.forEach(function(el) {
          el.classList.remove('done', 'active');
          el.querySelector('.status').textContent = 'Pending';
        });
      }
      var el = tasks[idx];
      if (!el) return;
      el.classList.remove('done');
      el.classList.add('active');
      el.querySelector('.status').textContent = 'Running...';
      updateProgress();

      window.setTimeout(function() {
        el.classList.remove('active');
        el.classList.add('done');
        el.querySelector('.status').textContent = 'Done ✓';
        totalDone += 1;
        updateProgress();
      }, 650);
    }

    tasks.forEach(function(el, i) {
      el.addEventListener('click', function() { executeDemoTask(i); });
    });

    window.addEventListener('message', function(e) {
      if (e.data && e.data.type === 'qa-real:run-task') {
        executeDemoTask(Number(e.data.taskIndex) || 0, Number(e.data.runs) || 1);
      }
    });
  </script>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.removeHeader('X-Frame-Options');
    return res.status(200).send(html);
  });

  // Auto-detect whether a website can render natively (direct iframe for SPAs like Netlify/Vercel) or needs proxy
  app.get('/api/browser-check', async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    const unwrappedInput = unwrapRedirectUrl(rawUrl);
    const validation = validateAuthorizedUrl(unwrappedInput);
    if (!validation.valid || !validation.normalized) {
      return res.json({ ok: false, mode: 'proxy', error: validation.error });
    }
    const targetUrl = unwrapRedirectUrl(validation.normalized);
    if (targetUrl.includes('/api/real-tasks')) {
      return res.json({ ok: true, mode: 'direct', finalUrl: targetUrl });
    }
    const searchCheck = extractSearchQuery(targetUrl);
    if (searchCheck.isSearch) {
      return res.json({ ok: true, mode: 'proxy', finalUrl: targetUrl });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const headRes = await fetch(targetUrl, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
        },
      });
      const xfo = (headRes.headers.get('x-frame-options') || '').toLowerCase();
      const csp = (headRes.headers.get('content-security-policy') || '').toLowerCase();
      const blockedByXfo = xfo.includes('deny') || xfo.includes('sameorigin');
      const blockedByCsp =
        csp.includes('frame-ancestors') &&
        !csp.includes('frame-ancestors *') &&
        !csp.includes('frame-ancestors https:');

      return res.json({
        ok: true,
        mode: blockedByXfo || blockedByCsp ? 'proxy' : 'direct',
        finalUrl: headRes.url || targetUrl,
      });
    } catch {
      return res.json({ ok: true, mode: 'direct', finalUrl: targetUrl });
    } finally {
      clearTimeout(timer);
    }
  });

  // Mobile Chrome WebView proxy so real websites & searches render smoothly inside Android phone iframes
  app.get('/api/browser-proxy', async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    const unwrappedInput = unwrapRedirectUrl(rawUrl);
    const validation = validateAuthorizedUrl(unwrappedInput);
    if (!validation.valid || !validation.normalized) {
      return res
        .status(400)
        .send(
          `<html><body style="font-family:sans-serif;padding:24px;color:#0f172a"><h3>Invalid URL</h3><p>${validation.error || 'Blocked'}</p></body></html>`
        );
    }

    const targetUrl = unwrapRedirectUrl(validation.normalized);
    const searchCheck = extractSearchQuery(targetUrl);
    if (searchCheck.isSearch) {
      const searchHtml = await renderMobileSearchPage(searchCheck.query);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.removeHeader('X-Frame-Options');
      return res.status(200).send(searchHtml);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);

    try {
      const upstream = await fetch(targetUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      const contentType = upstream.headers.get('content-type') || 'text/html; charset=utf-8';
      if (!contentType.includes('text/html')) {
        const buffer = Buffer.from(await upstream.arrayBuffer());
        res.setHeader('Content-Type', contentType);
        return res.status(upstream.status).send(buffer);
      }

      let html = await upstream.text();
      // Remove CSP meta tags that would block our navigation bridge script
      html = html.replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');

      const finalUrl = upstream.url || targetUrl;
      const baseTag = `<base href="${finalUrl.replace(/"/g, '&quot;')}" target="_self">`;
      const bridgeScript = `<script>
        (function() {
          function unwrap(u) {
            try {
              var parsed = new URL(u, document.baseURI);
              var uddg = parsed.searchParams.get('uddg');
              if (uddg && (uddg.startsWith('http://') || uddg.startsWith('https://'))) return uddg;
              return parsed.toString();
            } catch (_) {
              return u;
            }
          }
          document.addEventListener('click', function(e) {
            var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
            if (!a) return;
            var href = a.getAttribute('href');
            if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
            var resolved = unwrap(href);
            if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
              e.preventDefault();
              window.parent.postMessage({ type: 'virtual-chrome:navigate', url: resolved }, '*');
            }
          }, true);
          document.addEventListener('submit', function(e) {
            var form = e.target;
            if (!form || form.tagName !== 'FORM') return;
            try {
              var action = form.getAttribute('action') || document.baseURI;
              var target = new URL(action, document.baseURI);
              var fd = new FormData(form);
              fd.forEach(function(val, key) {
                if (typeof val === 'string') target.searchParams.set(key, val);
              });
              e.preventDefault();
              window.parent.postMessage({ type: 'virtual-chrome:navigate', url: target.toString() }, '*');
            } catch (_) {}
          }, true);
        })();
      </script>`;

      if (/<head[^>]*>/i.test(html)) {
        html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${baseTag}\n${bridgeScript}`);
      } else {
        html = `<head>${baseTag}${bridgeScript}</head>${html}`;
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.removeHeader('X-Frame-Options');
      return res.status(200).send(html);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to load website';
      return res
        .status(200)
        .send(
          `<!doctype html><html><body style="font-family:system-ui,sans-serif;padding:24px;background:#f8fafc;color:#0f172a">
            <h3 style="margin:0 0 8px;font-size:16px">Could not render live page</h3>
            <p style="margin:0 0 12px;font-size:13px;color:#475569">${escapeHtml(msg)}</p>
            <p style="margin:0;font-size:12px;color:#64748b">Switch to Reader view in the Chrome bar above or try another URL.</p>
          </body></html>`
        );
    } finally {
      clearTimeout(timer);
    }
  });

  app.get('/api/devices', async (_req: Request, res: Response) => {
    await syncFromPythonOrLocal();
    res.json({ ok: true, devices: getActiveDevices(), diagnostics });
  });

  app.post('/api/mode', async (req: Request, res: Response) => {
    const requested = req.body?.mode === 'hardware' ? 'hardware' : 'virtual';
    activeMode = requested;
    diagnostics.mode = activeMode;
    if (activeMode === 'hardware') {
      await syncFromPythonOrLocal();
      appendLog('info', 'Bridge', 'Switched to Kali Linux Physical Hardware Bridge mode.');
    } else {
      if (pythonWs) {
        pythonWs.close();
        pythonWs = null;
      }
      diagnostics.lastError = null;
      diagnostics.lastSyncAt = new Date().toISOString();
      appendLog('success', 'VirtualOS', 'Switched to 10 Interactive Virtual Android Devices mode.');
      broadcast({ type: 'devices:sync', devices: virtualDevices, diagnostics });
    }
    res.json({
      ok: true,
      devices: getActiveDevices(),
      diagnostics,
      message:
        activeMode === 'virtual'
          ? `Active: ${virtualDevices.length} Interactive Virtual Android Phones`
          : 'Active: Kali Linux Hardware Bridge Mode',
    });
  });

  // Scale virtual Android fleet count (1 to 100 devices)
  app.post('/api/virtual/count', (req: Request, res: Response) => {
    const rawCount = Number(req.body?.count);
    if (!Number.isFinite(rawCount) || rawCount < 1 || rawCount > 100) {
      return res.status(400).json({ ok: false, error: 'Device count must be between 1 and 100.' });
    }
    const nextCount = Math.floor(rawCount);
    activeMode = 'virtual';
    diagnostics.mode = 'virtual';
    const updated = resizeVirtualFleet(nextCount);
    appendLog('success', 'VirtualOS', `Scaled virtual Android fleet to ${updated.length} devices.`);
    broadcast({ type: 'devices:sync', devices: updated, diagnostics });
    return res.json({
      ok: true,
      count: updated.length,
      devices: updated,
      diagnostics,
      message: `Virtual fleet updated to ${updated.length} Android phones.`,
    });
  });

  app.post('/api/devices/scan', async (_req: Request, res: Response) => {
    if (activeMode === 'virtual') {
      const onlineCount = virtualDevices.filter((d) => d.usbStatus === 'online').length;
      appendLog('info', 'VirtualOS', `Scanned virtual fleet: ${onlineCount} of 10 Android devices online.`);
      broadcast({ type: 'devices:sync', devices: virtualDevices, diagnostics });
      return res.json({
        ok: true,
        devices: virtualDevices,
        diagnostics,
        message: `10 Android phones active (${onlineCount} online).`,
      });
    }

    try {
      const pyRes = await proxyToPython('POST', '/api/devices/scan', undefined, 6000);
      if (pyRes.ok && Array.isArray(pyRes.data.devices)) {
        hardwareDevices = pyRes.data.devices as DeviceSlot[];
        diagnostics.pythonBridgeConnected = true;
        diagnostics.lastSyncAt = new Date().toISOString();
        broadcast({ type: 'devices:sync', devices: hardwareDevices, diagnostics });
        return res.json({
          ok: true,
          devices: hardwareDevices,
          diagnostics,
          message: (pyRes.data.message as string) || 'Device scan completed',
        });
      }
      return res.status(pyRes.status).json(pyRes.data);
    } catch {
      hardwareDevices = await probeLocalAdbOnly();
      const onlineCount = hardwareDevices.filter((d) => d.usbStatus === 'online').length;
      appendLog('info', 'ADB', `Local ADB scan completed. ${onlineCount} device(s) online.`);
      broadcast({ type: 'devices:sync', devices: hardwareDevices, diagnostics });
      return res.json({
        ok: true,
        devices: hardwareDevices,
        diagnostics,
        message: diagnostics.localAdbAvailable
          ? `Scanned local ADB: ${onlineCount} device(s) detected.`
          : 'Python hardware bridge offline.',
      });
    }
  });

  app.post('/api/bridge/config', async (req: Request, res: Response) => {
    const nextUrl = typeof req.body?.pythonBridgeUrl === 'string' ? req.body.pythonBridgeUrl.trim() : '';
    if (!nextUrl) {
      return res.status(400).json({ ok: false, error: 'pythonBridgeUrl is required' });
    }
    try {
      const parsed = new URL(nextUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return res.status(400).json({ ok: false, error: 'Bridge URL must use http:// or https://' });
      }
      pythonBridgeUrl = nextUrl.replace(/\/+$/, '');
      diagnostics.pythonBridgeUrl = pythonBridgeUrl;
      if (pythonWs) {
        pythonWs.close();
        pythonWs = null;
      }
      await syncFromPythonOrLocal();
      appendLog(
        diagnostics.pythonBridgeConnected ? 'success' : 'warn',
        'Bridge',
        `Bridge URL set to ${pythonBridgeUrl} (${diagnostics.pythonBridgeConnected ? 'Connected' : 'Unreachable'})`
      );
      return res.json({
        ok: true,
        devices: getActiveDevices(),
        diagnostics,
        message: diagnostics.pythonBridgeConnected
          ? `Connected to Python hardware service at ${pythonBridgeUrl}`
          : `Saved ${pythonBridgeUrl} (currently unreachable).`,
      });
    } catch {
      return res.status(400).json({ ok: false, error: 'Invalid bridge URL format' });
    }
  });

  app.get('/api/logs', async (_req: Request, res: Response) => {
    if (activeMode === 'hardware') {
      try {
        const pyRes = await proxyToPython('GET', '/api/logs', undefined, 2500);
        if (pyRes.ok && Array.isArray(pyRes.data.logs)) {
          return res.json({ ok: true, logs: pyRes.data.logs });
        }
      } catch {
        // Fallback to local logs
      }
    }
    return res.json({ ok: true, logs: localLogs });
  });

  app.delete('/api/logs', async (_req: Request, res: Response) => {
    localLogs = [];
    if (activeMode === 'hardware') {
      try {
        await proxyToPython('DELETE', '/api/logs', undefined, 2500);
      } catch {
        // Ignore
      }
    }
    broadcast({ type: 'logs:sync', logs: [] });
    res.json({ ok: true });
  });

  // Virtual app launcher, installer, uninstaller & notes endpoints
  app.post('/api/devices/:slotId/app/open', (req: Request, res: Response) => {
    const slotId = req.params.slotId;
    if (activeMode !== 'virtual') {
      return res.status(400).json({ ok: false, error: 'Virtual app switch is only available in Virtual mode.' });
    }
    const appId = (req.body?.appId as VirtualAppId) || 'launcher';
    const webAppId = typeof req.body?.webAppId === 'string' ? req.body.webAppId : null;
    const dev = getVirtualDevice(slotId);
    if (!dev || dev.usbStatus !== 'online') {
      return res.status(400).json({ ok: false, error: `Device ${slotId} is offline.` });
    }
    updateVirtualDeviceState(slotId, (d) => {
      d.virtualState!.activeApp = appId;
      d.virtualState!.activeWebAppId = webAppId;
      if (appId === 'webapp' && webAppId) {
        const found = d.virtualState!.installedApps.find((a) => a.id === webAppId);
        if (found) {
          d.currentUrl = found.url;
          d.currentActivity = `${found.packageName}/.MainActivity`;
          d.browserStatus = `${found.name} Active`;
          return;
        }
      }
      d.currentActivity = APP_ACTIVITIES[appId] || APP_ACTIVITIES.launcher;
      d.browserStatus = appId === 'chrome' ? 'Chrome Active' : 'Chrome Ready';
    });
    appendLog('info', 'VirtualOS', `Opened ${appId} on ${dev.name}`, slotId, dev.name);
    return res.json({ ok: true, device: dev, message: `Opened ${appId} on ${dev.name}` });
  });

  app.post('/api/devices/:slotId/apps/install', (req: Request, res: Response) => {
    const slotId = req.params.slotId;
    if (activeMode !== 'virtual') {
      return res.status(400).json({ ok: false, error: 'Chrome app installer is available in Virtual Android mode.' });
    }
    const dev = getVirtualDevice(slotId);
    if (!dev || dev.usbStatus !== 'online') {
      return res.status(400).json({ ok: false, error: `Device ${slotId} is offline.` });
    }
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : dev.currentUrl || '';
    const validation = validateAuthorizedUrl(rawUrl);
    if (!validation.valid || !validation.normalized) {
      return res.status(400).json({ ok: false, error: validation.error || 'Valid app URL is required.' });
    }
    const name =
      typeof req.body?.name === 'string' && req.body.name.trim()
        ? req.body.name.trim()
        : deriveAppNameFromUrl(validation.normalized);
    const source = req.body?.source === 'store' ? 'store' : 'chrome';
    const color = typeof req.body?.color === 'string' ? req.body.color : undefined;

    const installed = installAppOnVirtualDevice(dev, name, validation.normalized, source, color);
    broadcast({ type: 'device:updated', device: dev });
    appendLog('success', 'VirtualOS', `Installed ${installed.name} (${installed.sizeMb}) on ${dev.name}`, slotId, dev.name);
    return res.json({
      ok: true,
      device: dev,
      app: installed,
      message: `Installed ${installed.name} on ${dev.name}`,
    });
  });

  app.post('/api/devices/:slotId/apps/uninstall', (req: Request, res: Response) => {
    const slotId = req.params.slotId;
    const appId = typeof req.body?.appId === 'string' ? req.body.appId : '';
    const dev = getVirtualDevice(slotId);
    if (!dev) return res.status(404).json({ ok: false, error: `Device ${slotId} not found.` });
    let removedName = 'App';
    updateVirtualDeviceState(slotId, (d) => {
      const target = d.virtualState!.installedApps.find((a) => a.id === appId);
      if (target) removedName = target.name;
      d.virtualState!.installedApps = d.virtualState!.installedApps.filter((a) => a.id !== appId);
      if (d.virtualState!.activeWebAppId === appId) {
        d.virtualState!.activeWebAppId = null;
        d.virtualState!.activeApp = 'launcher';
        d.currentActivity = APP_ACTIVITIES.launcher;
      }
    });
    appendLog('info', 'VirtualOS', `Uninstalled ${removedName} from ${dev.name}`, slotId, dev.name);
    return res.json({ ok: true, device: dev, message: `Uninstalled ${removedName} from ${dev.name}` });
  });

  app.post('/api/devices/:slotId/notes/save', (req: Request, res: Response) => {
    const slotId = req.params.slotId;
    const dev = getVirtualDevice(slotId);
    if (!dev) {
      return res.status(404).json({ ok: false, error: `Device ${slotId} not found.` });
    }
    const noteText = typeof req.body?.noteText === 'string' ? req.body.noteText : '';
    updateVirtualDeviceState(slotId, (d) => {
      d.virtualState!.noteText = noteText;
    });
    return res.json({ ok: true, device: dev });
  });

  // Open URL endpoint (works in both Virtual and Hardware modes)
  app.post('/api/devices/:slotId/browser/url', async (req: Request, res: Response) => {
    const slotId = req.params.slotId;
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const validation = validateAuthorizedUrl(rawUrl);
    if (!validation.valid || !validation.normalized) {
      appendLog('warn', 'Appium', validation.error || 'Blocked URL', slotId, `Device ${slotId}`);
      return res.status(400).json({ ok: false, error: validation.error });
    }

    if (activeMode === 'virtual') {
      const dev = getVirtualDevice(slotId);
      if (!dev) return res.status(404).json({ ok: false, error: `Device ${slotId} not found` });
      if (dev.usbStatus !== 'online') {
        return res.status(400).json({ ok: false, error: `${dev.name} is offline. Click Connect first.` });
      }
      await openUrlOnVirtualDevice(dev, validation.normalized);
      appendLog('success', 'VirtualOS', `Opened ${validation.normalized} in Chrome`, slotId, dev.name);
      return res.json({ ok: true, device: dev, message: `${dev.name} loaded ${validation.normalized}` });
    }

    try {
      const pyRes = await proxyToPython(
        'POST',
        `/api/devices/${slotId}/browser/url`,
        { url: validation.normalized },
        15000
      );
      return res.status(pyRes.status).json(pyRes.data);
    } catch {
      const msg = `Cannot open URL on Device ${slotId}: Python hardware bridge (${pythonBridgeUrl}) is offline.`;
      appendLog('error', 'Bridge', msg, slotId, `Device ${slotId}`);
      return res.status(503).json({ ok: false, error: msg });
    }
  });

  // Individual device routes
  const devicePostRoutes = [
    'connect',
    'pair',
    'tcpip',
    'disconnect',
    'start',
    'stop',
    'browser/open',
    'browser/reload',
    'input/back',
    'input/home',
    'input/tap',
    'input/swipe',
    'input/text',
    'screenshot',
  ];

  for (const routeSuffix of devicePostRoutes) {
    app.post(`/api/devices/:slotId/${routeSuffix}`, async (req: Request, res: Response) => {
      const slotId = req.params.slotId;

      if (activeMode === 'virtual') {
        const dev = getVirtualDevice(slotId);
        if (!dev) {
          return res.status(404).json({ ok: false, error: `Invalid slot ${slotId}` });
        }

        if (routeSuffix === 'connect' || routeSuffix === 'pair') {
          updateVirtualDeviceState(slotId, (d) => {
            d.usbStatus = 'online';
            d.active = true;
            d.mirrorStatus = 'streaming';
            d.appiumStatus = 'active';
            d.fps = 60;
            d.browserStatus = d.virtualState?.activeApp === 'chrome' ? 'Chrome Active' : 'Chrome Ready';
            d.currentActivity = APP_ACTIVITIES[d.virtualState?.activeApp || 'launcher'];
          });
          appendLog('success', 'VirtualOS', `${dev.name} (${dev.model}) connected online.`, slotId, dev.name);
          return res.json({ ok: true, device: dev, message: `${dev.name} connected online.` });
        }

        if (routeSuffix === 'disconnect') {
          updateVirtualDeviceState(slotId, (d) => {
            d.usbStatus = 'offline';
            d.active = false;
            d.mirrorStatus = 'stopped';
            d.appiumStatus = 'idle';
            d.fps = 0;
            d.browserStatus = 'Offline';
            d.currentActivity = '—';
          });
          appendLog('info', 'VirtualOS', `${dev.name} disconnected.`, slotId, dev.name);
          return res.json({ ok: true, device: dev, message: `${dev.name} disconnected.` });
        }

        if (dev.usbStatus !== 'online') {
          return res.status(400).json({ ok: false, error: `${dev.name} is offline. Click Connect first.` });
        }

        if (routeSuffix === 'start') {
          updateVirtualDeviceState(slotId, (d) => {
            d.active = true;
            d.mirrorStatus = 'streaming';
            d.appiumStatus = 'active';
            d.fps = 60;
          });
          appendLog('success', 'scrcpy', `Started live screen stream on ${dev.name}`, slotId, dev.name);
          return res.json({ ok: true, device: dev, message: `Started ${dev.name} live screen.` });
        }

        if (routeSuffix === 'stop') {
          updateVirtualDeviceState(slotId, (d) => {
            d.active = false;
            d.mirrorStatus = 'stopped';
            d.appiumStatus = 'idle';
            d.fps = 0;
          });
          appendLog('info', 'scrcpy', `Stopped live screen stream on ${dev.name}`, slotId, dev.name);
          return res.json({ ok: true, device: dev, message: `Stopped ${dev.name} live screen.` });
        }

        if (routeSuffix === 'browser/open') {
          updateVirtualDeviceState(slotId, (d) => {
            d.virtualState!.activeApp = 'chrome';
            d.virtualState!.activeWebAppId = null;
            d.browserStatus = 'Chrome Active';
            d.currentActivity = APP_ACTIVITIES.chrome;
          });
          appendLog('success', 'VirtualOS', `Opened Chrome browser on ${dev.name}`, slotId, dev.name);
          return res.json({ ok: true, device: dev, message: `Opened Chrome on ${dev.name}` });
        }

        if (routeSuffix === 'browser/reload') {
          const current = dev.currentUrl;
          if (current) {
            await openUrlOnVirtualDevice(dev, current);
            appendLog('info', 'VirtualOS', `Reloaded ${current} on ${dev.name}`, slotId, dev.name);
            return res.json({ ok: true, device: dev, message: `Reloaded ${current}` });
          }
          return res.json({ ok: true, device: dev, message: `Reloaded browser tab on ${dev.name}` });
        }

        if (routeSuffix === 'input/home') {
          updateVirtualDeviceState(slotId, (d) => {
            d.virtualState!.activeApp = 'launcher';
            d.virtualState!.activeWebAppId = null;
            d.browserStatus = 'Chrome Ready';
            d.currentActivity = APP_ACTIVITIES.launcher;
          });
          appendLog('info', 'VirtualOS', `Pressed Home on ${dev.name}`, slotId, dev.name);
          return res.json({ ok: true, device: dev, message: `${dev.name} returned to Home screen.` });
        }

        if (routeSuffix === 'input/back') {
          const vs = dev.virtualState!;
          if (vs.activeApp === 'chrome' && vs.historyIndex > 0) {
            vs.historyIndex -= 1;
            const prevUrl = vs.history[vs.historyIndex];
            dev.currentUrl = prevUrl;
            vs.pageSnapshot = await fetchWebPageSnapshot(prevUrl);
            broadcast({ type: 'device:updated', device: dev });
            appendLog('info', 'VirtualOS', `Navigated Back to ${prevUrl} on ${dev.name}`, slotId, dev.name);
            return res.json({ ok: true, device: dev, message: `Navigated back to ${prevUrl}` });
          }
          updateVirtualDeviceState(slotId, (d) => {
            d.virtualState!.activeApp = 'launcher';
            d.virtualState!.activeWebAppId = null;
            d.browserStatus = 'Chrome Ready';
            d.currentActivity = APP_ACTIVITIES.launcher;
          });
          appendLog('info', 'VirtualOS', `Pressed Back on ${dev.name}`, slotId, dev.name);
          return res.json({ ok: true, device: dev, message: `Sent Back to ${dev.name}` });
        }

        if (routeSuffix === 'input/swipe') {
          const y1 = Number(req.body?.y1 || 1400);
          const y2 = Number(req.body?.y2 || 600);
          const delta = y1 > y2 ? 160 : -160;
          updateVirtualDeviceState(slotId, (d) => {
            d.virtualState!.scrollY = Math.max(0, d.virtualState!.scrollY + delta);
          });
          return res.json({ ok: true, device: dev, message: `Scrolled ${dev.name}` });
        }

        if (routeSuffix === 'input/tap') {
          const x = Number(req.body?.x || 0);
          const y = Number(req.body?.y || 0);
          updateVirtualDeviceState(slotId, () => {});
          appendLog('info', 'VirtualOS', `Tap at (${x}, ${y}) on ${dev.name}`, slotId, dev.name);
          return res.json({ ok: true, device: dev, message: `Tapped (${x}, ${y}) on ${dev.name}` });
        }

        if (routeSuffix === 'input/text') {
          const text = String(req.body?.text || '').trim();
          if (!text) return res.status(400).json({ ok: false, error: 'Text is empty' });
          if (dev.virtualState?.activeApp === 'chrome' || (text.includes('.') && !text.includes(' '))) {
            const check = validateAuthorizedUrl(text);
            if (check.valid && check.normalized) {
              await openUrlOnVirtualDevice(dev, check.normalized);
              return res.json({ ok: true, device: dev, message: `Opened ${check.normalized}` });
            }
          }
          updateVirtualDeviceState(slotId, (d) => {
            if (d.virtualState!.activeApp === 'notes') {
              d.virtualState!.noteText = `${d.virtualState!.noteText}\n${text}`.trim();
            }
          });
          appendLog('info', 'VirtualOS', `Typed "${text}" on ${dev.name}`, slotId, dev.name);
          return res.json({ ok: true, device: dev, message: `Sent text to ${dev.name}` });
        }

        if (routeSuffix === 'screenshot') {
          const ts = new Date().toISOString();
          appendLog('success', 'VirtualOS', `Captured screenshot on ${dev.name}`, slotId, dev.name);
          return res.json({
            ok: true,
            device: dev,
            virtualScreenshot: true,
            screenshot: {
              id: `${Date.now()}-${slotId}`,
              slotId,
              deviceName: dev.name,
              serial: dev.serial,
              capturedAt: ts,
              imageBase64: '',
              resolution: dev.resolution,
            },
            message: `Screenshot captured for ${dev.name}`,
          });
        }
      }

      try {
        const pyRes = await proxyToPython(
          'POST',
          `/api/devices/${slotId}/${routeSuffix}`,
          req.body,
          20000
        );
        return res.status(pyRes.status).json(pyRes.data);
      } catch {
        const msg = `Device ${slotId} ${routeSuffix} failed: Python Flask hardware bridge (${pythonBridgeUrl}) is offline.`;
        appendLog('error', 'Bridge', msg, slotId, `Device ${slotId}`);
        return res.status(503).json({ ok: false, error: msg });
      }
    });
  }

  // Fleet routes
  app.post('/api/fleet/connect-all', async (_req: Request, res: Response) => {
    if (activeMode === 'virtual') {
      virtualDevices.forEach((d) => {
        d.usbStatus = 'online';
        d.active = true;
        d.mirrorStatus = 'streaming';
        d.appiumStatus = 'active';
        d.fps = 60;
        d.browserStatus = d.virtualState?.activeApp === 'chrome' ? 'Chrome Active' : 'Chrome Ready';
        d.currentActivity = APP_ACTIVITIES[d.virtualState?.activeApp || 'launcher'];
        d.lastSeenAt = new Date().toISOString();
      });
      broadcast({ type: 'devices:sync', devices: virtualDevices, diagnostics });
      appendLog('success', 'Fleet', 'All 10 Android devices connected and active.');
      return res.json({
        ok: true,
        devices: virtualDevices,
        message: 'Connected all 10 Android devices.',
      });
    }

    try {
      const pyRes = await proxyToPython('POST', '/api/fleet/connect-all', undefined, 20000);
      return res.status(pyRes.status).json(pyRes.data);
    } catch {
      const msg = `Connect All Devices failed: Python Flask hardware bridge (${pythonBridgeUrl}) is offline.`;
      appendLog('error', 'Fleet', msg);
      return res.status(503).json({ ok: false, error: msg });
    }
  });

  app.post('/api/fleet/install-app', async (req: Request, res: Response) => {
    if (activeMode !== 'virtual') {
      return res.status(400).json({ ok: false, error: 'Fleet app install is available in Virtual mode.' });
    }
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const validation = validateAuthorizedUrl(rawUrl);
    if (!validation.valid || !validation.normalized) {
      return res.status(400).json({ ok: false, error: validation.error || 'Invalid URL' });
    }
    const name =
      typeof req.body?.name === 'string' && req.body.name.trim()
        ? req.body.name.trim()
        : deriveAppNameFromUrl(validation.normalized);
    const targetSlotIds: string[] = Array.isArray(req.body?.slotIds) && req.body.slotIds.length > 0
      ? req.body.slotIds
      : virtualDevices.map((d) => d.slotId);
    const targets = virtualDevices.filter(
      (d) => targetSlotIds.includes(d.slotId) && d.usbStatus === 'online'
    );
    if (targets.length === 0) {
      return res.status(400).json({ ok: false, error: 'No online devices selected.' });
    }
    for (const dev of targets) {
      installAppOnVirtualDevice(dev, name, validation.normalized, 'chrome');
    }
    broadcast({ type: 'devices:sync', devices: virtualDevices, diagnostics });
    const msg = `Installed "${name}" on ${targets.length} Android device(s).`;
    appendLog('success', 'Fleet', msg);
    return res.json({ ok: true, devices: virtualDevices, message: msg });
  });

  app.post('/api/fleet/open-url', async (req: Request, res: Response) => {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const validation = validateAuthorizedUrl(rawUrl);
    if (!validation.valid || !validation.normalized) {
      appendLog('warn', 'Fleet', validation.error || 'Blocked fleet URL');
      return res.status(400).json({ ok: false, error: validation.error });
    }

    if (activeMode === 'virtual') {
      const targetSlotIds: string[] = Array.isArray(req.body?.slotIds) && req.body.slotIds.length > 0
        ? req.body.slotIds
        : virtualDevices.map((d) => d.slotId);
      const targets = virtualDevices.filter(
        (d) => targetSlotIds.includes(d.slotId) && d.usbStatus === 'online'
      );
      if (targets.length === 0) {
        return res.status(400).json({ ok: false, error: 'No online devices selected.' });
      }
      const snapshot = await fetchWebPageSnapshot(validation.normalized);
      for (const dev of targets) {
        const vs = dev.virtualState!;
        vs.activeApp = 'chrome';
        vs.activeWebAppId = null;
        const nextHistory = vs.history.slice(0, vs.historyIndex + 1);
        if (nextHistory[nextHistory.length - 1] !== validation.normalized) {
          nextHistory.push(validation.normalized);
        }
        vs.history = nextHistory;
        vs.historyIndex = nextHistory.length - 1;
        vs.pageSnapshot = snapshot;
        vs.pageLoading = false;
        vs.scrollY = 0;
        dev.currentUrl = validation.normalized;
        dev.browserStatus = 'Chrome Active';
        dev.currentActivity = APP_ACTIVITIES.chrome;
        dev.active = true;
        dev.mirrorStatus = 'streaming';
        dev.fps = 60;
        dev.lastSeenAt = new Date().toISOString();
      }
      broadcast({ type: 'devices:sync', devices: virtualDevices, diagnostics });
      const msg = `Opened ${validation.normalized} across ${targets.length} Android device(s).`;
      appendLog('success', 'Fleet', msg);
      return res.json({ ok: true, devices: virtualDevices, message: msg });
    }

    try {
      const pyRes = await proxyToPython(
        'POST',
        '/api/fleet/open-url',
        { url: validation.normalized, slotIds: req.body?.slotIds },
        25000
      );
      return res.status(pyRes.status).json(pyRes.data);
    } catch {
      const msg = `Fleet Open URL failed: Python Flask hardware bridge (${pythonBridgeUrl}) is offline.`;
      appendLog('error', 'Fleet', msg);
      return res.status(503).json({ ok: false, error: msg });
    }
  });

  app.post('/api/fleet/action', async (req: Request, res: Response) => {
    if (activeMode === 'virtual') {
      const action = req.body?.action as string;
      const targetSlotIds: string[] = Array.isArray(req.body?.slotIds) && req.body.slotIds.length > 0
        ? req.body.slotIds
        : virtualDevices.map((d) => d.slotId);
      let count = 0;

      for (const dev of virtualDevices) {
        if (!targetSlotIds.includes(dev.slotId)) continue;
        if (action === 'disconnect') {
          dev.usbStatus = 'offline';
          dev.active = false;
          dev.mirrorStatus = 'stopped';
          dev.fps = 0;
          dev.browserStatus = 'Offline';
          dev.currentActivity = '—';
          count += 1;
          continue;
        }
        if (dev.usbStatus !== 'online') continue;
        if (action === 'start') {
          dev.active = true;
          dev.mirrorStatus = 'streaming';
          dev.fps = 60;
          count += 1;
        } else if (action === 'stop') {
          dev.active = false;
          dev.mirrorStatus = 'stopped';
          dev.fps = 0;
          count += 1;
        } else if (action === 'home') {
          dev.virtualState!.activeApp = 'launcher';
          dev.virtualState!.activeWebAppId = null;
          dev.browserStatus = 'Chrome Ready';
          dev.currentActivity = APP_ACTIVITIES.launcher;
          count += 1;
        } else if (action === 'browser') {
          dev.virtualState!.activeApp = 'chrome';
          dev.virtualState!.activeWebAppId = null;
          dev.browserStatus = 'Chrome Active';
          dev.currentActivity = APP_ACTIVITIES.chrome;
          count += 1;
        } else if (action === 'back') {
          dev.virtualState!.activeApp = 'launcher';
          dev.virtualState!.activeWebAppId = null;
          dev.currentActivity = APP_ACTIVITIES.launcher;
          count += 1;
        } else if (action === 'reload' || action === 'screenshot') {
          count += 1;
        }
      }
      broadcast({ type: 'devices:sync', devices: virtualDevices, diagnostics });
      const msg = `Executed '${action}' on ${count} device(s).`;
      appendLog('info', 'Fleet', msg);
      return res.json({ ok: true, devices: virtualDevices, message: msg });
    }

    try {
      const pyRes = await proxyToPython('POST', '/api/fleet/action', req.body, 25000);
      return res.status(pyRes.status).json(pyRes.data);
    } catch {
      const msg = `Fleet action failed: Python Flask hardware bridge (${pythonBridgeUrl}) is offline.`;
      appendLog('error', 'Fleet', msg);
      return res.status(503).json({ ok: false, error: msg });
    }
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    wssClients.add(ws);
    ws.send(JSON.stringify({ type: 'devices:sync', devices: getActiveDevices(), diagnostics }));
    ws.send(JSON.stringify({ type: 'logs:sync', logs: localLogs }));
    ws.on('close', () => {
      wssClients.delete(ws);
    });
  });

  const distDir = path.resolve(process.cwd(), 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distDir);

  if (isProd) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Android Rack 10 dashboard server listening on http://0.0.0.0:${PORT}`);
    appendLog('success', 'VirtualOS', 'Initialized 10 interactive Android devices ready on port 3000.');
    setInterval(() => {
      if (activeMode === 'hardware' && (!pythonWs || pythonWs.readyState !== WebSocket.OPEN)) {
        syncFromPythonOrLocal();
      }
    }, 5000);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
