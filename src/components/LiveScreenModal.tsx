import { useState, FormEvent, MouseEvent, useRef } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Camera,
  Download,
  Globe,
  Home,
  Play,
  RotateCw,
  Send,
  Smartphone,
  Square,
  Store,
  Wifi,
  X,
} from 'lucide-react';
import { CapturedScreenshot, PhysicalDeviceSlot, VirtualAppId } from '../types/device';
import { VirtualAndroidScreen } from './VirtualAndroidScreen';

interface LiveScreenModalProps {
  device: PhysicalDeviceSlot;
  busyAction: string | null;
  pythonBridgeConnected: boolean;
  screenshots?: CapturedScreenshot[];
  onClose: () => void;
  onConnect: (slotId: string, target?: string) => void;
  onPairWifi: (slotId: string, pairTarget: string, pairingCode: string, connectTarget?: string) => void;
  onOpenSetup: () => void;
  onStartDevice: (slotId: string) => void;
  onStopDevice: (slotId: string) => void;
  onOpenBrowser: (slotId: string) => void;
  onOpenUrl: (slotId: string, url: string) => void;
  onGoBack: (slotId: string) => void;
  onGoHome: (slotId: string) => void;
  onReloadPage: (slotId: string) => void;
  onTakeScreenshot: (slotId: string) => void;
  onTapScreen: (slotId: string, x: number, y: number) => void;
  onSwipeScreen: (slotId: string, x1: number, y1: number, x2: number, y2: number) => void;
  onSendText: (slotId: string, text: string) => void;
  onOpenVirtualApp?: (slotId: string, appId: VirtualAppId, webAppId?: string) => void;
  onSaveVirtualNote?: (slotId: string, noteText: string) => void;
  onInstallApp?: (
    slotId: string,
    payload: { url: string; name?: string; source?: 'chrome' | 'store'; color?: string }
  ) => void;
  onUninstallApp?: (slotId: string, appId: string) => void;
}

function parseResolution(resolution: string): { width: number; height: number } {
  const match = resolution.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (match) {
    return { width: Number(match[1]), height: Number(match[2]) };
  }
  return { width: 1080, height: 2400 };
}

export function LiveScreenModal({
  device,
  busyAction,
  pythonBridgeConnected,
  screenshots = [],
  onClose,
  onConnect,
  onPairWifi,
  onOpenSetup,
  onStartDevice,
  onStopDevice,
  onOpenBrowser,
  onOpenUrl,
  onGoBack,
  onGoHome,
  onReloadPage,
  onTakeScreenshot,
  onTapScreen,
  onSwipeScreen,
  onSendText,
  onOpenVirtualApp,
  onSaveVirtualNote,
  onInstallApp,
  onUninstallApp,
}: LiveScreenModalProps) {
  const [url, setUrl] = useState(device.currentUrl || 'https://example.com');
  const [textInput, setTextInput] = useState('');
  const [wifiTarget, setWifiTarget] = useState('');
  const [pairTarget, setPairTarget] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [lastTap, setLastTap] = useState<{ x: number; y: number } | null>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);

  const dims = parseResolution(device.resolution);
  const isOnline = device.usbStatus === 'online';

  const handleScreenClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!screenRef.current || !isOnline) return;
    const rect = screenRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    const realX = Math.max(0, Math.min(dims.width, Math.round(relX * dims.width)));
    const realY = Math.max(0, Math.min(dims.height, Math.round(relY * dims.height)));
    setLastTap({ x: realX, y: realY });
    onTapScreen(device.slotId, realX, realY);
  };

  const handleUrlSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    onOpenUrl(device.slotId, url.trim());
  };

  const handleTextSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    onSendText(device.slotId, textInput.trim());
    setTextInput('');
  };

  const handleWifiSubmit = (e: FormEvent) => {
    e.preventDefault();
    const target = wifiTarget.trim();
    const pTarget = pairTarget.trim();
    const pCode = pairingCode.trim();
    if (pTarget && pCode) {
      onPairWifi(device.slotId, pTarget, pCode, target || undefined);
      return;
    }
    if (target) {
      onConnect(device.slotId, target);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${device.name} Live Screen`}
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-4xl max-h-[96dvh] sm:max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-3.5 py-2.5 sm:px-5 sm:py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
              {device.name} — {device.model}
            </h2>
            <p className="font-mono text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate tabular-nums">
              {device.serial || `Slot ${device.slotId}`} ·{' '}
              {isOnline ? `Android ${device.androidVersion} · ${device.resolution}` : 'Offline'} ·{' '}
              {device.mirrorStatus === 'streaming' ? `${device.fps} fps` : 'scrcpy standby'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close live screen modal"
            className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-3 sm:p-5 overflow-y-auto grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6 items-start">
          {/* Interactive Screen Viewport */}
          <div className="md:col-span-5 flex flex-col items-center">
            <div
              ref={screenRef}
              onClick={!device.virtualState?.isVirtual ? handleScreenClick : undefined}
              title={
                device.virtualState?.isVirtual
                  ? 'Interactive Android screen'
                  : isOnline
                  ? 'Click anywhere on screen to tap'
                  : 'Connect phone to stream live screen'
              }
              className={`w-full max-w-[250px] sm:max-w-[330px] aspect-[9/16] rounded-xl bg-slate-950 border border-slate-800 overflow-hidden relative flex items-center justify-center select-none ${
                !device.virtualState?.isVirtual && isOnline ? 'cursor-crosshair' : 'cursor-default'
              }`}
            >
              {device.virtualState?.isVirtual ? (
                <VirtualAndroidScreen
                  device={device}
                  interactive={true}
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
                />
              ) : device.lastFrameBase64 && isOnline ? (
                <img
                  src={`data:image/jpeg;base64,${device.lastFrameBase64}`}
                  alt={`${device.name} interactive live stream`}
                  className="w-full h-full object-contain pointer-events-none"
                />
              ) : (
                <div className="px-6 text-center space-y-2.5">
                  <Smartphone className="w-9 h-9 text-slate-600 mx-auto" />
                  <p className="text-xs font-medium text-slate-300">
                    {isOnline
                      ? 'Phone Online — Mirror Idle'
                      : !pythonBridgeConnected
                      ? 'Kali Python Bridge Offline'
                      : `${device.name} is Offline`}
                  </p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {isOnline
                      ? 'Click Start Device on the right to begin live scrcpy screen mirroring.'
                      : !pythonBridgeConnected
                      ? 'Start python3 backend/app.py on Kali Linux (or configure Bridge URL) to connect real Android devices.'
                      : 'Enter your phone Wi-Fi IP:Port on the right to connect without a cable.'}
                  </p>
                </div>
              )}
            </div>
            <div className="mt-2 w-full max-w-[250px] sm:max-w-[330px] flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              <span>{device.virtualState?.isVirtual ? 'Interactive Android 14' : isOnline ? 'Click screen to tap' : 'Waiting for device'}</span>
              <span>{lastTap ? `Last tap: ${lastTap.x}, ${lastTap.y}` : dims.width + '×' + dims.height}</span>
            </div>
          </div>

          {/* Remote Hardware Controls */}
          <div className="md:col-span-7 space-y-5 min-w-0">
            {!isOnline && device.virtualState?.isVirtual && (
              <div className="p-3.5 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs">
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    {device.name} is Disconnected
                  </div>
                  <div className="text-slate-600 dark:text-slate-400 mt-0.5">
                    Click Connect to boot this virtual Android phone.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onConnect(device.slotId)}
                  disabled={Boolean(busyAction)}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
                >
                  Connect Phone
                </button>
              </div>
            )}

            {!isOnline && !device.virtualState?.isVirtual && (
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5 text-blue-600" />
                    <span>Connect Device Wirelessly (Wi-Fi ADB)</span>
                  </h3>
                  {!pythonBridgeConnected && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenSetup();
                      }}
                      className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Open Bridge Setup
                    </button>
                  )}
                </div>

                <form onSubmit={handleWifiSubmit} className="space-y-2">
                  <input
                    type="text"
                    value={wifiTarget}
                    onChange={(e) => setWifiTarget(e.target.value)}
                    placeholder="Phone IP:Port (e.g. 192.168.1.101:5555)"
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={pairTarget}
                      onChange={(e) => setPairTarget(e.target.value)}
                      placeholder="Pair IP:Port (Android 11+)"
                      className="px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <input
                      type="text"
                      value={pairingCode}
                      onChange={(e) => setPairingCode(e.target.value)}
                      placeholder="6-digit pairing code"
                      className="px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={Boolean(busyAction) || (!wifiTarget.trim() && !(pairTarget.trim() && pairingCode.trim()))}
                      className="px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40"
                    >
                      {pairTarget.trim() && pairingCode.trim() ? 'Pair & Connect' : 'Connect Wi-Fi'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onConnect(device.slotId)}
                      disabled={Boolean(busyAction)}
                      className="px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
                    >
                      Auto Connect
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Session & Stream Control
              </h3>
              <div className="flex flex-wrap gap-2">
                {device.active ? (
                  <button
                    type="button"
                    onClick={() => onStopDevice(device.slotId)}
                    disabled={Boolean(busyAction)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Stop Device</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onStartDevice(device.slotId)}
                    disabled={!isOnline || Boolean(busyAction)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Start Device</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onTakeScreenshot(device.slotId)}
                  disabled={!isOnline || Boolean(busyAction)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Take Screenshot</span>
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Browser & Authorized URL Navigation
              </h3>
              <form onSubmit={handleUrlSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Search or enter URL (e.g. wikipedia.org)"
                  className="flex-1 min-w-0 px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <button
                  type="submit"
                  disabled={!isOnline || Boolean(busyAction)}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 whitespace-nowrap"
                >
                  Open URL
                </button>
              </form>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onOpenBrowser(device.slotId)}
                  disabled={!isOnline || Boolean(busyAction)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Open Chrome</span>
                </button>
                <button
                  type="button"
                  onClick={() => onReloadPage(device.slotId)}
                  disabled={!isOnline || Boolean(busyAction)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Reload Page</span>
                </button>
                {device.virtualState?.isVirtual && onInstallApp && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = url.trim();
                      if (target) onInstallApp(device.slotId, { url: target, source: 'chrome' });
                    }}
                    disabled={!isOnline || Boolean(busyAction) || !url.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-emerald-200 dark:border-emerald-900/70 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-40 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Install App</span>
                  </button>
                )}
                {device.virtualState?.isVirtual && onOpenVirtualApp && (
                  <>
                    <button
                      type="button"
                      onClick={() => onOpenVirtualApp(device.slotId, 'store')}
                      disabled={!isOnline || Boolean(busyAction)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap"
                    >
                      <Store className="w-3.5 h-3.5" />
                      <span>Play Store</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenVirtualApp(device.slotId, 'downloads')}
                      disabled={!isOnline || Boolean(busyAction)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Downloads</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Hardware Keys & Gestures
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onGoBack(device.slotId)}
                  disabled={!isOnline || Boolean(busyAction)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Go Back</span>
                </button>
                <button
                  type="button"
                  onClick={() => onGoHome(device.slotId)}
                  disabled={!isOnline || Boolean(busyAction)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                >
                  <Home className="w-3.5 h-3.5" />
                  <span>Go Home</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onSwipeScreen(
                      device.slotId,
                      Math.round(dims.width / 2),
                      Math.round(dims.height * 0.72),
                      Math.round(dims.width / 2),
                      Math.round(dims.height * 0.3)
                    )
                  }
                  disabled={!isOnline || Boolean(busyAction)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                  <span>Scroll Down</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onSwipeScreen(
                      device.slotId,
                      Math.round(dims.width / 2),
                      Math.round(dims.height * 0.3),
                      Math.round(dims.width / 2),
                      Math.round(dims.height * 0.72)
                    )
                  }
                  disabled={!isOnline || Boolean(busyAction)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                  <span>Scroll Up</span>
                </button>
              </div>
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Android Keyboard Input
              </h3>
              <form onSubmit={handleTextSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Send text to focused Android input..."
                  className="flex-1 min-w-0 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <button
                  type="submit"
                  disabled={!isOnline || Boolean(busyAction)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Text</span>
                </button>
              </form>
            </div>

            <dl className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Appium Port</dt>
                <dd className="font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                  {device.appiumPort} ({device.appiumStatus})
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">scrcpy PID</dt>
                <dd className="font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                  {device.scrcpyPid || '—'}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-slate-500 dark:text-slate-400">Current Activity</dt>
                <dd className="font-mono text-slate-900 dark:text-slate-100 truncate">
                  {device.currentActivity}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
