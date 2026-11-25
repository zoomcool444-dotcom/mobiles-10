import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BridgeDiagnostics,
  CapturedScreenshot,
  ConnectionLogEntry,
  PhysicalDeviceSlot,
  VirtualAppId,
} from '../types/device';
import { renderVirtualScreenshotBase64 } from '../utils/virtualScreenshot';
import {
  APP_ACTIVITIES,
  applyVirtualSlotActionClient,
  createClientLog,
  createVirtualDevices,
  deriveAppNameFromUrl,
  installAppOnVirtualDeviceClient,
  openUrlOnVirtualDeviceClient,
  resizeVirtualDevices,
  validateAuthorizedUrlClient,
} from '../utils/virtualFleetClient';

export interface ActionFeedback {
  type: 'info' | 'success' | 'error';
  message: string;
}

export interface DeviceBotState {
  step: number;
  runs: number;
  status: string;
}

const REAL_QA_TARGET_URL = 'https://demo-task11.netlify.app';

const QA_REAL_STEPS: Array<{ label: string; action: 'open' | 'reload' | 'verify' }> = [
  { label: 'Opening demo-task.netlify.app', action: 'open' },
  { label: 'Viewport & bundle UI check', action: 'verify' },
  { label: 'Reload & asset check', action: 'reload' },
  { label: 'Session health verified', action: 'verify' },
];

function isJsonResponse(res: Response): boolean {
  const ct = res.headers.get('content-type') || '';
  return res.ok && ct.toLowerCase().includes('application/json');
}

export function useDeviceFarm() {
  const [devices, setDevices] = useState<PhysicalDeviceSlot[]>(() => createVirtualDevices(10));
  const [logs, setLogs] = useState<ConnectionLogEntry[]>(() => [
    createClientLog(
      'success',
      'VirtualOS',
      '10 interactive Virtual Android devices initialized and online.'
    ),
  ]);
  const [diagnostics, setDiagnostics] = useState<BridgeDiagnostics>({
    mode: 'virtual',
    pythonBridgeUrl: 'http://127.0.0.1:5000',
    pythonBridgeConnected: false,
    localAdbAvailable: false,
    scrcpyAvailable: false,
    appiumAvailable: false,
    hostPlatform: 'browser',
    lastSyncAt: new Date().toISOString(),
    lastError: null,
  });
  const [loading, setLoading] = useState(false);
  const [backendAvailable, setBackendAvailable] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busySlots, setBusySlots] = useState<Record<string, string | null>>({});
  const [fleetBusy, setFleetBusy] = useState<string | null>(null);
  const [botRunningSlots, setBotRunningSlots] = useState<Record<string, DeviceBotState>>({});
  const botTimersRef = useRef<Record<string, number>>({});
  const botCountersRef = useRef<Record<string, { step: number; runs: number }>>({});
  const [screenshots, setScreenshots] = useState<CapturedScreenshot[]>([]);
  const [activeScreenshot, setActiveScreenshot] = useState<CapturedScreenshot | null>(null);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);

  const backendAvailableRef = useRef(false);
  const modeRef = useRef<'virtual' | 'hardware'>('virtual');
  const devicesRef = useRef<PhysicalDeviceSlot[]>(devices);
  devicesRef.current = devices;
  modeRef.current = diagnostics.mode;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);

  const showFeedback = useCallback((type: ActionFeedback['type'], message: string) => {
    setFeedback({ type, message });
  }, []);

  const clearFeedback = useCallback(() => {
    setFeedback(null);
  }, []);

  const pushClientLog = useCallback(
    (
      level: ConnectionLogEntry['level'],
      source: ConnectionLogEntry['source'],
      message: string,
      deviceId: string | null = null,
      deviceName: string | null = null
    ) => {
      const entry = createClientLog(level, source, message, deviceId, deviceName);
      setLogs((prev) => [entry, ...prev].slice(0, 500));
    },
    []
  );

  const fetchInitialState = useCallback(async () => {
    try {
      const devicesRes = await fetch('/api/devices');
      if (!isJsonResponse(devicesRes)) {
        // Static hosting (e.g. Netlify): stay cleanly in browser-local Virtual Fleet mode
        backendAvailableRef.current = false;
        setBackendAvailable(false);
        return false;
      }

      const data = await devicesRes.json();
      backendAvailableRef.current = true;
      setBackendAvailable(true);

      if (Array.isArray(data.devices)) {
        setDevices(data.devices);
      }
      if (data.diagnostics) {
        setDiagnostics(data.diagnostics);
      }

      const logsRes = await fetch('/api/logs').catch(() => null);
      if (logsRes && isJsonResponse(logsRes)) {
        const logData = await logsRes.json();
        if (Array.isArray(logData.logs)) {
          setLogs(logData.logs);
        }
      }
      return true;
    } catch {
      backendAvailableRef.current = false;
      setBackendAvailable(false);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let disposed = false;

    const connectWs = () => {
      if (disposed || !backendAvailableRef.current) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        setWsConnected(true);
        reconnectAttemptRef.current = 0;
        void fetchInitialState();
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          switch (payload.type) {
            case 'devices:sync':
              if (Array.isArray(payload.devices)) {
                setDevices(payload.devices);
              }
              if (payload.diagnostics) {
                setDiagnostics(payload.diagnostics);
              }
              setLoading(false);
              break;
            case 'device:updated':
              if (payload.device?.slotId) {
                setDevices((prev) =>
                  prev.map((d) => (d.slotId === payload.device.slotId ? payload.device : d))
                );
              }
              break;
            case 'device:frame':
              if (payload.slotId && payload.frameBase64) {
                setDevices((prev) =>
                  prev.map((d) =>
                    d.slotId === payload.slotId
                      ? {
                          ...d,
                          lastFrameBase64: payload.frameBase64,
                          lastFrameAt: payload.timestamp || new Date().toISOString(),
                          fps: typeof payload.fps === 'number' ? payload.fps : d.fps,
                          mirrorStatus: 'streaming',
                        }
                      : d
                  )
                );
              }
              break;
            case 'log:entry':
              if (payload.entry?.id) {
                setLogs((prev) => {
                  if (prev.some((l) => l.id === payload.entry.id)) {
                    return prev;
                  }
                  return [payload.entry, ...prev].slice(0, 500);
                });
              }
              break;
            case 'logs:sync':
              if (Array.isArray(payload.logs)) {
                setLogs(payload.logs.slice(0, 500));
              }
              break;
            default:
              break;
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setWsConnected(false);
        if (!backendAvailableRef.current) return;
        const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 8000);
        reconnectAttemptRef.current += 1;
        reconnectTimerRef.current = window.setTimeout(connectWs, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    void fetchInitialState().then((hasBackend) => {
      if (!disposed && hasBackend) {
        connectWs();
      }
    });

    return () => {
      disposed = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, [fetchInitialState]);

  const executeLocalSlotAction = useCallback(
    (slotId: string, endpoint: string, body?: Record<string, unknown>) => {
      const target = devicesRef.current.find((d) => d.slotId === slotId);
      if (!target) {
        const msg = `Device ${slotId} not found`;
        showFeedback('error', msg);
        return { ok: false, data: { error: msg } };
      }
      const outcome = applyVirtualSlotActionClient(target, endpoint, body);
      if (!outcome.ok) {
        showFeedback('error', outcome.error || 'Action failed');
        return { ok: false, data: { error: outcome.error } };
      }

      setDevices((prev) => prev.map((d) => (d.slotId === slotId ? outcome.device : d)));
      if (outcome.message) {
        showFeedback('success', outcome.message);
        pushClientLog('info', 'VirtualOS', outcome.message, slotId, outcome.device.name);
      }
      if (outcome.screenshot) {
        return {
          ok: true,
          data: {
            ok: true,
            device: outcome.device,
            virtualScreenshot: true,
            screenshot: outcome.screenshot,
            message: outcome.message,
          },
        };
      }
      return { ok: true, data: { ok: true, device: outcome.device, message: outcome.message } };
    },
    [pushClientLog, showFeedback]
  );

  const runSlotRequest = useCallback(
    async (
      slotId: string,
      actionLabel: string,
      endpoint: string,
      method = 'POST',
      body?: Record<string, unknown>
    ) => {
      if (!backendAvailableRef.current) {
        return executeLocalSlotAction(slotId, endpoint, body);
      }

      setBusySlots((prev) => ({ ...prev, [slotId]: actionLabel }));
      try {
        const res = await fetch(endpoint, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        });
        const ct = res.headers.get('content-type') || '';
        if (!ct.toLowerCase().includes('application/json')) {
          backendAvailableRef.current = false;
          setBackendAvailable(false);
          return executeLocalSlotAction(slotId, endpoint, body);
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          const msg = data.error || data.message || `${actionLabel} failed on Device ${slotId}`;
          showFeedback('error', msg);
          return { ok: false, data };
        }
        if (data.device) {
          setDevices((prev) =>
            prev.map((d) => (d.slotId === slotId ? data.device : d))
          );
        }
        if (data.message) {
          showFeedback('success', data.message);
        }
        return { ok: true, data };
      } catch (err) {
        if (modeRef.current === 'virtual') {
          backendAvailableRef.current = false;
          setBackendAvailable(false);
          return executeLocalSlotAction(slotId, endpoint, body);
        }
        const msg = err instanceof Error ? err.message : 'Network error reaching hardware bridge';
        showFeedback('error', msg);
        return { ok: false, data: null };
      } finally {
        setBusySlots((prev) => ({ ...prev, [slotId]: null }));
      }
    },
    [executeLocalSlotAction, showFeedback]
  );

  const scanDevices = useCallback(async () => {
    if (!backendAvailableRef.current) {
      const onlineCount = devicesRef.current.filter((d) => d.usbStatus === 'online').length;
      const msg = `${devicesRef.current.length} Virtual Android phones active (${onlineCount} online).`;
      pushClientLog('info', 'VirtualOS', msg);
      showFeedback('info', msg);
      return;
    }

    setFleetBusy('Scanning devices...');
    try {
      const res = await fetch('/api/devices/scan', { method: 'POST' });
      if (!isJsonResponse(res) && modeRef.current === 'virtual') {
        backendAvailableRef.current = false;
        setBackendAvailable(false);
        const onlineCount = devicesRef.current.filter((d) => d.usbStatus === 'online').length;
        showFeedback('info', `${devicesRef.current.length} Virtual Android phones active (${onlineCount} online).`);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data.devices)) {
        setDevices(data.devices);
      }
      if (data.diagnostics) {
        setDiagnostics(data.diagnostics);
      }
      if (!res.ok) {
        showFeedback('error', data.error || 'Device scan failed');
      } else {
        showFeedback('info', data.message || 'Device scan completed');
      }
    } catch {
      showFeedback('error', 'Failed to reach local bridge server');
    } finally {
      setFleetBusy(null);
    }
  }, [pushClientLog, showFeedback]);

  const connectDevice = useCallback(
    (slotId: string, target?: string) =>
      runSlotRequest(slotId, 'Connecting', `/api/devices/${slotId}/connect`, 'POST', {
        target: target || undefined,
      }),
    [runSlotRequest]
  );

  const pairDevice = useCallback(
    (slotId: string, pairTarget: string, pairingCode: string, connectTarget?: string) =>
      runSlotRequest(slotId, 'Pairing Wi-Fi', `/api/devices/${slotId}/pair`, 'POST', {
        pairTarget,
        pairingCode,
        connectTarget: connectTarget || undefined,
      }),
    [runSlotRequest]
  );

  const switchToWifi = useCallback(
    (slotId: string) =>
      runSlotRequest(slotId, 'Switching Wi-Fi', `/api/devices/${slotId}/tcpip`),
    [runSlotRequest]
  );

  const disconnectDevice = useCallback(
    (slotId: string) =>
      runSlotRequest(slotId, 'Disconnecting', `/api/devices/${slotId}/disconnect`),
    [runSlotRequest]
  );

  const startDevice = useCallback(
    (slotId: string) =>
      runSlotRequest(slotId, 'Starting', `/api/devices/${slotId}/start`),
    [runSlotRequest]
  );

  const stopDevice = useCallback(
    (slotId: string) =>
      runSlotRequest(slotId, 'Stopping', `/api/devices/${slotId}/stop`),
    [runSlotRequest]
  );

  const openBrowser = useCallback(
    (slotId: string) =>
      runSlotRequest(slotId, 'Opening Browser', `/api/devices/${slotId}/browser/open`),
    [runSlotRequest]
  );

  const openUrl = useCallback(
    (slotId: string, url: string) =>
      runSlotRequest(slotId, 'Loading URL', `/api/devices/${slotId}/browser/url`, 'POST', {
        url,
      }),
    [runSlotRequest]
  );

  const reloadPage = useCallback(
    (slotId: string) =>
      runSlotRequest(slotId, 'Reloading', `/api/devices/${slotId}/browser/reload`),
    [runSlotRequest]
  );

  const goBack = useCallback(
    (slotId: string) =>
      runSlotRequest(slotId, 'Back', `/api/devices/${slotId}/input/back`),
    [runSlotRequest]
  );

  const goHome = useCallback(
    (slotId: string) =>
      runSlotRequest(slotId, 'Home', `/api/devices/${slotId}/input/home`),
    [runSlotRequest]
  );

  const tapScreen = useCallback(
    (slotId: string, x: number, y: number) =>
      runSlotRequest(slotId, 'Tap', `/api/devices/${slotId}/input/tap`, 'POST', { x, y }),
    [runSlotRequest]
  );

  const swipeScreen = useCallback(
    (slotId: string, x1: number, y1: number, x2: number, y2: number) =>
      runSlotRequest(slotId, 'Swipe', `/api/devices/${slotId}/input/swipe`, 'POST', {
        x1,
        y1,
        x2,
        y2,
      }),
    [runSlotRequest]
  );

  const sendText = useCallback(
    (slotId: string, text: string) =>
      runSlotRequest(slotId, 'Typing', `/api/devices/${slotId}/input/text`, 'POST', { text }),
    [runSlotRequest]
  );

  const openVirtualApp = useCallback(
    (slotId: string, appId: VirtualAppId, webAppId?: string) =>
      runSlotRequest(slotId, 'Opening App', `/api/devices/${slotId}/app/open`, 'POST', {
        appId,
        webAppId,
      }),
    [runSlotRequest]
  );

  const installVirtualApp = useCallback(
    (slotId: string, payload: { url: string; name?: string; source?: 'chrome' | 'store'; color?: string }) =>
      runSlotRequest(slotId, 'Installing', `/api/devices/${slotId}/apps/install`, 'POST', payload),
    [runSlotRequest]
  );

  const uninstallVirtualApp = useCallback(
    (slotId: string, appId: string) =>
      runSlotRequest(slotId, 'Uninstalling', `/api/devices/${slotId}/apps/uninstall`, 'POST', { appId }),
    [runSlotRequest]
  );

  const saveVirtualNote = useCallback(
    (slotId: string, noteText: string) =>
      runSlotRequest(slotId, 'Saving Note', `/api/devices/${slotId}/notes/save`, 'POST', { noteText }),
    [runSlotRequest]
  );

  const installAppOnFleetLocal = useCallback(
    (url: string, name?: string, targetSlotIds?: string[]) => {
      const validation = validateAuthorizedUrlClient(url);
      if (!validation.valid || !validation.normalized) {
        showFeedback('error', validation.error || 'Invalid URL');
        return;
      }
      const appName = name?.trim() || deriveAppNameFromUrl(validation.normalized);
      const ids =
        targetSlotIds && targetSlotIds.length > 0
          ? targetSlotIds
          : devicesRef.current.map((d) => d.slotId);
      let count = 0;
      setDevices((prev) =>
        prev.map((d) => {
          if (ids.includes(d.slotId) && d.usbStatus === 'online') {
            count += 1;
            return installAppOnVirtualDeviceClient(d, appName, validation.normalized!, 'chrome');
          }
          return d;
        })
      );
      if (count === 0) {
        showFeedback('error', 'No online devices selected.');
      } else {
        const msg = `Installed "${appName}" on ${count} Android device(s).`;
        pushClientLog('success', 'Fleet', msg);
        showFeedback('success', msg);
      }
    },
    [pushClientLog, showFeedback]
  );

  const installAppOnFleet = useCallback(
    async (url: string, name?: string, targetSlotIds?: string[]) => {
      if (!backendAvailableRef.current) {
        installAppOnFleetLocal(url, name, targetSlotIds);
        return;
      }
      setFleetBusy('Installing app on fleet...');
      try {
        const res = await fetch('/api/fleet/install-app', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            name,
            slotIds: targetSlotIds && targetSlotIds.length > 0 ? targetSlotIds : undefined,
          }),
        });
        if (!(res.headers.get('content-type') || '').includes('application/json')) {
          backendAvailableRef.current = false;
          setBackendAvailable(false);
          installAppOnFleetLocal(url, name, targetSlotIds);
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data.devices)) setDevices(data.devices);
        if (!res.ok || data.ok === false) {
          showFeedback('error', data.error || data.message || 'Fleet install failed');
        } else {
          showFeedback('success', data.message || 'Installed app on fleet');
        }
      } catch {
        installAppOnFleetLocal(url, name, targetSlotIds);
      } finally {
        setFleetBusy(null);
      }
    },
    [installAppOnFleetLocal, showFeedback]
  );

  const setOperatingMode = useCallback(
    async (mode: 'virtual' | 'hardware') => {
      if (!backendAvailableRef.current) {
        if (mode === 'hardware') {
          showFeedback(
            'info',
            'Kali Hardware Bridge requires running locally (npm run dev). Virtual Android Fleet stays active on static hosting.'
          );
          return;
        }
        setDiagnostics((prev) => ({ ...prev, mode: 'virtual', lastSyncAt: new Date().toISOString() }));
        showFeedback('info', `Active: ${devicesRef.current.length} Interactive Virtual Android Phones`);
        return;
      }

      try {
        const res = await fetch('/api/mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        });
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data.devices)) setDevices(data.devices);
        if (data.diagnostics) setDiagnostics(data.diagnostics);
        if (data.message) showFeedback('info', data.message);
      } catch {
        showFeedback('error', 'Failed to switch mode');
      }
    },
    [showFeedback]
  );

  const takeScreenshot = useCallback(
    async (slotId: string) => {
      const result = await runSlotRequest(
        slotId,
        'Capturing',
        `/api/devices/${slotId}/screenshot`
      );
      if (result.ok && result.data?.screenshot) {
        const shot: CapturedScreenshot = { ...result.data.screenshot };
        if (result.data.virtualScreenshot && result.data.device) {
          shot.imageBase64 = renderVirtualScreenshotBase64(result.data.device as PhysicalDeviceSlot);
        }
        setScreenshots((prev) => [shot, ...prev].slice(0, 30));
        setActiveScreenshot(shot);
      }
      return result;
    },
    [runSlotRequest]
  );

  const connectAllDevicesLocal = useCallback(() => {
    const now = new Date().toISOString();
    setDevices((prev) =>
      prev.map((d) => ({
        ...d,
        usbStatus: 'online',
        active: true,
        mirrorStatus: 'streaming',
        appiumStatus: 'active',
        fps: 60,
        browserStatus: d.virtualState?.activeApp === 'chrome' ? 'Chrome Active' : 'Chrome Ready',
        currentActivity: APP_ACTIVITIES[d.virtualState?.activeApp || 'launcher'],
        lastSeenAt: now,
      }))
    );
    const msg = `Connected all ${devicesRef.current.length} Android devices.`;
    pushClientLog('success', 'Fleet', msg);
    showFeedback('success', msg);
  }, [pushClientLog, showFeedback]);

  const connectAllDevices = useCallback(async () => {
    if (!backendAvailableRef.current) {
      connectAllDevicesLocal();
      return;
    }

    setFleetBusy('Connecting all devices...');
    try {
      const res = await fetch('/api/fleet/connect-all', { method: 'POST' });
      if (!(res.headers.get('content-type') || '').includes('application/json') && modeRef.current === 'virtual') {
        backendAvailableRef.current = false;
        setBackendAvailable(false);
        connectAllDevicesLocal();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data.devices)) setDevices(data.devices);
      if (!res.ok || data.ok === false) {
        showFeedback('error', data.error || data.message || 'Connect All Devices failed');
      } else {
        showFeedback('success', data.message || 'Connect All Devices command completed');
      }
    } catch {
      if (modeRef.current === 'virtual') {
        connectAllDevicesLocal();
      } else {
        showFeedback('error', 'Failed to reach hardware bridge');
      }
    } finally {
      setFleetBusy(null);
    }
  }, [connectAllDevicesLocal, showFeedback]);

  const openUrlOnDevicesLocal = useCallback(
    (url: string, targetSlotIds?: string[]) => {
      const validation = validateAuthorizedUrlClient(url);
      if (!validation.valid || !validation.normalized) {
        showFeedback('error', validation.error || 'Invalid URL');
        return;
      }
      const ids =
        targetSlotIds && targetSlotIds.length > 0
          ? targetSlotIds
          : devicesRef.current.map((d) => d.slotId);
      let count = 0;
      setDevices((prev) =>
        prev.map((d) => {
          if (ids.includes(d.slotId) && d.usbStatus === 'online') {
            count += 1;
            return openUrlOnVirtualDeviceClient(d, validation.normalized!);
          }
          return d;
        })
      );
      if (count === 0) {
        showFeedback('error', 'No online devices selected.');
      } else {
        const msg = `Opened ${validation.normalized} across ${count} Android device(s).`;
        pushClientLog('success', 'Fleet', msg);
        showFeedback('success', msg);
      }
    },
    [pushClientLog, showFeedback]
  );

  const openUrlOnDevices = useCallback(
    async (url: string, targetSlotIds?: string[]) => {
      if (!backendAvailableRef.current) {
        openUrlOnDevicesLocal(url, targetSlotIds);
        return;
      }

      setFleetBusy('Opening URL on fleet...');
      try {
        const res = await fetch('/api/fleet/open-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            slotIds: targetSlotIds && targetSlotIds.length > 0 ? targetSlotIds : undefined,
          }),
        });
        if (!(res.headers.get('content-type') || '').includes('application/json') && modeRef.current === 'virtual') {
          backendAvailableRef.current = false;
          setBackendAvailable(false);
          openUrlOnDevicesLocal(url, targetSlotIds);
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          showFeedback('error', data.error || data.message || 'Failed to open URL on fleet');
        } else {
          showFeedback('success', data.message || `Navigated to ${url}`);
        }
      } catch {
        if (modeRef.current === 'virtual') {
          openUrlOnDevicesLocal(url, targetSlotIds);
        } else {
          showFeedback('error', 'Failed to reach hardware bridge');
        }
      } finally {
        setFleetBusy(null);
      }
    },
    [openUrlOnDevicesLocal, showFeedback]
  );

  const runFleetActionLocal = useCallback(
    (
      action: 'start' | 'stop' | 'disconnect' | 'browser' | 'home' | 'back' | 'reload' | 'screenshot',
      targetSlotIds?: string[]
    ) => {
      const ids =
        targetSlotIds && targetSlotIds.length > 0
          ? targetSlotIds
          : devicesRef.current.map((d) => d.slotId);
      const endpointMap: Record<typeof action, string> = {
        start: 'start',
        stop: 'stop',
        disconnect: 'disconnect',
        browser: 'browser/open',
        home: 'input/home',
        back: 'input/back',
        reload: 'browser/reload',
        screenshot: 'screenshot',
      };
      const suffix = endpointMap[action];
      let affected = 0;
      const newShots: CapturedScreenshot[] = [];

      setDevices((prev) =>
        prev.map((d) => {
          if (!ids.includes(d.slotId)) return d;
          const res = applyVirtualSlotActionClient(d, `/api/devices/${d.slotId}/${suffix}`);
          if (res.ok) {
            affected += 1;
            if (res.screenshot) {
              newShots.push({
                ...res.screenshot,
                imageBase64: renderVirtualScreenshotBase64(res.device),
              });
            }
          }
          return res.device;
        })
      );

      if (newShots.length > 0) {
        setScreenshots((prev) => [...newShots, ...prev].slice(0, 30));
        setActiveScreenshot(newShots[0]);
      }

      const msg = `Fleet ${action} completed on ${affected} device(s).`;
      pushClientLog('info', 'Fleet', msg);
      showFeedback('success', msg);
    },
    [pushClientLog, showFeedback]
  );

  const runFleetAction = useCallback(
    async (
      action: 'start' | 'stop' | 'disconnect' | 'browser' | 'home' | 'back' | 'reload' | 'screenshot',
      targetSlotIds?: string[]
    ) => {
      if (!backendAvailableRef.current) {
        runFleetActionLocal(action, targetSlotIds);
        return;
      }

      setFleetBusy(`Running ${action} on fleet...`);
      try {
        const res = await fetch('/api/fleet/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            slotIds: targetSlotIds && targetSlotIds.length > 0 ? targetSlotIds : undefined,
          }),
        });
        if (!(res.headers.get('content-type') || '').includes('application/json') && modeRef.current === 'virtual') {
          backendAvailableRef.current = false;
          setBackendAvailable(false);
          runFleetActionLocal(action, targetSlotIds);
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data.devices)) setDevices(data.devices);
        if (!res.ok || data.ok === false) {
          showFeedback('error', data.error || data.message || `Fleet ${action} failed`);
        } else {
          showFeedback('success', data.message || `Fleet ${action} completed`);
        }
      } catch {
        if (modeRef.current === 'virtual') {
          runFleetActionLocal(action, targetSlotIds);
        } else {
          showFeedback('error', 'Failed to reach hardware bridge');
        }
      } finally {
        setFleetBusy(null);
      }
    },
    [runFleetActionLocal, showFeedback]
  );

  const updateBridgeUrl = useCallback(
    async (pythonBridgeUrl: string) => {
      if (!backendAvailableRef.current) {
        setDiagnostics((prev) => ({ ...prev, pythonBridgeUrl }));
        showFeedback(
          'info',
          'Bridge URL saved locally. Physical Kali hardware requires running the local Node/Python server.'
        );
        return false;
      }

      try {
        const res = await fetch('/api/bridge/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pythonBridgeUrl }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.diagnostics) {
          setDiagnostics(data.diagnostics);
        }
        if (Array.isArray(data.devices)) {
          setDevices(data.devices);
        }
        if (!res.ok) {
          showFeedback('error', data.error || 'Failed to update bridge URL');
          return false;
        }
        showFeedback(
          data.diagnostics?.pythonBridgeConnected ? 'success' : 'info',
          data.message || 'Bridge configuration updated'
        );
        return true;
      } catch {
        showFeedback('error', 'Failed to update bridge URL');
        return false;
      }
    },
    [showFeedback]
  );

  const clearLogs = useCallback(async () => {
    setLogs([]);
    if (!backendAvailableRef.current) return;
    try {
      await fetch('/api/logs', { method: 'DELETE' });
    } catch {
      // Ignore
    }
  }, []);

  const setVirtualFleetCount = useCallback(
    async (count: number) => {
      const safeCount = Math.max(1, Math.min(100, Math.floor(count)));
      if (!backendAvailableRef.current) {
        setDevices((prev) => resizeVirtualDevices(prev, safeCount));
        setSelectedIds([]);
        setDiagnostics((prev) => ({ ...prev, mode: 'virtual', lastSyncAt: new Date().toISOString() }));
        const msg = `Virtual fleet updated to ${safeCount} Android phones.`;
        pushClientLog('success', 'VirtualOS', msg);
        showFeedback('success', msg);
        return;
      }

      setFleetBusy(`Scaling to ${safeCount} devices`);
      try {
        const res = await fetch('/api/virtual/count', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ count: safeCount }),
        });
        if (!(res.headers.get('content-type') || '').includes('application/json')) {
          backendAvailableRef.current = false;
          setBackendAvailable(false);
          setDevices((prev) => resizeVirtualDevices(prev, safeCount));
          setSelectedIds([]);
          showFeedback('success', `Virtual fleet updated to ${safeCount} Android phones.`);
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data.devices)) {
          setDevices(data.devices);
        }
        if (data.diagnostics) {
          setDiagnostics(data.diagnostics);
        }
        if (!res.ok) {
          showFeedback('error', data.error || 'Failed to update device count');
        } else {
          setSelectedIds([]);
          showFeedback('success', data.message || `Virtual fleet scaled to ${safeCount} devices`);
        }
      } catch {
        setDevices((prev) => resizeVirtualDevices(prev, safeCount));
        setSelectedIds([]);
        showFeedback('success', `Virtual fleet updated to ${safeCount} Android phones.`);
      } finally {
        setFleetBusy(null);
      }
    },
    [pushClientLog, showFeedback]
  );

  const stopDeviceBot = useCallback((slotId: string) => {
    const timer = botTimersRef.current[slotId];
    if (timer) {
      window.clearInterval(timer);
      delete botTimersRef.current[slotId];
    }
    delete botCountersRef.current[slotId];
    setBotRunningSlots((prev) => {
      if (!prev[slotId]) return prev;
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
  }, []);

  const runBotStep = useCallback(
    (slotId: string) => {
      const counter = botCountersRef.current[slotId] || { step: 0, runs: 1 };
      const idx = counter.step % QA_REAL_STEPS.length;
      const stepDef = QA_REAL_STEPS[idx];

      setBotRunningSlots((prev) => ({
        ...prev,
        [slotId]: {
          step: idx + 1,
          runs: counter.runs,
          status: stepDef.label,
        },
      }));

      if (stepDef.action === 'open') {
        if (backendAvailableRef.current) {
          void fetch(`/api/devices/${slotId}/browser/url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: REAL_QA_TARGET_URL }),
          }).catch(() => {});
        } else {
          setDevices((prev) =>
            prev.map((d) =>
              d.slotId === slotId ? openUrlOnVirtualDeviceClient(d, REAL_QA_TARGET_URL) : d
            )
          );
        }
      } else if (stepDef.action === 'reload') {
        if (backendAvailableRef.current) {
          void fetch(`/api/devices/${slotId}/browser/reload`, { method: 'POST' }).catch(() => {});
        } else {
          setDevices((prev) =>
            prev.map((d) =>
              d.slotId === slotId && d.currentUrl
                ? openUrlOnVirtualDeviceClient(d, d.currentUrl)
                : d
            )
          );
        }
      }

      const nextStep = counter.step + 1;
      const nextRuns = nextStep % QA_REAL_STEPS.length === 0 ? counter.runs + 1 : counter.runs;
      botCountersRef.current[slotId] = { step: nextStep, runs: nextRuns };
    },
    []
  );

  const startDeviceBot = useCallback(
    (slotId: string) => {
      if (botTimersRef.current[slotId]) return;
      botCountersRef.current[slotId] = { step: 0, runs: 1 };
      runBotStep(slotId);

      botTimersRef.current[slotId] = window.setInterval(() => {
        runBotStep(slotId);
      }, 3000);
    },
    [runBotStep]
  );

  const toggleDeviceBot = useCallback(
    (slotId: string) => {
      if (botTimersRef.current[slotId]) {
        stopDeviceBot(slotId);
        showFeedback('info', `Stopped QA Real Bot on Device ${slotId}`);
      } else {
        startDeviceBot(slotId);
        showFeedback('success', `Started QA Real Bot on Device ${slotId} (3s cycle)`);
      }
    },
    [startDeviceBot, stopDeviceBot, showFeedback]
  );

  const startAllBots = useCallback(
    (slotIds?: string[]) => {
      const targets =
        slotIds && slotIds.length > 0
          ? devices.filter((d) => slotIds.includes(d.slotId) && d.usbStatus === 'online')
          : devices.filter((d) => d.usbStatus === 'online');
      targets.forEach((dev, index) => {
        window.setTimeout(() => {
          startDeviceBot(dev.slotId);
        }, index * 120);
      });
      showFeedback('success', `Started QA Real Bot on ${targets.length} online phone(s)`);
    },
    [devices, startDeviceBot, showFeedback]
  );

  const stopAllBots = useCallback(() => {
    Object.keys(botTimersRef.current).forEach((slotId) => {
      window.clearInterval(botTimersRef.current[slotId]);
      delete botTimersRef.current[slotId];
    });
    botCountersRef.current = {};
    setBotRunningSlots({});
    showFeedback('info', 'Stopped QA Real Bot on all devices');
  }, [showFeedback]);

  useEffect(() => {
    return () => {
      Object.values(botTimersRef.current).forEach((id) => window.clearInterval(id));
      botTimersRef.current = {};
    };
  }, []);

  const toggleSelectSlot = useCallback((slotId: string) => {
    setSelectedIds((prev) =>
      prev.includes(slotId) ? prev.filter((id) => id !== slotId) : [...prev, slotId]
    );
  }, []);

  const selectAllOnline = useCallback(() => {
    const online = devices.filter((d) => d.usbStatus === 'online').map((d) => d.slotId);
    setSelectedIds(online);
  }, [devices]);

  const selectAllSlots = useCallback(() => {
    setSelectedIds(devices.map((d) => d.slotId));
  }, [devices]);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const stats = useMemo(() => {
    const onlineCount = devices.filter((d) => d.usbStatus === 'online').length;
    const offlineCount = devices.filter((d) => d.usbStatus !== 'online').length;
    const mirroringCount = devices.filter((d) => d.mirrorStatus === 'streaming').length;
    const appiumCount = devices.filter((d) => d.appiumStatus === 'active').length;
    return {
      total: devices.length,
      onlineCount,
      offlineCount,
      mirroringCount,
      appiumCount,
    };
  }, [devices]);

  return {
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
    switchToWifi,
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
    installVirtualApp,
    uninstallVirtualApp,
    saveVirtualNote,
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
    selectAllSlots,
    clearSelection,
  };
}
