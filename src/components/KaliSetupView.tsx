import { useState, FormEvent } from 'react';
import { Check, Copy, Layers, Server, ShieldAlert, Terminal } from 'lucide-react';
import { BridgeDiagnostics } from '../types/device';

interface KaliSetupViewProps {
  diagnostics: BridgeDiagnostics;
  deviceCount: number;
  onUpdateBridgeUrl: (url: string) => Promise<boolean>;
  onScanDevices: () => void;
  onSetMode: (mode: 'virtual' | 'hardware') => Promise<void>;
  onSetVirtualFleetCount: (count: number) => Promise<void>;
}

const FLEET_PRESETS = [10, 20, 30, 40, 50, 100];

export function KaliSetupView({
  diagnostics,
  deviceCount,
  onUpdateBridgeUrl,
  onScanDevices,
  onSetMode,
  onSetVirtualFleetCount,
}: KaliSetupViewProps) {
  const [bridgeUrl, setBridgeUrl] = useState(diagnostics.pythonBridgeUrl);
  const [customCount, setCustomCount] = useState(String(deviceCount));
  const [scaling, setScaling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const setupCommands = `# 1. Install ADB, scrcpy, Appium, and Python dependencies on Kali Linux
chmod +x backend/setup_kali.sh
./backend/setup_kali.sh

# 2. Start the Python Flask + ADB + scrcpy + Appium hardware service
source backend/.venv/bin/activate
python3 backend/app.py

# 3. Verify connected physical Android smartphones
adb devices -l`;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!bridgeUrl.trim()) return;
    setSaving(true);
    await onUpdateBridgeUrl(bridgeUrl.trim());
    setSaving(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(setupCommands);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failure in restricted context
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Operating Mode Switcher */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Device Fleet Operating Mode
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Run 10 built-in interactive virtual Android phones right in the console, or connect to
            physical devices via the Kali Linux Python Flask service.
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0">
          <button
            type="button"
            onClick={() => onSetMode('virtual')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors ${
              diagnostics.mode === 'virtual'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            Virtual Android Fleet ({deviceCount})
          </button>
          <button
            type="button"
            onClick={() => onSetMode('hardware')}
            className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors ${
              diagnostics.mode === 'hardware'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            Kali Hardware Bridge
          </button>
        </div>
      </section>

      {/* Virtual Fleet Size Scaling (10, 20, 30, 40, 50, 100) */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>Virtual Mobile Fleet Capacity (1 – 100 Phones)</span>
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              Scale your virtual Android fleet up to 100 phones — all selected phones open directly
              on the dashboard with lazy iframe loading for smooth scrolling.
            </p>
          </div>
          <span className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-400 tabular-nums">
            Active: {deviceCount} Phones
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {FLEET_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={scaling}
              onClick={async () => {
                setScaling(true);
                setCustomCount(String(preset));
                await onSetVirtualFleetCount(preset);
                setScaling(false);
              }}
              className={`px-4 py-2 rounded-lg text-xs font-semibold font-mono tabular-nums border transition-colors disabled:opacity-50 ${
                deviceCount === preset
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {preset} Mobiles
            </button>
          ))}
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const parsed = Number(customCount);
            if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) return;
            setScaling(true);
            await onSetVirtualFleetCount(Math.floor(parsed));
            setScaling(false);
          }}
          className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800"
        >
          <label htmlFor="custom-fleet-count" className="text-xs text-slate-600 dark:text-slate-400">
            Custom count (1–100):
          </label>
          <input
            id="custom-fleet-count"
            type="number"
            min={1}
            max={100}
            value={customCount}
            onChange={(e) => setCustomCount(e.target.value)}
            className="w-24 px-3 py-1.5 text-xs font-mono tabular-nums rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
          <button
            type="submit"
            disabled={scaling}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-50"
          >
            {scaling ? 'Applying...' : 'Apply Count'}
          </button>
        </form>
      </section>

      {/* Bridge Configuration */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Kali Linux Python Flask Hardware Bridge
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Point this dashboard to the Python Flask service managing your 10 physical Android
              smartphones over Wi-Fi ADB, scrcpy, and Appium.
            </p>
          </div>
          <span
            className={`text-xs font-medium whitespace-nowrap ${
              diagnostics.pythonBridgeConnected
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-amber-700 dark:text-amber-400'
            }`}
          >
            {diagnostics.pythonBridgeConnected ? 'Bridge Online' : 'Bridge Offline'}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Server className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="url"
              value={bridgeUrl}
              onChange={(e) => setBridgeUrl(e.target.value)}
              placeholder="http://127.0.0.1:5000"
              aria-label="Python Flask Bridge URL"
              className="w-full pl-9 pr-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 whitespace-nowrap"
          >
            {saving ? 'Connecting...' : 'Save & Connect'}
          </button>
          <button
            type="button"
            onClick={onScanDevices}
            className="px-4 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            Re-probe Host
          </button>
        </form>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Python Service</dt>
            <dd className="font-mono font-medium text-slate-900 dark:text-slate-100 mt-0.5">
              {diagnostics.pythonBridgeConnected ? 'Connected' : 'Unreachable'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">ADB Binary</dt>
            <dd className="font-mono font-medium text-slate-900 dark:text-slate-100 mt-0.5">
              {diagnostics.localAdbAvailable ? 'Available' : 'Not detected'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">scrcpy Binary</dt>
            <dd className="font-mono font-medium text-slate-900 dark:text-slate-100 mt-0.5">
              {diagnostics.scrcpyAvailable ? 'Available' : 'Not detected'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Appium Server</dt>
            <dd className="font-mono font-medium text-slate-900 dark:text-slate-100 mt-0.5">
              {diagnostics.appiumAvailable ? 'Available' : 'Not detected'}
            </dd>
          </div>
        </dl>

        {diagnostics.lastError && (
          <p className="text-xs font-mono text-amber-700 dark:text-amber-400 pt-1">
            Last probe detail: {diagnostics.lastError}
          </p>
        )}
      </section>

      {/* Kali Linux Terminal Setup */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-slate-500" />
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Kali Linux Hardware Service Setup
            </h3>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy Commands'}</span>
          </button>
        </div>

        <pre className="p-4 rounded-lg bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto leading-relaxed">
          {setupCommands}
        </pre>

        <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5 pt-2 list-disc list-inside">
          <li>
            <span className="font-medium text-slate-800 dark:text-slate-200">Wireless Wi-Fi Mode (No Cable):</span> Enable <span className="font-medium text-slate-800 dark:text-slate-200">Developer Options → Wireless Debugging</span> on each Android phone on the same Wi-Fi network.
          </li>
          <li>
            Click <span className="font-medium text-slate-800 dark:text-slate-200">Connect</span> or <span className="font-medium text-slate-800 dark:text-slate-200">Live Screen</span> on any device card to pair via IP:Port and 6-digit pairing code without a cable.
          </li>
          <li>
            Connected devices are automatically assigned persistent slots{' '}
            <span className="font-mono">Device 01</span> through <span className="font-mono">Device 10</span> in{' '}
            <span className="font-mono">backend/device_slots.json</span>.
          </li>
        </ul>
      </section>

      {/* Authorized Automation Policy */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-slate-700 dark:text-slate-300 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Authorized Automation Guardrails
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            This hardware farm is built exclusively for authorized web application testing, QA
            verification, and legitimate account workflows. Both the Node bridge and Python Flask
            backend enforce workflow URL validation and block automated ad clicks, fraudulent view
            inflation, or reward-collection schemes.
          </p>
        </div>
      </section>
    </div>
  );
}
