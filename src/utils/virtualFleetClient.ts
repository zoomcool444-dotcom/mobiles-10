import {
  CapturedScreenshot,
  ConnectionLogEntry,
  PhysicalDeviceSlot,
  VirtualAppId,
} from '../types/device';

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

export const APP_ACTIVITIES: Record<VirtualAppId, string> = {
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

const DISALLOWED_URL_PATTERNS = [
  /ad-?click/i,
  /click-?farm/i,
  /auto-?surf/i,
  /view-?bot/i,
  /reward-?bot/i,
  /traffic-?exchange/i,
];

export function createVirtualDeviceAt(idx: number): PhysicalDeviceSlot {
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

export function createVirtualDevices(count = 10): PhysicalDeviceSlot[] {
  const safeCount = Math.max(1, Math.min(100, Math.floor(count)));
  return Array.from({ length: safeCount }, (_, idx) => createVirtualDeviceAt(idx));
}

export function resizeVirtualDevices(
  current: PhysicalDeviceSlot[],
  targetCount: number
): PhysicalDeviceSlot[] {
  const safeCount = Math.max(1, Math.min(100, Math.floor(targetCount)));
  if (safeCount === current.length) return current;
  if (safeCount < current.length) {
    return current.slice(0, safeCount);
  }
  const next = [...current];
  for (let i = current.length; i < safeCount; i++) {
    next.push(createVirtualDeviceAt(i));
  }
  return next;
}

export function validateAuthorizedUrlClient(
  rawInput: string
): { valid: boolean; error?: string; normalized?: string } {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { valid: false, error: 'Please enter a URL or search query.' };
  }

  const looksLikeSearch =
    trimmed.includes(' ') || (!trimmed.includes('.') && !trimmed.startsWith('http'));
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

export function deriveAppNameFromUrl(rawUrl: string): string {
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

export function createClientLog(
  level: ConnectionLogEntry['level'],
  source: ConnectionLogEntry['source'],
  message: string,
  deviceId: string | null = null,
  deviceName: string | null = null
): ConnectionLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    level,
    source,
    deviceId,
    deviceName,
    message,
  };
}

export function installAppOnVirtualDeviceClient(
  dev: PhysicalDeviceSlot,
  name: string,
  url: string,
  source: 'chrome' | 'store',
  color?: string
): PhysicalDeviceSlot {
  const vs = dev.virtualState || createVirtualDeviceAt(0).virtualState!;
  const existing = vs.installedApps.find(
    (a) => a.url === url || a.name.toLowerCase() === name.toLowerCase()
  );
  if (existing) {
    return dev;
  }
  const now = new Date().toISOString();
  const appId = `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const sizeMb = `${(4 + Math.random() * 18).toFixed(1)} MB`;
  const app = {
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
  const fileName = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_v1.0.apk`;
  return {
    ...dev,
    lastSeenAt: now,
    virtualState: {
      ...vs,
      lastInteractionAt: now,
      installedApps: [app, ...vs.installedApps].slice(0, 24),
      downloads: [
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
      ].slice(0, 30),
    },
  };
}

export function openUrlOnVirtualDeviceClient(
  dev: PhysicalDeviceSlot,
  normalizedUrl: string
): PhysicalDeviceSlot {
  const now = new Date().toISOString();
  const vs = dev.virtualState || createVirtualDeviceAt(0).virtualState!;

  if (/\.apk(\?|$)/i.test(normalizedUrl)) {
    const appName = deriveAppNameFromUrl(normalizedUrl);
    const withApp = installAppOnVirtualDeviceClient(dev, appName, normalizedUrl, 'chrome');
    return {
      ...withApp,
      currentUrl: normalizedUrl,
      browserStatus: 'Chrome Download',
      currentActivity: APP_ACTIVITIES.downloads,
      lastSeenAt: now,
      virtualState: {
        ...withApp.virtualState!,
        activeApp: 'downloads',
        activeWebAppId: null,
        lastInteractionAt: now,
      },
    };
  }

  const nextHistory = vs.history.slice(0, vs.historyIndex + 1);
  if (nextHistory[nextHistory.length - 1] !== normalizedUrl) {
    nextHistory.push(normalizedUrl);
  }
  let hostTitle = normalizedUrl;
  try {
    hostTitle = new URL(normalizedUrl).hostname;
  } catch {
    // Ignore
  }

  return {
    ...dev,
    currentUrl: normalizedUrl,
    browserStatus: 'Chrome Active',
    currentActivity: APP_ACTIVITIES.chrome,
    active: true,
    mirrorStatus: 'streaming',
    fps: 60,
    lastSeenAt: now,
    virtualState: {
      ...vs,
      activeApp: 'chrome',
      activeWebAppId: null,
      history: nextHistory,
      historyIndex: nextHistory.length - 1,
      scrollY: 0,
      pageLoading: false,
      lastInteractionAt: now,
      pageSnapshot: {
        url: normalizedUrl,
        title: hostTitle,
        description: `Direct browser session for ${normalizedUrl}.`,
        headings: [],
        paragraphs: [],
        links: [],
        fetchedAt: now,
      },
    },
  };
}

export function applyVirtualSlotActionClient(
  dev: PhysicalDeviceSlot,
  endpoint: string,
  body?: Record<string, unknown>
): { ok: boolean; device: PhysicalDeviceSlot; message?: string; error?: string; screenshot?: CapturedScreenshot } {
  const now = new Date().toISOString();
  const vs = dev.virtualState || createVirtualDeviceAt(0).virtualState!;

  if (endpoint.endsWith('/connect') || endpoint.endsWith('/pair')) {
    const next: PhysicalDeviceSlot = {
      ...dev,
      usbStatus: 'online',
      active: true,
      mirrorStatus: 'streaming',
      appiumStatus: 'active',
      fps: 60,
      browserStatus: vs.activeApp === 'chrome' ? 'Chrome Active' : 'Chrome Ready',
      currentActivity: APP_ACTIVITIES[vs.activeApp || 'launcher'],
      lastSeenAt: now,
    };
    return { ok: true, device: next, message: `${dev.name} connected online.` };
  }

  if (endpoint.endsWith('/disconnect')) {
    const next: PhysicalDeviceSlot = {
      ...dev,
      usbStatus: 'offline',
      active: false,
      mirrorStatus: 'stopped',
      appiumStatus: 'idle',
      fps: 0,
      browserStatus: 'Offline',
      currentActivity: '—',
      lastSeenAt: now,
    };
    return { ok: true, device: next, message: `${dev.name} disconnected.` };
  }

  if (dev.usbStatus !== 'online') {
    return { ok: false, device: dev, error: `${dev.name} is offline. Click Connect first.` };
  }

  if (endpoint.endsWith('/start')) {
    return {
      ok: true,
      device: { ...dev, active: true, mirrorStatus: 'streaming', appiumStatus: 'active', fps: 60, lastSeenAt: now },
      message: `Started ${dev.name} live screen.`,
    };
  }

  if (endpoint.endsWith('/stop')) {
    return {
      ok: true,
      device: { ...dev, active: false, mirrorStatus: 'stopped', appiumStatus: 'idle', fps: 0, lastSeenAt: now },
      message: `Stopped ${dev.name} live screen.`,
    };
  }

  if (endpoint.endsWith('/app/open')) {
    const appId = (body?.appId as VirtualAppId) || 'launcher';
    const webAppId = typeof body?.webAppId === 'string' ? body.webAppId : null;
    if (appId === 'webapp' && webAppId) {
      const found = vs.installedApps.find((a) => a.id === webAppId);
      if (found) {
        return {
          ok: true,
          device: {
            ...dev,
            currentUrl: found.url,
            currentActivity: `${found.packageName}/.MainActivity`,
            browserStatus: `${found.name} Active`,
            lastSeenAt: now,
            virtualState: { ...vs, activeApp: 'webapp', activeWebAppId: webAppId, lastInteractionAt: now },
          },
          message: `Opened ${found.name} on ${dev.name}`,
        };
      }
    }
    return {
      ok: true,
      device: {
        ...dev,
        currentActivity: APP_ACTIVITIES[appId] || APP_ACTIVITIES.launcher,
        browserStatus: appId === 'chrome' ? 'Chrome Active' : 'Chrome Ready',
        lastSeenAt: now,
        virtualState: { ...vs, activeApp: appId, activeWebAppId: webAppId, lastInteractionAt: now },
      },
      message: `Opened ${appId} on ${dev.name}`,
    };
  }

  if (endpoint.endsWith('/apps/install')) {
    const rawUrl = typeof body?.url === 'string' ? body.url.trim() : dev.currentUrl || '';
    const validation = validateAuthorizedUrlClient(rawUrl);
    if (!validation.valid || !validation.normalized) {
      return { ok: false, device: dev, error: validation.error || 'Valid app URL is required.' };
    }
    const name =
      typeof body?.name === 'string' && body.name.trim()
        ? body.name.trim()
        : deriveAppNameFromUrl(validation.normalized);
    const source = body?.source === 'store' ? 'store' : 'chrome';
    const color = typeof body?.color === 'string' ? body.color : undefined;
    const next = installAppOnVirtualDeviceClient(dev, name, validation.normalized, source, color);
    return { ok: true, device: next, message: `Installed ${name} on ${dev.name}` };
  }

  if (endpoint.endsWith('/apps/uninstall')) {
    const appId = typeof body?.appId === 'string' ? body.appId : '';
    const target = vs.installedApps.find((a) => a.id === appId);
    const removedName = target?.name || 'App';
    const wasActive = vs.activeWebAppId === appId;
    return {
      ok: true,
      device: {
        ...dev,
        currentActivity: wasActive ? APP_ACTIVITIES.launcher : dev.currentActivity,
        lastSeenAt: now,
        virtualState: {
          ...vs,
          installedApps: vs.installedApps.filter((a) => a.id !== appId),
          activeWebAppId: wasActive ? null : vs.activeWebAppId,
          activeApp: wasActive ? 'launcher' : vs.activeApp,
          lastInteractionAt: now,
        },
      },
      message: `Uninstalled ${removedName} from ${dev.name}`,
    };
  }

  if (endpoint.endsWith('/notes/save')) {
    const noteText = typeof body?.noteText === 'string' ? body.noteText : '';
    return {
      ok: true,
      device: {
        ...dev,
        lastSeenAt: now,
        virtualState: { ...vs, noteText, lastInteractionAt: now },
      },
    };
  }

  if (endpoint.endsWith('/browser/open')) {
    return {
      ok: true,
      device: {
        ...dev,
        browserStatus: 'Chrome Active',
        currentActivity: APP_ACTIVITIES.chrome,
        lastSeenAt: now,
        virtualState: { ...vs, activeApp: 'chrome', activeWebAppId: null, lastInteractionAt: now },
      },
      message: `Opened Chrome on ${dev.name}`,
    };
  }

  if (endpoint.endsWith('/browser/url')) {
    const rawUrl = typeof body?.url === 'string' ? body.url.trim() : '';
    const validation = validateAuthorizedUrlClient(rawUrl);
    if (!validation.valid || !validation.normalized) {
      return { ok: false, device: dev, error: validation.error || 'Blocked URL' };
    }
    const next = openUrlOnVirtualDeviceClient(dev, validation.normalized);
    return { ok: true, device: next, message: `${dev.name} loaded ${validation.normalized}` };
  }

  if (endpoint.endsWith('/browser/reload')) {
    if (dev.currentUrl) {
      const next = openUrlOnVirtualDeviceClient(dev, dev.currentUrl);
      return { ok: true, device: next, message: `Reloaded ${dev.currentUrl}` };
    }
    return { ok: true, device: { ...dev, lastSeenAt: now }, message: `Reloaded browser tab on ${dev.name}` };
  }

  if (endpoint.endsWith('/input/home')) {
    return {
      ok: true,
      device: {
        ...dev,
        browserStatus: 'Chrome Ready',
        currentActivity: APP_ACTIVITIES.launcher,
        lastSeenAt: now,
        virtualState: { ...vs, activeApp: 'launcher', activeWebAppId: null, lastInteractionAt: now },
      },
      message: `${dev.name} returned to Home screen.`,
    };
  }

  if (endpoint.endsWith('/input/back')) {
    if (vs.activeApp === 'chrome' && vs.historyIndex > 0) {
      const prevIdx = vs.historyIndex - 1;
      const prevUrl = vs.history[prevIdx];
      return {
        ok: true,
        device: {
          ...dev,
          currentUrl: prevUrl,
          lastSeenAt: now,
          virtualState: { ...vs, historyIndex: prevIdx, lastInteractionAt: now },
        },
        message: `Navigated back to ${prevUrl}`,
      };
    }
    return {
      ok: true,
      device: {
        ...dev,
        browserStatus: 'Chrome Ready',
        currentActivity: APP_ACTIVITIES.launcher,
        lastSeenAt: now,
        virtualState: { ...vs, activeApp: 'launcher', activeWebAppId: null, lastInteractionAt: now },
      },
      message: `Sent Back to ${dev.name}`,
    };
  }

  if (endpoint.endsWith('/input/swipe')) {
    const y1 = Number(body?.y1 || 1400);
    const y2 = Number(body?.y2 || 600);
    const delta = y1 > y2 ? 160 : -160;
    return {
      ok: true,
      device: {
        ...dev,
        lastSeenAt: now,
        virtualState: { ...vs, scrollY: Math.max(0, vs.scrollY + delta), lastInteractionAt: now },
      },
      message: `Scrolled ${dev.name}`,
    };
  }

  if (endpoint.endsWith('/input/tap')) {
    const x = Number(body?.x || 0);
    const y = Number(body?.y || 0);
    return {
      ok: true,
      device: { ...dev, lastSeenAt: now, virtualState: { ...vs, lastInteractionAt: now } },
      message: `Tapped (${x}, ${y}) on ${dev.name}`,
    };
  }

  if (endpoint.endsWith('/input/text')) {
    const text = String(body?.text || '').trim();
    if (!text) return { ok: false, device: dev, error: 'Text is empty' };
    if (vs.activeApp === 'chrome' || (text.includes('.') && !text.includes(' '))) {
      const check = validateAuthorizedUrlClient(text);
      if (check.valid && check.normalized) {
        return {
          ok: true,
          device: openUrlOnVirtualDeviceClient(dev, check.normalized),
          message: `Opened ${check.normalized}`,
        };
      }
    }
    return {
      ok: true,
      device: {
        ...dev,
        lastSeenAt: now,
        virtualState: {
          ...vs,
          noteText: vs.activeApp === 'notes' ? `${vs.noteText}\n${text}`.trim() : vs.noteText,
          lastInteractionAt: now,
        },
      },
      message: `Sent text to ${dev.name}`,
    };
  }

  if (endpoint.endsWith('/screenshot')) {
    return {
      ok: true,
      device: dev,
      screenshot: {
        id: `${Date.now()}-${dev.slotId}`,
        slotId: dev.slotId,
        deviceName: dev.name,
        serial: dev.serial,
        capturedAt: now,
        imageBase64: '',
        resolution: dev.resolution,
      },
      message: `Screenshot captured for ${dev.name}`,
    };
  }

  return { ok: true, device: dev };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function buildClientMobileSearchHtml(query: string): Promise<string> {
  const cleanQuery = query.trim();
  const items: Array<{ title: string; url: string; domain: string; snippet: string }> = [];

  if (cleanQuery) {
    try {
      const apiUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&format=json&origin=*&limit=8&search=${encodeURIComponent(
        cleanQuery
      )}`;
      const res = await fetch(apiUrl);
      if (res.ok) {
        const data = (await res.json()) as [string, string[], string[], string[]];
        const titles = data[1] || [];
        const snippets = data[2] || [];
        const urls = data[3] || [];
        for (let i = 0; i < titles.length; i++) {
          const url = urls[i];
          if (!url) continue;
          const mobileUrl = url.replace('https://en.wikipedia.org', 'https://en.m.wikipedia.org');
          items.push({
            title: titles[i],
            url: mobileUrl,
            domain: 'en.m.wikipedia.org',
            snippet: snippets[i] || `Wikipedia article for ${titles[i]}.`,
          });
        }
      }
    } catch {
      // Ignore network errors
    }
  }

  if (items.length === 0 && cleanQuery) {
    items.push(
      {
        title: `${cleanQuery} — Wikipedia`,
        url: `https://en.m.wikipedia.org/w/index.php?search=${encodeURIComponent(cleanQuery)}`,
        domain: 'en.m.wikipedia.org',
        snippet: `Search ${cleanQuery} directly on Wikipedia mobile.`,
      },
      {
        title: `${cleanQuery} — DuckDuckGo`,
        url: `https://duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}`,
        domain: 'duckduckgo.com',
        snippet: `Open web search results for ${cleanQuery}.`,
      }
    );
  }

  const cardsHtml = items
    .map(
      (item) => `
      <a class="card" href="${escapeHtml(item.url)}">
        <div class="domain">${escapeHtml(item.domain)}</div>
        <div class="title">${escapeHtml(item.title)}</div>
        <div class="snippet">${escapeHtml(item.snippet)}</div>
      </a>`
    )
    .join('');

  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; padding: 12px; }
  .search-bar { display: flex; gap: 6px; margin-bottom: 12px; }
  .search-bar input { flex: 1; min-width: 0; padding: 8px 12px; border-radius: 999px; border: 1px solid #cbd5e1; font-size: 13px; background: #fff; outline: none; }
  .search-bar button { padding: 8px 14px; border-radius: 999px; border: 0; background: #2563eb; color: #fff; font-size: 12px; font-weight: 600; cursor: pointer; }
  .meta { font-size: 11px; color: #64748b; margin-bottom: 10px; }
  .card { display: block; text-decoration: none; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; }
  .card:active { background: #eff6ff; }
  .domain { font-size: 11px; color: #059669; font-family: monospace; margin-bottom: 2px; }
  .title { font-size: 14px; font-weight: 600; color: #1d4ed8; line-height: 1.3; margin-bottom: 4px; }
  .snippet { font-size: 12px; color: #475569; line-height: 1.4; }
</style>
<script>
  document.addEventListener('click', function(e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    e.preventDefault();
    window.parent.postMessage({ type: 'virtual-chrome:navigate', url: a.getAttribute('href') }, '*');
  }, true);
  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (!form) return;
    e.preventDefault();
    var q = (form.querySelector('input') || {}).value || '';
    if (q.trim()) {
      window.parent.postMessage({ type: 'virtual-chrome:navigate', url: 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q.trim()) }, '*');
    }
  }, true);
</script>
</head>
<body>
  <form class="search-bar">
    <input type="text" value="${escapeHtml(cleanQuery)}" placeholder="Search web..." />
    <button type="submit">Search</button>
  </form>
  <div class="meta">Mobile Search Results for "${escapeHtml(cleanQuery)}"</div>
  ${cardsHtml}
</body>
</html>`;
}
