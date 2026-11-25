import { useState, FormEvent, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  Calculator as CalcIcon,
  Camera,
  Check,
  Chrome,
  Download,
  ExternalLink,
  FolderDown,
  Globe,
  Home,
  Image as GalleryIcon,
  Plus,
  RotateCw,
  Search,
  Settings,
  ShoppingBag,
  Square,
  StickyNote,
  Trash2,
  Wifi,
  BatteryCharging,
  Battery,
} from 'lucide-react';
import {
  CapturedScreenshot,
  PhysicalDeviceSlot,
  VirtualAppId,
} from '../types/device';
import { buildClientMobileSearchHtml } from '../utils/virtualFleetClient';

interface VirtualAndroidScreenProps {
  device: PhysicalDeviceSlot;
  interactive?: boolean;
  compact?: boolean;
  screenshots?: CapturedScreenshot[];
  onOpenApp?: (slotId: string, appId: VirtualAppId, webAppId?: string) => void;
  onOpenUrl?: (slotId: string, url: string) => void;
  onInstallApp?: (
    slotId: string,
    payload: { url: string; name?: string; source?: 'chrome' | 'store'; color?: string }
  ) => void;
  onUninstallApp?: (slotId: string, appId: string) => void;
  onReloadPage?: (slotId: string) => void;
  onGoBack?: (slotId: string) => void;
  onGoHome?: (slotId: string) => void;
  onSaveNote?: (slotId: string, noteText: string) => void;
  onTakeScreenshot?: (slotId: string) => void;
  botState?: { step: number; runs: number; status: string } | null;
}

const STORE_CATALOG = [
  {
    name: 'Wikipedia',
    category: 'Reference',
    url: 'https://en.m.wikipedia.org',
    color: '#334155',
    size: '8.4 MB',
  },
  {
    name: 'DuckDuckGo',
    category: 'Search',
    url: 'https://html.duckduckgo.com/html/',
    color: '#ea580c',
    size: '6.2 MB',
  },
  {
    name: 'Hacker News',
    category: 'Tech News',
    url: 'https://news.ycombinator.com',
    color: '#d97706',
    size: '4.1 MB',
  },
  {
    name: 'GitHub Mobile',
    category: 'Developer',
    url: 'https://github.com',
    color: '#0f172a',
    size: '14.8 MB',
  },
  {
    name: 'OpenStreetMap',
    category: 'Navigation',
    url: 'https://www.openstreetmap.org',
    color: '#059669',
    size: '11.5 MB',
  },
  {
    name: 'BBC News',
    category: 'News',
    url: 'https://www.bbc.com/news',
    color: '#b91c1c',
    size: '9.6 MB',
  },
];

let cachedBackendProxyAvailable: boolean | null = null;
const urlModeCache = new Map<string, 'direct' | 'proxy'>();

export function VirtualAndroidScreen({
  device,
  interactive = false,
  compact = false,
  screenshots = [],
  onOpenApp,
  onOpenUrl,
  onInstallApp,
  onUninstallApp,
  onReloadPage,
  onGoBack,
  onGoHome,
  onSaveNote,
  onTakeScreenshot,
  botState = null,
}: VirtualAndroidScreenProps) {
  const vs = device.virtualState;
  const activeApp = vs?.activeApp || 'launcher';
  const formatAddressBarValue = (rawUrl: string | null) => {
    if (!rawUrl) return '';
    try {
      const u = new URL(rawUrl);
      if (
        (u.hostname === 'html.duckduckgo.com' || u.hostname === 'duckduckgo.com') &&
        u.searchParams.get('q')
      ) {
        return u.searchParams.get('q') || '';
      }
    } catch {
      // Ignore
    }
    return rawUrl;
  };

  const [urlBar, setUrlBar] = useState(() => formatAddressBarValue(device.currentUrl));
  const [chromeMode, setChromeMode] = useState<'auto' | 'direct' | 'proxy' | 'reader'>('auto');
  const [resolvedMode, setResolvedMode] = useState<'direct' | 'proxy'>(() =>
    device.currentUrl ? (urlModeCache.get(device.currentUrl) ?? 'direct') : 'direct'
  );
  const [backendProxyAvailable, setBackendProxyAvailable] = useState<boolean>(
    () => cachedBackendProxyAvailable ?? true
  );
  const [clientSearchHtml, setClientSearchHtml] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [iframeLoading, setIframeLoading] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [customAppName, setCustomAppName] = useState('');
  const [customAppUrl, setCustomAppUrl] = useState('');
  const [noteDraft, setNoteDraft] = useState(vs?.noteText || '');
  const [calcExpr, setCalcExpr] = useState('0');
  const chromeIframeRef = useRef<HTMLIFrameElement | null>(null);
  const webAppIframeRef = useRef<HTMLIFrameElement | null>(null);

  const timeStr = useMemo(
    () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    // Refresh only when device updates to keep 10-card rendering smooth
    [device.lastSeenAt]
  );

  const extractSearchQuery = (rawUrl: string | null): string | null => {
    if (!rawUrl) return null;
    try {
      const u = new URL(rawUrl);
      const h = u.hostname.toLowerCase();
      if (
        h === 'html.duckduckgo.com' ||
        h === 'duckduckgo.com' ||
        h === 'www.duckduckgo.com' ||
        (h.endsWith('google.com') && u.pathname.startsWith('/search'))
      ) {
        return u.searchParams.get('q') || '';
      }
      return null;
    } catch {
      return null;
    }
  };

  const isSearchUrl = (rawUrl: string | null) => extractSearchQuery(rawUrl) !== null;

  const lastCheckedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!device.currentUrl) return;
    if (lastCheckedUrlRef.current === device.currentUrl) return;
    lastCheckedUrlRef.current = device.currentUrl;

    setUrlBar(formatAddressBarValue(device.currentUrl));
    setIframeLoading(true);
    setChromeMode('auto');
    setClientSearchHtml(null);

    if (device.currentUrl.includes('/api/real-tasks')) {
      setResolvedMode('direct');
      return;
    }

    const searchQuery = extractSearchQuery(device.currentUrl);
    if (cachedBackendProxyAvailable === false) {
      setBackendProxyAvailable(false);
      setResolvedMode('direct');
      if (searchQuery !== null) {
        let cancelled = false;
        void buildClientMobileSearchHtml(searchQuery).then((html) => {
          if (!cancelled) {
            setClientSearchHtml(html);
            setIframeLoading(false);
          }
        });
        return () => {
          cancelled = true;
        };
      }
      return;
    }

    const cachedMode = urlModeCache.get(device.currentUrl);
    if (cachedMode) {
      setResolvedMode(cachedMode);
      return;
    }

    let cancelled = false;

    fetch(`/api/browser-check?url=${encodeURIComponent(device.currentUrl)}`)
      .then(async (r) => {
        const ct = r.headers.get('content-type') || '';
        if (!r.ok || !ct.toLowerCase().includes('application/json')) {
          throw new Error('NO_BACKEND_PROXY');
        }
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        cachedBackendProxyAvailable = true;
        setBackendProxyAvailable(true);
        if (searchQuery !== null) {
          urlModeCache.set(device.currentUrl!, 'proxy');
          setResolvedMode('proxy');
        } else if (data?.mode === 'direct' || data?.mode === 'proxy') {
          urlModeCache.set(device.currentUrl!, data.mode);
          setResolvedMode((prev) => (prev === data.mode ? prev : data.mode));
        }
      })
      .catch(async () => {
        if (cancelled) return;
        cachedBackendProxyAvailable = false;
        setBackendProxyAvailable(false);
        setResolvedMode('direct');
        if (searchQuery !== null) {
          const html = await buildClientMobileSearchHtml(searchQuery);
          if (!cancelled) {
            setClientSearchHtml(html);
            setIframeLoading(false);
          }
        }
      });

    return () => {
      cancelled = true;
    };
  }, [device.currentUrl]);

  const effectiveMode: 'direct' | 'proxy' | 'reader' =
    chromeMode === 'reader'
      ? 'reader'
      : !backendProxyAvailable
      ? 'direct'
      : chromeMode === 'auto'
      ? resolvedMode
      : chromeMode;

  useEffect(() => {
    if (vs?.noteText !== undefined) setNoteDraft(vs.noteText);
  }, [vs?.noteText]);

  // Drive local same-origin /api/real-tasks QA sandbox when QA Real Bot advances a step
  useEffect(() => {
    if (!botState || !device.currentUrl?.includes('/api/real-tasks')) return;
    const win = chromeIframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(
      {
        type: 'qa-real:run-task',
        taskIndex: Math.max(0, botState.step - 1),
        runs: botState.runs,
      },
      '*'
    );
  }, [botState, device.currentUrl]);

  // Listen for link clicks strictly from this phone's own live webpage iframe
  useEffect(() => {
    if (!interactive || !onOpenUrl) return;
    const handleMessage = (event: MessageEvent) => {
      const fromOwnFrame =
        (chromeIframeRef.current && event.source === chromeIframeRef.current.contentWindow) ||
        (webAppIframeRef.current && event.source === webAppIframeRef.current.contentWindow);
      if (!fromOwnFrame) return;
      if (event.data?.type === 'virtual-chrome:navigate' && typeof event.data.url === 'string') {
        onOpenUrl(device.slotId, event.data.url);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [interactive, onOpenUrl, device.slotId]);

  const handleChromeSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!interactive || !onOpenUrl || !urlBar.trim()) return;
    setIframeLoading(true);
    onOpenUrl(device.slotId, urlBar.trim());
  };

  const handleReload = () => {
    if (!interactive) return;
    setIframeLoading(true);
    setIframeKey((k) => k + 1);
    onReloadPage?.(device.slotId);
  };

  const triggerSmoothInstall = (
    key: string,
    payload: { url: string; name?: string; source?: 'chrome' | 'store'; color?: string }
  ) => {
    if (!interactive || !onInstallApp) return;
    setInstallingId(key);
    window.setTimeout(() => {
      onInstallApp(device.slotId, payload);
      setInstallingId(null);
    }, 450);
  };

  const handleCustomInstallSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!customAppUrl.trim()) return;
    triggerSmoothInstall('custom', {
      url: customAppUrl.trim(),
      name: customAppName.trim() || undefined,
      source: 'chrome',
    });
    setCustomAppName('');
    setCustomAppUrl('');
  };

  const handleCalcPress = (val: string) => {
    if (!interactive) return;
    if (val === 'C') {
      setCalcExpr('0');
      return;
    }
    if (val === '=') {
      try {
        const sanitized = calcExpr.replace(/[^0-9+\-*/.]/g, '');
        const result = Function(`"use strict"; return (${sanitized})`)();
        setCalcExpr(String(Number.isFinite(result) ? Number(result.toFixed(4)) : 'Error'));
      } catch {
        setCalcExpr('Error');
      }
      return;
    }
    setCalcExpr((prev) => (prev === '0' || prev === 'Error' ? val : `${prev}${val}`));
  };

  const deviceShots = screenshots.filter((s) => s.slotId === device.slotId);
  const installedApps = vs?.installedApps || [];
  const downloads = vs?.downloads || [];
  const activeWebApp = installedApps.find((a) => a.id === vs?.activeWebAppId) || null;
  const currentUrlInstalled = Boolean(
    device.currentUrl && installedApps.some((a) => a.url === device.currentUrl)
  );

  if (device.usbStatus !== 'online') {
    return (
      <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center p-3 text-center">
        <div className="w-6 h-6 rounded-full border border-slate-700 mb-2" />
        <p className="text-[11px] font-medium text-slate-400">Screen Off</p>
        <p className="text-[10px] text-slate-500 mt-0.5">{device.name} Disconnected</p>
      </div>
    );
  }

  if (!device.active) {
    return (
      <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center p-3 text-center">
        <p className="text-[11px] font-medium text-slate-300">{device.model}</p>
        <p className="text-[10px] text-slate-500 mt-1">Stream paused · Click Start Device</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-white select-none overflow-hidden">
      {/* Android Status Bar */}
      <div
        className={`flex items-center justify-between shrink-0 ${
          !interactive
            ? 'h-4 px-2 text-[8px]'
            : compact
            ? 'h-4 px-1.5 text-[8px]'
            : 'h-6 px-2.5 text-[11px]'
        } ${activeApp === 'launcher' ? 'bg-black/30' : 'bg-slate-900'}`}
      >
        <span className="font-mono font-medium tabular-nums">{timeStr}</span>
        <div className="flex items-center gap-1 font-mono tabular-nums">
          <Wifi className={!interactive || compact ? 'w-2 h-2' : 'w-3 h-3'} />
          {!compact && <span>5G</span>}
          {device.batteryCharging ? (
            <BatteryCharging className={!interactive || compact ? 'w-2.5 h-2.5 text-emerald-400' : 'w-3.5 h-3.5 text-emerald-400'} />
          ) : (
            <Battery className={!interactive || compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} />
          )}
          <span>{device.battery ?? 85}%</span>
        </div>
      </div>

      {/* Active App Viewport */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* HOME SCREEN LAUNCHER */}
        {activeApp === 'launcher' && (
          <div className={`flex-1 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 flex flex-col justify-between overflow-y-auto ${compact ? 'p-1.5' : 'p-3'}`}>
            <div className={interactive && !compact ? 'mt-1' : 'mt-0.5'}>
              <div className={`font-display font-semibold truncate ${!interactive ? 'text-[10px]' : compact ? 'text-[11px]' : 'text-base'}`}>
                {device.name}
              </div>
              <div className={`text-slate-300 truncate ${!interactive ? 'text-[8px]' : compact ? 'text-[8px]' : 'text-[11px]'}`}>
                {device.model} · Android {device.androidVersion}
              </div>
            </div>

            {/* Chrome Quick Search Bar */}
            <button
              type="button"
              onClick={() => interactive && onOpenApp?.(device.slotId, 'chrome')}
              className={`w-full rounded-full bg-white/15 flex items-center gap-1 text-left text-slate-200 transition-colors ${
                !interactive
                  ? 'px-2 py-1 text-[8px] my-1'
                  : compact
                  ? 'px-2 py-1 text-[9px] hover:bg-white/20 my-1'
                  : 'px-3 py-2 text-xs hover:bg-white/20 my-2'
              }`}
            >
              <Chrome className={!interactive || compact ? 'w-2.5 h-2.5 text-blue-300 shrink-0' : 'w-3.5 h-3.5 text-blue-300 shrink-0'} />
              <span className="truncate">{compact ? 'Search Chrome...' : 'Search or open URL in Chrome...'}</span>
            </button>

            {/* System & Installed Apps Grid */}
            <div className={`grid grid-cols-4 ${!interactive ? 'gap-1 pb-0.5' : compact ? 'gap-1 pb-0.5' : 'gap-2.5 pb-1'}`}>
              {[
                { id: 'chrome' as const, label: 'Chrome', icon: Chrome, bg: 'bg-blue-600' },
                { id: 'store' as const, label: compact ? 'Store' : 'Play Store', icon: ShoppingBag, bg: 'bg-emerald-600' },
                { id: 'downloads' as const, label: compact ? 'Files' : 'Downloads', icon: FolderDown, bg: 'bg-sky-600' },
                { id: 'settings' as const, label: 'Settings', icon: Settings, bg: 'bg-slate-600' },
                { id: 'notes' as const, label: 'Notes', icon: StickyNote, bg: 'bg-amber-600' },
                { id: 'calculator' as const, label: 'Calc', icon: CalcIcon, bg: 'bg-teal-600' },
                { id: 'gallery' as const, label: 'Gallery', icon: GalleryIcon, bg: 'bg-indigo-600' },
              ].map((app) => {
                const Icon = app.icon;
                return (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => interactive && onOpenApp?.(device.slotId, app.id)}
                    className={`flex flex-col items-center gap-0.5 transition-transform active:scale-95 ${
                      interactive ? 'cursor-pointer hover:opacity-90' : 'pointer-events-none'
                    }`}
                  >
                    <span
                      className={`${app.bg} flex items-center justify-center text-white ${
                        !interactive
                          ? 'w-5 h-5 rounded-md'
                          : compact
                          ? 'w-6 h-6 rounded-lg'
                          : 'w-11 h-11 rounded-xl'
                      }`}
                    >
                      <Icon className={!interactive ? 'w-2.5 h-2.5' : compact ? 'w-3 h-3' : 'w-5 h-5'} />
                    </span>
                    <span className={`truncate max-w-full ${!interactive ? 'text-[6px] text-slate-300' : compact ? 'text-[7px] text-slate-200' : 'text-[10px] text-slate-200'}`}>
                      {app.label}
                    </span>
                  </button>
                );
              })}

              {interactive && (
                <button
                  type="button"
                  onClick={() => onTakeScreenshot?.(device.slotId)}
                  className="flex flex-col items-center gap-0.5 cursor-pointer hover:opacity-90 transition-transform active:scale-95"
                >
                  <span className={`bg-rose-600 flex items-center justify-center text-white ${compact ? 'w-6 h-6 rounded-lg' : 'w-11 h-11 rounded-xl'}`}>
                    <Camera className={compact ? 'w-3 h-3' : 'w-5 h-5'} />
                  </span>
                  <span className={compact ? 'text-[7px] text-slate-200' : 'text-[10px] text-slate-200'}>Capture</span>
                </button>
              )}

              {/* User-installed apps from Chrome or Play Store */}
              {installedApps.map((app) => (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => interactive && onOpenApp?.(device.slotId, 'webapp', app.id)}
                  className={`flex flex-col items-center gap-0.5 transition-transform active:scale-95 ${
                    interactive ? 'cursor-pointer hover:opacity-90' : 'pointer-events-none'
                  }`}
                >
                  <span
                    style={{ backgroundColor: app.color }}
                    className={`flex items-center justify-center text-white font-display font-bold ${
                      !interactive
                        ? 'w-5 h-5 rounded-md text-[8px]'
                        : compact
                        ? 'w-6 h-6 rounded-lg text-[9px]'
                        : 'w-11 h-11 rounded-xl text-sm'
                    }`}
                  >
                    {app.name.charAt(0).toUpperCase()}
                  </span>
                  <span className={`truncate max-w-full ${!interactive ? 'text-[6px] text-slate-300' : compact ? 'text-[7px] text-slate-200' : 'text-[10px] text-slate-200'}`}>
                    {app.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* CHROME MOBILE BROWSER */}
        {activeApp === 'chrome' && (
          <div className="flex-1 min-h-0 bg-white text-slate-900 flex flex-col overflow-hidden">
            {/* Chrome Address & Action Bar */}
            <form
              onSubmit={handleChromeSubmit}
              className={`bg-slate-100 border-b border-slate-200 flex items-center gap-1 shrink-0 ${
                !interactive || compact ? 'p-1' : 'p-1.5'
              }`}
            >
              <input
                type="text"
                value={urlBar}
                onChange={(e) => setUrlBar(e.target.value)}
                readOnly={!interactive}
                placeholder={compact ? 'URL...' : 'Search or enter URL...'}
                aria-label="Mobile Chrome URL bar"
                className={`flex-1 min-w-0 bg-white border border-slate-300 rounded-full font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-600 ${
                  !interactive
                    ? 'px-1.5 py-0.5 text-[7px]'
                    : compact
                    ? 'px-1.5 py-0.5 text-[8px]'
                    : 'px-2.5 py-1 text-[11px]'
                }`}
              />
              {interactive && (
                <>
                  <button
                    type="submit"
                    title="Search or Go"
                    aria-label="Search or go"
                    className={`rounded-full bg-blue-600 hover:bg-blue-700 text-white shrink-0 ${compact ? 'p-1' : 'p-1.5'}`}
                  >
                    <Search className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
                  </button>
                  <button
                    type="button"
                    onClick={handleReload}
                    title="Reload Page"
                    aria-label="Reload page"
                    className="p-0.5 text-slate-600 hover:text-slate-900 shrink-0"
                  >
                    <RotateCw className={`${compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} ${vs?.pageLoading || iframeLoading ? 'animate-spin' : ''}`} />
                  </button>
                  {device.currentUrl && !compact && (
                    <button
                      type="button"
                      onClick={() =>
                        triggerSmoothInstall('chrome-bar', {
                          url: device.currentUrl!,
                          name: vs?.pageSnapshot?.title?.split(/[-|—]/)[0]?.trim() || undefined,
                          source: 'chrome',
                        })
                      }
                      disabled={currentUrlInstalled || installingId === 'chrome-bar'}
                      title={currentUrlInstalled ? 'Installed on Home Screen' : 'Install App to Home Screen'}
                      className={`px-1.5 py-1 rounded text-[10px] font-medium inline-flex items-center gap-0.5 shrink-0 ${
                        currentUrlInstalled
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {currentUrlInstalled ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>Saved</span>
                        </>
                      ) : installingId === 'chrome-bar' ? (
                        <span>...</span>
                      ) : (
                        <>
                          <Download className="w-3 h-3" />
                          <span>Install</span>
                        </>
                      )}
                    </button>
                  )}
                </>
              )}
            </form>

            {/* Chrome Mode Strip (Direct / Proxy / Reader) */}
            {interactive && device.currentUrl && !compact && (
              <div className="px-2 py-1 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-[10px] shrink-0">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setChromeMode('direct');
                      setIframeLoading(true);
                    }}
                    className={`px-1.5 py-0.5 rounded font-medium ${
                      effectiveMode === 'direct'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Direct
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setChromeMode('proxy');
                      setIframeLoading(true);
                    }}
                    className={`px-1.5 py-0.5 rounded font-medium ${
                      effectiveMode === 'proxy'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Proxy
                  </button>
                  <button
                    type="button"
                    onClick={() => setChromeMode('reader')}
                    className={`px-1.5 py-0.5 rounded font-medium ${
                      effectiveMode === 'reader'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Reader
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenApp?.(device.slotId, 'downloads')}
                  className="text-blue-700 hover:underline font-medium"
                >
                  Downloads ({downloads.length})
                </button>
              </div>
            )}

            {/* Smooth Loading Progress Bar */}
            {(vs?.pageLoading || (interactive && effectiveMode !== 'reader' && iframeLoading && device.currentUrl)) && (
              <div className="h-0.5 w-full bg-blue-100 overflow-hidden shrink-0">
                <div className="h-full w-1/2 bg-blue-600 animate-pulse" />
              </div>
            )}

            {/* Webpage Viewport */}
            {interactive && device.currentUrl && effectiveMode !== 'reader' ? (
              <div
                className="flex-1 min-h-0 relative bg-white"
                style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
              >
                {clientSearchHtml && !backendProxyAvailable ? (
                  <iframe
                    ref={chromeIframeRef}
                    key={`search-${device.slotId}-${iframeKey}`}
                    srcDoc={clientSearchHtml}
                    title={`${device.name} Mobile Search`}
                    loading="eager"
                    sandbox="allow-scripts allow-forms allow-popups"
                    onLoad={() => setIframeLoading(false)}
                    className="w-full h-full border-0 bg-white block"
                  />
                ) : (
                  <iframe
                    ref={chromeIframeRef}
                    key={`chrome-${device.slotId}-${iframeKey}`}
                    src={
                      effectiveMode === 'proxy' && backendProxyAvailable
                        ? `/api/browser-proxy?url=${encodeURIComponent(device.currentUrl)}`
                        : device.currentUrl
                    }
                    title={`${device.name} Chrome WebView`}
                    loading="eager"
                    sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals allow-downloads"
                    allow="clipboard-read; clipboard-write; fullscreen"
                    onLoad={() => setIframeLoading(false)}
                    className="w-full h-full border-0 bg-white block"
                  />
                )}
              </div>
            ) : (
              <div
                className={`flex-1 overflow-y-auto ${interactive ? 'p-3 space-y-2.5' : 'p-1.5 space-y-1'}`}
                style={{ scrollBehavior: 'smooth' }}
              >
                {vs?.pageLoading ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    Loading {device.currentUrl}...
                  </div>
                ) : vs?.pageSnapshot ? (
                  <>
                    <div className="border-b border-slate-100 pb-2">
                      <div className={`font-bold text-slate-900 leading-snug ${interactive ? 'text-sm' : 'text-[8px]'}`}>
                        {vs.pageSnapshot.title}
                      </div>
                      <div className={`font-mono text-blue-700 truncate ${interactive ? 'text-[10px]' : 'text-[6px]'}`}>
                        {vs.pageSnapshot.url}
                      </div>
                    </div>
                    {vs.pageSnapshot.description && (
                      <p className={`text-slate-600 leading-relaxed ${interactive ? 'text-xs' : 'text-[7px] line-clamp-3'}`}>
                        {vs.pageSnapshot.description}
                      </p>
                    )}
                    {interactive && vs.pageSnapshot.headings.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <div className="text-[10px] font-semibold text-slate-400">Page Sections</div>
                        {vs.pageSnapshot.headings.map((h, i) => (
                          <div key={i} className="text-xs font-medium text-slate-800 bg-slate-50 px-2 py-1 rounded">
                            {h}
                          </div>
                        ))}
                      </div>
                    )}
                    {interactive && vs.pageSnapshot.paragraphs.slice(0, 3).map((p, i) => (
                      <p key={i} className="text-[11px] text-slate-600 leading-relaxed">
                        {p}
                      </p>
                    ))}
                    {interactive && vs.pageSnapshot.links.length > 0 && (
                      <div className="pt-2 border-t border-slate-100 space-y-1">
                        <div className="text-[10px] font-semibold text-slate-400">Links on Page</div>
                        {vs.pageSnapshot.links.slice(0, 8).map((lnk, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => onOpenUrl?.(device.slotId, lnk.href)}
                            className="w-full text-left flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-slate-50 hover:bg-blue-50 text-[11px] text-blue-700"
                          >
                            <span className="truncate">{lnk.label}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-3 py-4 text-center">
                    <Chrome className={`${interactive ? 'w-9 h-9' : 'w-4 h-4'} text-blue-600 mx-auto`} />
                    <div>
                      <p className={`font-semibold text-slate-800 ${interactive ? 'text-xs' : 'text-[7px]'}`}>
                        Chrome Mobile
                      </p>
                      {interactive && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Search anything, open websites, or install apps to Home Screen.
                        </p>
                      )}
                    </div>
                    {interactive && (
                      <div className="grid grid-cols-2 gap-1.5 pt-1 text-left">
                        {[
                          { label: 'Wikipedia', url: 'https://en.m.wikipedia.org' },
                          { label: 'Example.com', url: 'https://example.com' },
                          { label: 'Hacker News', url: 'https://news.ycombinator.com' },
                          { label: 'DuckDuckGo', url: 'https://html.duckduckgo.com/html/' },
                        ].map((preset) => (
                          <button
                            key={preset.url}
                            type="button"
                            onClick={() => onOpenUrl?.(device.slotId, preset.url)}
                            className="px-2.5 py-2 rounded-lg bg-slate-100 hover:bg-blue-50 text-[11px] font-medium text-slate-800 hover:text-blue-700 flex items-center gap-1.5"
                          >
                            <Globe className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span className="truncate">{preset.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* PLAY STORE / APP INSTALLER */}
        {activeApp === 'store' && (
          <div className={`flex-1 bg-slate-50 text-slate-900 overflow-y-auto ${interactive ? 'p-3 space-y-3' : 'p-1.5 space-y-1'}`}>
            <div className="flex items-center justify-between">
              <div className={`font-bold flex items-center gap-1.5 ${interactive ? 'text-sm' : 'text-[8px]'}`}>
                <ShoppingBag className={interactive ? 'w-4 h-4 text-emerald-600' : 'w-2.5 h-2.5 text-emerald-600'} />
                <span>App Store</span>
              </div>
              {interactive && (
                <span className="text-[10px] font-mono text-slate-500">
                  {installedApps.length} installed
                </span>
              )}
            </div>

            {interactive && (
              <form
                onSubmit={handleCustomInstallSubmit}
                className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-1.5"
              >
                <div className="text-[10px] font-semibold text-slate-600">
                  Install from Chrome URL or APK Link
                </div>
                <input
                  type="text"
                  value={customAppName}
                  onChange={(e) => setCustomAppName(e.target.value)}
                  placeholder="App name (optional)"
                  className="w-full px-2 py-1 text-[11px] rounded border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-600"
                />
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={customAppUrl}
                    onChange={(e) => setCustomAppUrl(e.target.value)}
                    placeholder="https://site.com or app.apk"
                    className="flex-1 min-w-0 px-2 py-1 text-[11px] font-mono rounded border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-600"
                  />
                  <button
                    type="submit"
                    disabled={!customAppUrl.trim() || installingId === 'custom'}
                    className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium disabled:opacity-40 inline-flex items-center gap-1 shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{installingId === 'custom' ? '...' : 'Install'}</span>
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-1.5">
              {STORE_CATALOG.map((item) => {
                const installed = installedApps.find((a) => a.url === item.url);
                const isBusy = installingId === item.url;
                return (
                  <div
                    key={item.url}
                    className={`bg-white border border-slate-200 rounded-lg flex items-center justify-between gap-2 ${
                      interactive ? 'p-2' : 'p-1'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        style={{ backgroundColor: item.color }}
                        className={`rounded-lg text-white font-bold flex items-center justify-center shrink-0 ${
                          interactive ? 'w-8 h-8 text-xs' : 'w-4 h-4 text-[7px]'
                        }`}
                      >
                        {item.name.charAt(0)}
                      </span>
                      <div className="min-w-0">
                        <div className={`font-semibold truncate ${interactive ? 'text-xs' : 'text-[7px]'}`}>
                          {item.name}
                        </div>
                        {interactive && (
                          <div className="text-[10px] text-slate-500 truncate">
                            {item.category} · {item.size}
                          </div>
                        )}
                      </div>
                    </div>
                    {interactive && (
                      installed ? (
                        <button
                          type="button"
                          onClick={() => onOpenApp?.(device.slotId, 'webapp', installed.id)}
                          className="px-2.5 py-1 rounded-md bg-slate-900 text-white text-[10px] font-medium shrink-0"
                        >
                          Open
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            triggerSmoothInstall(item.url, {
                              url: item.url,
                              name: item.name,
                              source: 'store',
                              color: item.color,
                            })
                          }
                          className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-medium shrink-0 disabled:opacity-50"
                        >
                          {isBusy ? 'Installing...' : 'Install'}
                        </button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* DOWNLOADS / APK MANAGER */}
        {activeApp === 'downloads' && (
          <div className={`flex-1 bg-slate-50 text-slate-900 overflow-y-auto ${interactive ? 'p-3 space-y-2' : 'p-1.5 space-y-1'}`}>
            <div className={`font-bold flex items-center gap-1.5 ${interactive ? 'text-sm' : 'text-[8px]'}`}>
              <FolderDown className={interactive ? 'w-4 h-4 text-sky-600' : 'w-2.5 h-2.5 text-sky-600'} />
              <span>Chrome Downloads ({downloads.length})</span>
            </div>
            {downloads.length === 0 ? (
              <p className={`text-slate-500 ${interactive ? 'text-xs py-4' : 'text-[7px]'}`}>
                No downloads yet. Install an app from Chrome or Play Store.
              </p>
            ) : (
              downloads.map((dl) => {
                const app = dl.appId ? installedApps.find((a) => a.id === dl.appId) : null;
                return (
                  <div
                    key={dl.id}
                    className={`bg-white border border-slate-200 rounded-lg flex items-center justify-between gap-2 ${
                      interactive ? 'p-2' : 'p-1'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className={`font-mono font-medium truncate ${interactive ? 'text-[11px]' : 'text-[7px]'}`}>
                        {dl.fileName}
                      </div>
                      {interactive && (
                        <div className="text-[10px] text-slate-500">
                          {dl.sizeMb} · Installed
                        </div>
                      )}
                    </div>
                    {interactive && app && (
                      <button
                        type="button"
                        onClick={() => onOpenApp?.(device.slotId, 'webapp', app.id)}
                        className="px-2 py-1 rounded bg-blue-600 text-white text-[10px] font-medium shrink-0"
                      >
                        Open
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* INSTALLED WEB APP / APK VIEW */}
        {activeApp === 'webapp' && activeWebApp && (
          <div className="flex-1 min-h-0 bg-white text-slate-900 flex flex-col overflow-hidden">
            <div
              style={{ backgroundColor: activeWebApp.color }}
              className={`text-white flex items-center justify-between gap-2 shrink-0 ${
                interactive ? 'px-2.5 py-1.5' : 'px-1.5 py-0.5'
              }`}
            >
              <span className={`font-semibold truncate ${interactive ? 'text-xs' : 'text-[7px]'}`}>
                {activeWebApp.name}
              </span>
              {interactive && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIframeKey((k) => k + 1)}
                    aria-label="Reload app"
                    className="p-0.5 hover:bg-white/20 rounded"
                  >
                    <RotateCw className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onUninstallApp?.(device.slotId, activeWebApp.id)}
                    aria-label={`Uninstall ${activeWebApp.name}`}
                    title="Uninstall App"
                    className="p-0.5 hover:bg-white/20 rounded"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
            {interactive ? (
              <iframe
                ref={webAppIframeRef}
                key={`webapp-${device.slotId}-${activeWebApp.id}-${iframeKey}`}
                src={
                  effectiveMode === 'proxy' && backendProxyAvailable
                    ? `/api/browser-proxy?url=${encodeURIComponent(activeWebApp.url)}`
                    : activeWebApp.url
                }
                title={activeWebApp.name}
                loading="eager"
                sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals allow-downloads"
                allow="clipboard-read; clipboard-write; fullscreen"
                className="flex-1 min-h-0 w-full border-0 bg-white block"
                style={{ transform: 'translateZ(0)', backfaceVisibility: 'hidden' }}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-2 text-center">
                <div
                  style={{ backgroundColor: activeWebApp.color }}
                  className="w-6 h-6 rounded-md text-white text-[10px] font-bold flex items-center justify-center mb-1"
                >
                  {activeWebApp.name.charAt(0)}
                </div>
                <div className="text-[7px] font-medium text-slate-700 truncate max-w-full">
                  {activeWebApp.name}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SETTINGS */}
        {activeApp === 'settings' && (
          <div className={`flex-1 bg-slate-50 text-slate-900 overflow-y-auto ${interactive ? 'p-3 space-y-2' : 'p-1.5 space-y-1'}`}>
            <div className={`font-bold ${interactive ? 'text-sm' : 'text-[8px]'}`}>Settings</div>
            {[
              ['Device Name', device.name],
              ['Model', device.model],
              ['Android OS', `Android ${device.androidVersion}`],
              ['Resolution', device.resolution],
              ['Battery', `${device.battery ?? 85}%`],
              ['Installed Apps', `${installedApps.length} user app(s)`],
              ['Wi-Fi', 'Connected (5G)'],
            ].map(([k, v]) => (
              <div
                key={k}
                className={`bg-white border border-slate-200 rounded-lg ${interactive ? 'px-2.5 py-1.5' : 'px-1.5 py-0.5'}`}
              >
                <div className={`text-slate-400 ${interactive ? 'text-[10px]' : 'text-[6px]'}`}>{k}</div>
                <div className={`font-mono font-medium truncate ${interactive ? 'text-xs' : 'text-[7px]'}`}>{v}</div>
              </div>
            ))}
          </div>
        )}

        {/* NOTES */}
        {activeApp === 'notes' && (
          <div className={`flex-1 bg-amber-50 text-slate-900 flex flex-col ${interactive ? 'p-3 gap-2' : 'p-1.5 gap-1'}`}>
            <div className="flex items-center justify-between">
              <span className={`font-bold ${interactive ? 'text-sm' : 'text-[8px]'}`}>Notes</span>
              {interactive && (
                <button
                  type="button"
                  onClick={() => onSaveNote?.(device.slotId, noteDraft)}
                  className="px-2 py-1 rounded bg-amber-600 text-white text-[10px] font-medium"
                >
                  Save Note
                </button>
              )}
            </div>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              readOnly={!interactive}
              className={`flex-1 w-full bg-white border border-amber-200 rounded-lg resize-none focus:outline-none ${
                interactive ? 'p-2 text-xs' : 'p-1 text-[7px]'
              }`}
            />
          </div>
        )}

        {/* CALCULATOR */}
        {activeApp === 'calculator' && (
          <div className={`flex-1 bg-slate-900 text-white flex flex-col justify-between ${interactive ? 'p-3' : 'p-1.5'}`}>
            <div className={`text-right font-mono bg-slate-950 rounded-lg border border-slate-800 truncate ${interactive ? 'p-3 text-xl' : 'p-1 text-[9px]'}`}>
              {calcExpr}
            </div>
            <div className={`grid grid-cols-4 ${interactive ? 'gap-1.5 mt-2' : 'gap-0.5 mt-1'}`}>
              {['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', 'C', '0', '=', '+'].map((btn) => (
                <button
                  key={btn}
                  type="button"
                  onClick={() => handleCalcPress(btn)}
                  className={`rounded font-mono font-semibold ${
                    btn === '=' ? 'bg-blue-600' : btn === 'C' ? 'bg-rose-700' : 'bg-slate-800 hover:bg-slate-700'
                  } ${interactive ? 'py-2.5 text-sm' : 'py-0.5 text-[7px]'}`}
                >
                  {btn}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* GALLERY */}
        {activeApp === 'gallery' && (
          <div className={`flex-1 bg-slate-100 text-slate-900 overflow-y-auto ${interactive ? 'p-3 space-y-2' : 'p-1.5'}`}>
            <div className={`font-bold ${interactive ? 'text-sm' : 'text-[8px]'}`}>
              Screenshots ({deviceShots.length})
            </div>
            {deviceShots.length === 0 ? (
              <p className={`text-slate-500 ${interactive ? 'text-xs py-4' : 'text-[7px]'}`}>
                No screenshots yet. Click Screenshot to capture.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {deviceShots.map((s) => (
                  <img
                    key={s.id}
                    src={`data:image/png;base64,${s.imageBase64}`}
                    alt={s.deviceName}
                    className="w-full rounded border border-slate-300"
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Android Bottom Navigation Bar */}
      <div
        className={`bg-slate-950 border-t border-slate-800 flex items-center justify-around shrink-0 ${
          !interactive ? 'h-4' : compact ? 'h-5' : 'h-8'
        }`}
      >
        <button
          type="button"
          onClick={() => interactive && onGoBack?.(device.slotId)}
          aria-label="Android Back"
          className="p-0.5 text-slate-300 hover:text-white transition-transform active:scale-90"
        >
          <ArrowLeft className={!interactive ? 'w-2 h-2' : compact ? 'w-3 h-3' : 'w-4 h-4'} />
        </button>
        <button
          type="button"
          onClick={() => interactive && onGoHome?.(device.slotId)}
          aria-label="Android Home"
          className="p-0.5 text-slate-300 hover:text-white transition-transform active:scale-90"
        >
          <Home className={!interactive ? 'w-2 h-2' : compact ? 'w-3 h-3' : 'w-4 h-4'} />
        </button>
        <button
          type="button"
          onClick={() => interactive && onOpenApp?.(device.slotId, 'launcher')}
          aria-label="Android Recents"
          className="p-0.5 text-slate-300 hover:text-white transition-transform active:scale-90"
        >
          <Square className={!interactive ? 'w-2 h-2' : compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} />
        </button>
      </div>
    </div>
  );
}
