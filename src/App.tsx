import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { FleetToolbar } from './components/FleetToolbar';
import { DeviceCard } from './components/DeviceCard';
import { LiveScreenModal } from './components/LiveScreenModal';
import { LiveMatrixView } from './components/LiveMatrixView';
import { ConnectionLogsView } from './components/ConnectionLogsView';
import { KaliSetupView } from './components/KaliSetupView';
import { ScreenshotModal } from './components/ScreenshotModal';
import { useDeviceFarm } from './hooks/useDeviceFarm';
import { DeviceFilter, WorkspaceView } from './types/device';

export default function App() {
  const {
    devices,
    logs,
    diagnostics,
    loading,
    backendAvailable,
    wsConnected,
    selectedIds,
    busySlots,
    fleetBusy,
    botRunningSlots,
    screenshots,
    activeScreenshot,
    setActiveScreenshot,
    feedback,
    clearFeedback,
    stats,
    scanDevices,
    connectDevice,
    pairDevice,
    disconnectDevice,
    startDevice,
    stopDevice,
    openBrowser,
    openUrl,
    reloadPage,
    goBack,
    goHome,
    tapScreen,
    swipeScreen,
    sendText,
    takeScreenshot,
    openVirtualApp,
    saveVirtualNote,
    installVirtualApp,
    uninstallVirtualApp,
    setOperatingMode,
    setVirtualFleetCount,
    toggleDeviceBot,
    startAllBots,
    stopAllBots,
    connectAllDevices,
    openUrlOnDevices,
    installAppOnFleet,
    runFleetAction,
    updateBridgeUrl,
    clearLogs,
    toggleSelectSlot,
    selectAllOnline,
    clearSelection,
  } = useDeviceFarm();

  const [activeView, setActiveView] = useState<WorkspaceView>('rack');
  const [filter, setFilter] = useState<DeviceFilter>('all');
  const [liveScreenSlotId, setLiveScreenSlotId] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('rack_theme') === 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('rack_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('rack_theme', 'light');
    }
  }, [darkMode]);

  const filteredDevices = useMemo(() => {
    return devices.filter((device) => {
      if (filter === 'online') return device.usbStatus === 'online';
      if (filter === 'offline') return device.usbStatus !== 'online';
      if (filter === 'mirroring') return device.mirrorStatus === 'streaming';
      return true;
    });
  }, [devices, filter]);

  const handleViewLiveScreen = useCallback((dev: { slotId: string }) => {
    setLiveScreenSlotId(dev.slotId);
  }, []);

  const liveScreenDevice = useMemo(
    () => devices.find((d) => d.slotId === liveScreenSlotId) || null,
    [devices, liveScreenSlotId]
  );

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F4F6F8] dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 overflow-x-hidden">
      <Sidebar
        activeView={activeView}
        onSelectView={setActiveView}
        stats={stats}
        diagnostics={diagnostics}
        backendAvailable={backendAvailable}
        wsConnected={wsConnected}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((prev) => !prev)}
        logCount={logs.length}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          activeView={activeView}
          filter={filter}
          onFilterChange={(nextFilter) => {
            setFilter(nextFilter);
            if (activeView !== 'rack' && activeView !== 'matrix') {
              setActiveView('rack');
            }
          }}
          onScanDevices={scanDevices}
          scanning={Boolean(fleetBusy)}
        />

        <main className="flex-1 p-2.5 sm:p-4 space-y-3 sm:space-y-4 w-full">
          {/* Truthful Bridge / Hardware Status Notice (only in hardware mode when bridge is offline) */}
          {!loading && diagnostics.mode === 'hardware' && !diagnostics.pythonBridgeConnected && (
            <div className="bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800/70 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 text-xs">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    Python Hardware Bridge Offline
                  </span>
                  <span className="text-slate-600 dark:text-slate-400 ml-1.5">
                    Target {diagnostics.pythonBridgeUrl} is not reachable. Devices accurately report
                    real hardware state (no simulated online phones).
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveView('setup')}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                Configure Bridge
              </button>
            </div>
          )}

          {/* Action Feedback Banner */}
          {feedback && (
            <div
              role="status"
              className={`border rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs ${
                feedback.type === 'error'
                  ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200'
                  : feedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {feedback.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                ) : feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <Info className="w-4 h-4 shrink-0" />
                )}
                <span className="truncate">{feedback.message}</span>
              </div>
              <button
                type="button"
                onClick={clearFeedback}
                aria-label="Dismiss notification"
                className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {(activeView === 'rack' || activeView === 'matrix') && (
            <div className="flex md:hidden items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg overflow-x-auto">
              {(['all', 'online', 'offline', 'mirroring'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md capitalize whitespace-nowrap ${
                    filter === item
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          )}

          {activeView === 'rack' && (
            <>
              <FleetToolbar
                selectedIds={selectedIds}
                onlineCount={stats.onlineCount}
                fleetBusy={fleetBusy}
                isVirtualMode={diagnostics.mode === 'virtual'}
                activeBotCount={Object.keys(botRunningSlots).length}
                onSelectAllOnline={selectAllOnline}
                onClearSelection={clearSelection}
                onConnectAll={connectAllDevices}
                onOpenUrlFleet={openUrlOnDevices}
                onInstallAppFleet={installAppOnFleet}
                onStartAllBots={startAllBots}
                onStopAllBots={stopAllBots}
                onFleetAction={runFleetAction}
              />

              {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
                  {Array.from({ length: 8 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="h-[340px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse"
                    />
                  ))}
                </div>
              ) : filteredDevices.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-3">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    No device slots match the "{filter}" filter.
                  </p>
                  <button
                    type="button"
                    onClick={() => setFilter('all')}
                    className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                  >
                    Show All Devices
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
                  {filteredDevices.map((device) => (
                    <DeviceCard
                      key={device.slotId}
                      device={device}
                      selected={selectedIds.includes(device.slotId)}
                      busyAction={busySlots[device.slotId] || null}
                      screenshots={screenshots}
                      onToggleSelect={toggleSelectSlot}
                      onConnect={connectDevice}
                      onPairWifi={pairDevice}
                      onDisconnect={disconnectDevice}
                      onStartDevice={startDevice}
                      onStopDevice={stopDevice}
                      onViewLiveScreen={handleViewLiveScreen}
                      onOpenBrowser={openBrowser}
                      onOpenUrl={openUrl}
                      onGoBack={goBack}
                      onGoHome={goHome}
                      onReloadPage={reloadPage}
                      onTakeScreenshot={takeScreenshot}
                      onOpenVirtualApp={openVirtualApp}
                      onSaveVirtualNote={saveVirtualNote}
                      onInstallApp={installVirtualApp}
                      onUninstallApp={uninstallVirtualApp}
                      botState={botRunningSlots[device.slotId] || null}
                      onToggleBot={toggleDeviceBot}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {activeView === 'matrix' && (
            <LiveMatrixView
              devices={filteredDevices}
              screenshots={screenshots}
              onViewLiveScreen={handleViewLiveScreen}
              onStartDevice={startDevice}
              onStopDevice={stopDevice}
              onOpenVirtualApp={openVirtualApp}
              onOpenUrl={openUrl}
              onReloadPage={reloadPage}
              onGoBack={goBack}
              onGoHome={goHome}
              onSaveVirtualNote={saveVirtualNote}
              onTakeScreenshot={takeScreenshot}
              onInstallApp={installVirtualApp}
              onUninstallApp={uninstallVirtualApp}
            />
          )}

          {activeView === 'logs' && (
            <ConnectionLogsView logs={logs} onClearLogs={clearLogs} />
          )}

          {activeView === 'setup' && (
            <KaliSetupView
              diagnostics={diagnostics}
              deviceCount={devices.length}
              onUpdateBridgeUrl={updateBridgeUrl}
              onScanDevices={scanDevices}
              onSetMode={setOperatingMode}
              onSetVirtualFleetCount={setVirtualFleetCount}
            />
          )}
        </main>
      </div>

      {liveScreenDevice && (
        <LiveScreenModal
          device={liveScreenDevice}
          busyAction={busySlots[liveScreenDevice.slotId] || null}
          pythonBridgeConnected={diagnostics.pythonBridgeConnected}
          screenshots={screenshots}
          onClose={() => setLiveScreenSlotId(null)}
          onConnect={connectDevice}
          onPairWifi={pairDevice}
          onOpenSetup={() => setActiveView('setup')}
          onStartDevice={startDevice}
          onStopDevice={stopDevice}
          onOpenBrowser={openBrowser}
          onOpenUrl={openUrl}
          onGoBack={goBack}
          onGoHome={goHome}
          onReloadPage={reloadPage}
          onTakeScreenshot={takeScreenshot}
          onTapScreen={tapScreen}
          onSwipeScreen={swipeScreen}
          onSendText={sendText}
          onOpenVirtualApp={openVirtualApp}
          onSaveVirtualNote={saveVirtualNote}
          onInstallApp={installVirtualApp}
          onUninstallApp={uninstallVirtualApp}
        />
      )}

      {activeScreenshot && (
        <ScreenshotModal
          screenshot={activeScreenshot}
          onClose={() => setActiveScreenshot(null)}
        />
      )}
    </div>
  );
}
