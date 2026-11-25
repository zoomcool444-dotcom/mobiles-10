import { memo, useState, FormEvent } from 'react';
import {
  ArrowLeft,
  Bot,
  Camera,
  ExternalLink,
  Globe,
  Home,
  Maximize2,
  Play,
  RotateCw,
  Square,
  Unplug,
  AlertTriangle,
  Wifi,
  WifiOff,
  Smartphone,
} from 'lucide-react';
import { CapturedScreenshot, PhysicalDeviceSlot, VirtualAppId } from '../types/device';
import { VirtualAndroidScreen } from './VirtualAndroidScreen';

interface DeviceCardProps {
  device: PhysicalDeviceSlot;
  selected: boolean;
  busyAction: string | null;
  screenshots?: CapturedScreenshot[];
  onToggleSelect: (slotId: string) => void;
  onConnect: (slotId: string, target?: string) => void;
  onPairWifi: (slotId: string, pairTarget: string, pairingCode: string, connectTarget?: string) => void;
  onDisconnect: (slotId: string) => void;
  onStartDevice: (slotId: string) => void;
  onStopDevice: (slotId: string) => void;
  onViewLiveScreen: (device: PhysicalDeviceSlot) => void;
  onOpenBrowser: (slotId: string) => void;
  onOpenUrl: (slotId: string, url: string) => void;
  onGoBack: (slotId: string) => void;
  onGoHome: (slotId: string) => void;
  onReloadPage: (slotId: string) => void;
  onTakeScreenshot: (slotId: string) => void;
  onOpenVirtualApp?: (slotId: string, appId: VirtualAppId, webAppId?: string) => void;
  onSaveVirtualNote?: (slotId: string, noteText: string) => void;
  onInstallApp?: (
    slotId: string,
    payload: { url: string; name?: string; source?: 'chrome' | 'store'; color?: string }
  ) => void;
  onUninstallApp?: (slotId: string, appId: string) => void;
  botState?: { step: number; runs: number; status: string } | null;
  onToggleBot?: (slotId: string) => void;
}

export const DeviceCard = memo(function DeviceCard({
  device,
  selected,
  busyAction,
  screenshots = [],
  onToggleSelect,
  onConnect,
  onPairWifi,
  onDisconnect,
  onStartDevice,
  onStopDevice,
  onViewLiveScreen,
  onOpenBrowser,
  onOpenUrl,
  onGoBack,
  onGoHome,
  onReloadPage,
  onTakeScreenshot,
  onOpenVirtualApp,
  onSaveVirtualNote,
  onInstallApp,
  onUninstallApp,
  botState = null,
  onToggleBot,
}: DeviceCardProps) {
  const [urlBarOpen, setUrlBarOpen] = useState(false);
  const [urlValue, setUrlValue] = useState(device.currentUrl || 'https://example.com');
  const [wifiPanelOpen, setWifiPanelOpen] = useState(false);
  const [wifiTarget, setWifiTarget] = useState('');
  const [pairTarget, setPairTarget] = useState('');
  const [pairingCode, setPairingCode] = useState('');

  const isOnline = device.usbStatus === 'online';
  const isUnauthorized = device.usbStatus === 'unauthorized';
  const isStreaming = isOnline && device.mirrorStatus === 'streaming' && Boolean(device.lastFrameBase64);

  const handleOpenUrlSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = urlValue.trim();
    if (!trimmed) return;
    onOpenUrl(device.slotId, trimmed);
    setUrlBarOpen(false);
  };

  const handleWifiConnectSubmit = (e: FormEvent) => {
    e.preventDefault();
    const target = wifiTarget.trim();
    const pTarget = pairTarget.trim();
    const pCode = pairingCode.trim();
    if (pTarget && pCode) {
      onPairWifi(device.slotId, pTarget, pCode, target || undefined);
      setWifiPanelOpen(false);
      return;
    }
    if (target) {
      onConnect(device.slotId, target);
      setWifiPanelOpen(false);
    }
  };

  const statusText =
    device.usbStatus === 'online'
      ? 'Online'
      : device.usbStatus === 'unauthorized'
      ? 'Unauthorized'
      : device.usbStatus === 'disconnected'
      ? 'Disconnected'
      : 'Offline';

  const statusColorClass =
    device.usbStatus === 'online'
      ? 'text-emerald-700 dark:text-emerald-400'
      : device.usbStatus === 'unauthorized'
      ? 'text-amber-700 dark:text-amber-400'
      : 'text-slate-500 dark:text-slate-400';

  return (
    <article
      className={`bg-white dark:bg-slate-900/95 border rounded-2xl flex flex-col transition-colors duration-200 ${
        selected
          ? 'border-blue-500 ring-1 ring-blue-500 shadow-md'
          : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm'
      }`}
    >
      {/* Card Header */}
      <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(device.slotId)}
            aria-label={`Select ${device.name}`}
            className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600 cursor-pointer shrink-0"
          />
          <h2 className="font-display text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
            {device.name}
          </h2>
        </div>

        <div
          title={busyAction || statusText}
          className={`flex items-center gap-1 text-[10px] font-medium shrink-0 ${statusColorClass}`}
        >
          {device.usbStatus === 'online' ? (
            <Wifi className="w-3 h-3" />
          ) : device.usbStatus === 'unauthorized' ? (
            <AlertTriangle className="w-3 h-3" />
          ) : (
            <WifiOff className="w-3 h-3" />
          )}
          <span className="hidden 2xl:inline whitespace-nowrap">{busyAction || statusText}</span>
        </div>
      </div>

      {/* Real-time Phone Screen Preview + Compact Spec */}
      {device.virtualState?.isVirtual ? (
        <div className="p-2 space-y-1.5">
          {/* 3D Studio Stage + Compact Flagship Titanium Phone Chassis */}
          <div className="relative rounded-xl bg-gradient-to-b from-slate-950 via-[#0c1426] to-slate-950 border border-slate-800/90 px-2 py-2.5">
            {/* Lightweight Ambient Glow behind Phone (no GPU blur-2xl buffer) */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-1 inset-y-2 rounded-xl ${
                isOnline
                  ? 'bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.16),transparent_72%)]'
                  : 'bg-[radial-gradient(circle_at_center,rgba(100,116,139,0.08),transparent_72%)]'
              }`}
            />

            {/* 3D Hardware Chassis */}
            <div className="relative w-full max-w-[160px] mx-auto">
              {/* Physical Side Buttons */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-[2px] top-10 w-[2px] h-5 rounded-r-sm bg-slate-500"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-[2px] top-16 w-[2px] h-7 rounded-r-sm bg-slate-500"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -left-[2px] top-12 w-[2px] h-4 rounded-l-sm bg-slate-500"
              />

              {/* Outer Machined Titanium Bezel */}
              <div
                className={`relative p-[4px] rounded-[20px] bg-gradient-to-br from-slate-400/90 via-slate-700 to-slate-950 ring-1 ring-white/25 ${
                  isOnline ? 'shadow-lg shadow-sky-950/50' : 'shadow-md shadow-black/60'
                }`}
              >
                {/* Inner OLED Glass Display */}
                <div
                  className="relative aspect-[9/16] w-full rounded-[16px] bg-black ring-1 ring-black overflow-hidden antialiased isolate"
                  style={{ contain: 'layout style' }}
                >
                  {/* Top Punch-Hole Camera Lens */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 z-30 w-1.5 h-1.5 rounded-full bg-slate-950 ring-1 ring-slate-700/80"
                  />

                  <VirtualAndroidScreen
                    device={device}
                    interactive={true}
                    compact={true}
                    screenshots={screenshots}
                    onOpenApp={onOpenVirtualApp}
                    onOpenUrl={onOpenUrl}
                    onReloadPage={onReloadPage}
                    onGoBack={onGoBack}
                    onGoHome={onGoHome}
                    onSaveNote={onSaveVirtualNote}
                    onTakeScreenshot={onTakeScreenshot}
                    onInstallApp={onInstallApp}
                    onUninstallApp={onUninstallApp}
                    botState={botState}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Compact 1-Line Hardware Meta */}
          <div className="flex items-center justify-between gap-1 text-[10px] px-0.5 text-slate-500 dark:text-slate-400">
            <span className="truncate font-medium text-slate-700 dark:text-slate-200">{device.model}</span>
            <span className="font-mono tabular-nums shrink-0">
              {device.battery !== null ? `${device.battery}%` : '—'}
            </span>
          </div>
        </div>
      ) : (
        <div className="p-2.5 sm:p-4 flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch">
          {/* 9:16 Real-Time Screen Viewport (Hardware mode) */}
          <div className="w-24 mx-auto sm:mx-0 sm:w-28 md:w-32 shrink-0 flex flex-col">
            <button
              type="button"
              onClick={() => onViewLiveScreen(device)}
              aria-label={`Open screen for ${device.name}`}
              className="relative aspect-[9/16] w-full rounded-lg bg-slate-950 border border-slate-800 hover:border-blue-500 overflow-hidden flex flex-col items-center justify-center group transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              {isStreaming && device.lastFrameBase64 ? (
                <img
                  src={`data:image/jpeg;base64,${device.lastFrameBase64}`}
                  alt={`${device.name} live Android screen`}
                  className="w-full h-full object-cover"
                />
              ) : device.lastFrameBase64 && isOnline ? (
                <img
                  src={`data:image/jpeg;base64,${device.lastFrameBase64}`}
                  alt={`${device.name} last screen frame`}
                  className="w-full h-full object-cover opacity-80"
                />
              ) : (
                <div className="px-2 text-center space-y-1.5">
                  <Smartphone className="w-5 h-5 text-slate-600 mx-auto" />
                  <p className="text-[10px] leading-tight text-slate-400">
                    {isOnline
                      ? 'Mirror stopped'
                      : isUnauthorized
                      ? 'Allow debugging'
                      : 'Offline · Open screen'}
                  </p>
                </div>
              )}

              <span className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[11px] font-medium gap-1">
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Open Screen</span>
              </span>
            </button>
            <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              <span>{isStreaming ? 'scrcpy live' : 'scrcpy idle'}</span>
              <span>{isStreaming && device.fps > 0 ? `${device.fps} fps` : '0 fps'}</span>
            </div>
          </div>

          {/* Unboxed Tabular Hardware Specifications */}
          <dl className="flex-1 min-w-0 space-y-2 text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-slate-500 dark:text-slate-400 shrink-0">Model</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100 truncate text-right">
                {device.model}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-slate-500 dark:text-slate-400 shrink-0">Android</dt>
              <dd className="font-mono text-slate-800 dark:text-slate-200 truncate text-right tabular-nums">
                {device.androidVersion !== '—' ? `Android ${device.androidVersion}` : '—'}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-slate-500 dark:text-slate-400 shrink-0">Connection</dt>
              <dd className={`truncate text-right font-medium ${statusColorClass}`}>
                {statusText}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-slate-500 dark:text-slate-400 shrink-0">Battery</dt>
              <dd className="font-mono text-slate-800 dark:text-slate-200 text-right tabular-nums">
                {device.battery !== null
                  ? `${device.battery}%${device.batteryCharging ? ' (CHG)' : ''}`
                  : '—'}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-slate-500 dark:text-slate-400 shrink-0">Resolution</dt>
              <dd className="font-mono text-slate-800 dark:text-slate-200 truncate text-right tabular-nums">
                {device.resolution}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-slate-500 dark:text-slate-400 shrink-0">Browser</dt>
              <dd className="text-slate-800 dark:text-slate-200 truncate text-right">
                {device.browserStatus}
              </dd>
            </div>
            <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800">
              <dt className="text-[11px] text-slate-500 dark:text-slate-400">Current Activity</dt>
              <dd
                title={device.currentActivity}
                className="font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate mt-0.5"
              >
                {device.currentActivity}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {/* Inline Open URL Input Bar */}
      {urlBarOpen && (
        <form
          onSubmit={handleOpenUrlSubmit}
          className="px-2.5 sm:px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center gap-1.5 sm:gap-2"
        >
          <input
            type="text"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder="Search or URL (e.g. wikipedia.org)"
            aria-label={`URL to open on ${device.name}`}
            className="flex-1 min-w-0 px-2 py-1.5 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            type="submit"
            disabled={!isOnline || Boolean(busyAction)}
            className="px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            Go
          </button>
        </form>
      )}

      {/* Inline Wireless Wi-Fi Connect / Pair Bar */}
      {wifiPanelOpen && (
        <form
          onSubmit={handleWifiConnectSubmit}
          className="px-2.5 sm:px-4 py-2.5 sm:py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-medium text-slate-700 dark:text-slate-300">
            <span>Connect via Wi-Fi</span>
            <button
              type="button"
              onClick={() => {
                onConnect(device.slotId);
                setWifiPanelOpen(false);
              }}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Auto Connect
            </button>
          </div>
          <input
            type="text"
            value={wifiTarget}
            onChange={(e) => setWifiTarget(e.target.value)}
            placeholder="Phone IP:Port (192.168.1.101:5555)"
            aria-label={`Wi-Fi IP and port for ${device.name}`}
            className="w-full px-2 py-1.5 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            <input
              type="text"
              value={pairTarget}
              onChange={(e) => setPairTarget(e.target.value)}
              placeholder="Pair IP:Port (opt)"
              aria-label={`Pairing IP and port for ${device.name}`}
              className="w-full px-2 py-1.5 text-[11px] font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <input
              type="text"
              value={pairingCode}
              onChange={(e) => setPairingCode(e.target.value)}
              placeholder="6-digit code (opt)"
              aria-label={`Pairing code for ${device.name}`}
              className="w-full px-2 py-1.5 text-[11px] font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setWifiPanelOpen(false)}
              className="px-2.5 py-1 rounded-md text-[11px] text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={Boolean(busyAction) || (!wifiTarget.trim() && !(pairTarget.trim() && pairingCode.trim()))}
              className="px-3 py-1 rounded-md text-[11px] font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40"
            >
              {pairTarget.trim() && pairingCode.trim() ? 'Pair & Connect' : 'Connect Wi-Fi'}
            </button>
          </div>
        </form>
      )}

      {/* Compact Device Controls Grid */}
      <div className="mt-auto px-2 py-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
        <div className="grid grid-cols-4 gap-1">
          {isOnline ? (
            <button
              type="button"
              title="Disconnect"
              aria-label={`Disconnect ${device.name}`}
              onClick={() => onDisconnect(device.slotId)}
              disabled={Boolean(busyAction)}
              className="inline-flex items-center justify-center py-2 sm:py-1.5 px-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
            >
              <Unplug className="w-3 h-3" />
            </button>
          ) : (
            <button
              type="button"
              title="Connect"
              aria-label={`Connect ${device.name}`}
              onClick={() =>
                device.virtualState?.isVirtual
                  ? onConnect(device.slotId)
                  : setWifiPanelOpen((prev) => !prev)
              }
              disabled={Boolean(busyAction)}
              className={`inline-flex items-center justify-center py-2 sm:py-1.5 px-1.5 rounded transition-colors disabled:opacity-40 ${
                wifiPanelOpen
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800'
              }`}
            >
              <Wifi className="w-3 h-3" />
            </button>
          )}

          {device.active ? (
            <button
              type="button"
              title="Stop Device"
              aria-label={`Stop ${device.name}`}
              onClick={() => onStopDevice(device.slotId)}
              disabled={!isOnline || Boolean(busyAction)}
              className="inline-flex items-center justify-center py-2 sm:py-1.5 px-1.5 rounded border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40"
            >
              <Square className="w-3 h-3" />
            </button>
          ) : (
            <button
              type="button"
              title="Start Device"
              aria-label={`Start ${device.name}`}
              onClick={() => onStartDevice(device.slotId)}
              disabled={!isOnline || Boolean(busyAction)}
              className="inline-flex items-center justify-center py-2 sm:py-1.5 px-1.5 rounded border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-40"
            >
              <Play className="w-3 h-3" />
            </button>
          )}

          <button
            type="button"
            title="Open Browser"
            aria-label={`Open browser on ${device.name}`}
            onClick={() => onOpenBrowser(device.slotId)}
            disabled={!isOnline || Boolean(busyAction)}
            className="inline-flex items-center justify-center py-2 sm:py-1.5 px-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            <Globe className="w-3 h-3" />
          </button>

          <button
            type="button"
            title="Expand Live Screen"
            aria-label={`Expand ${device.name}`}
            onClick={() => onViewLiveScreen(device)}
            className="inline-flex items-center justify-center py-2 sm:py-1.5 px-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Maximize2 className="w-3 h-3" />
          </button>

          <button
            type="button"
            title="Open URL"
            aria-label={`Open URL on ${device.name}`}
            onClick={() => setUrlBarOpen((prev) => !prev)}
            disabled={!isOnline || Boolean(busyAction)}
            className={`inline-flex items-center justify-center py-2 sm:py-1.5 px-1.5 rounded border transition-colors disabled:opacity-40 ${
              urlBarOpen
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40'
                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <ExternalLink className="w-3 h-3" />
          </button>

          <button
            type="button"
            title="Reload Page"
            aria-label={`Reload ${device.name}`}
            onClick={() => onReloadPage(device.slotId)}
            disabled={!isOnline || Boolean(busyAction)}
            className="inline-flex items-center justify-center py-2 sm:py-1.5 px-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            <RotateCw className="w-3 h-3" />
          </button>

          <button
            type="button"
            title="Go Back"
            aria-label={`Go back on ${device.name}`}
            onClick={() => onGoBack(device.slotId)}
            disabled={!isOnline || Boolean(busyAction)}
            className="inline-flex items-center justify-center py-2 sm:py-1.5 px-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            <ArrowLeft className="w-3 h-3" />
          </button>

          <button
            type="button"
            title="Go Home"
            aria-label={`Go home on ${device.name}`}
            onClick={() => onGoHome(device.slotId)}
            disabled={!isOnline || Boolean(busyAction)}
            className="inline-flex items-center justify-center py-2 sm:py-1.5 px-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            <Home className="w-3 h-3" />
          </button>
        </div>

        {/* Authorized QA Real Bot Control */}
        {onToggleBot && (
          <div className="pt-1 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1">
            <button
              type="button"
              onClick={() => onToggleBot(device.slotId)}
              disabled={!isOnline}
              title={botState ? `Running #${botState.runs}: ${botState.status}` : 'Start QA Real Bot'}
              className={`w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 sm:py-1 rounded text-[10px] font-medium transition-colors disabled:opacity-40 whitespace-nowrap ${
                botState
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-cyan-600 hover:bg-cyan-700 text-white'
              }`}
            >
              {botState ? <Square className="w-2.5 h-2.5 shrink-0" /> : <Bot className="w-2.5 h-2.5 shrink-0" />}
              <span className="truncate">{botState ? `Stop #${botState.runs}` : 'Real Bot'}</span>
            </button>
            <button
              type="button"
              title="Take Screenshot"
              aria-label={`Take screenshot of ${device.name}`}
              onClick={() => onTakeScreenshot(device.slotId)}
              disabled={!isOnline || Boolean(busyAction)}
              className="inline-flex items-center justify-center p-1.5 sm:p-1 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 shrink-0"
            >
              <Camera className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
});
