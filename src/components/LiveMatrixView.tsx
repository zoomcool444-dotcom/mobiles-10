import { Maximize2, Play, Square, Smartphone } from 'lucide-react';
import { CapturedScreenshot, PhysicalDeviceSlot, VirtualAppId } from '../types/device';
import { VirtualAndroidScreen } from './VirtualAndroidScreen';

interface LiveMatrixViewProps {
  devices: PhysicalDeviceSlot[];
  screenshots?: CapturedScreenshot[];
  onViewLiveScreen: (device: PhysicalDeviceSlot) => void;
  onStartDevice: (slotId: string) => void;
  onStopDevice: (slotId: string) => void;
  onOpenVirtualApp?: (slotId: string, appId: VirtualAppId, webAppId?: string) => void;
  onOpenUrl?: (slotId: string, url: string) => void;
  onReloadPage?: (slotId: string) => void;
  onGoBack?: (slotId: string) => void;
  onGoHome?: (slotId: string) => void;
  onSaveVirtualNote?: (slotId: string, noteText: string) => void;
  onTakeScreenshot?: (slotId: string) => void;
  onInstallApp?: (
    slotId: string,
    payload: { url: string; name?: string; source?: 'chrome' | 'store'; color?: string }
  ) => void;
  onUninstallApp?: (slotId: string, appId: string) => void;
}

export function LiveMatrixView({
  devices,
  screenshots = [],
  onViewLiveScreen,
  onStartDevice,
  onStopDevice,
  onOpenVirtualApp,
  onOpenUrl,
  onReloadPage,
  onGoBack,
  onGoHome,
  onSaveVirtualNote,
  onTakeScreenshot,
  onInstallApp,
  onUninstallApp,
}: LiveMatrixViewProps) {
  return (
    <section aria-label="10-Device Live Screen Matrix" className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Direct interactive live wall for Device 01 through Device 10.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
        {devices.map((device) => {
          const isOnline = device.usbStatus === 'online';
          const isStreaming = isOnline && device.mirrorStatus === 'streaming';
          return (
            <div
              key={device.slotId}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2 flex flex-col gap-2 shadow-sm"
            >
              <div className="flex items-center justify-between gap-1 text-[11px]">
                <span className="font-display font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {device.name}
                </span>
                <span
                  className={`font-mono text-[10px] tabular-nums shrink-0 ${
                    isOnline
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {isOnline ? (isStreaming ? `${device.fps}f` : 'On') : 'Off'}
                </span>
              </div>

              {device.virtualState?.isVirtual ? (
                <div className="relative rounded-xl bg-gradient-to-b from-slate-950 via-[#0c1426] to-slate-950 border border-slate-800/90 px-2 py-2.5">
                  <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-x-1 inset-y-2 rounded-xl ${
                      isOnline
                        ? 'bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.16),transparent_72%)]'
                        : 'bg-[radial-gradient(circle_at_center,rgba(100,116,139,0.08),transparent_72%)]'
                    }`}
                  />
                  <div className="relative w-full max-w-[160px] mx-auto">
                    <div
                      className={`p-[4px] rounded-[20px] bg-gradient-to-br from-slate-400/90 via-slate-700 to-slate-950 ring-1 ring-white/25 ${
                        isOnline ? 'shadow-lg shadow-sky-950/50' : 'shadow-md shadow-black/60'
                      }`}
                    >
                      <div
                        className="relative aspect-[9/16] w-full rounded-[16px] bg-black ring-1 ring-black overflow-hidden antialiased isolate"
                        style={{ contain: 'layout style' }}
                      >
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
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onViewLiveScreen(device)}
                  aria-label={`Open screen for ${device.name}`}
                  className="relative aspect-[9/16] w-full rounded-lg bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center hover:border-blue-500 transition-colors"
                >
                  {device.lastFrameBase64 ? (
                    <img
                      src={`data:image/jpeg;base64,${device.lastFrameBase64}`}
                      alt={`${device.name} matrix screen`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center px-2 space-y-1">
                      <Smartphone className="w-5 h-5 text-slate-600 mx-auto" />
                      <div className="text-[11px] text-slate-400">
                        {isOnline ? 'Stream idle' : 'Offline · Tap to open'}
                      </div>
                    </div>
                  )}
                </button>
              )}

              <div className="flex items-center gap-1.5">
                {device.active ? (
                  <button
                    type="button"
                    onClick={() => onStopDevice(device.slotId)}
                    className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-[11px] font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <Square className="w-3 h-3" />
                    <span>Stop</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onStartDevice(device.slotId)}
                    disabled={!isOnline}
                    className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-md text-[11px] font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40"
                  >
                    <Play className="w-3 h-3" />
                    <span>Start</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onViewLiveScreen(device)}
                  aria-label={`Expand ${device.name}`}
                  className="inline-flex items-center justify-center p-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
