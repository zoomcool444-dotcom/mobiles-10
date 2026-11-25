import {
  Grid,
  MonitorPlay,
  ScrollText,
  Server,
  ShieldCheck,
  Sun,
  Moon,
  Wifi,
  Radio,
} from 'lucide-react';
import { BridgeDiagnostics, WorkspaceView } from '../types/device';

interface SidebarProps {
  activeView: WorkspaceView;
  onSelectView: (view: WorkspaceView) => void;
  stats: {
    total: number;
    onlineCount: number;
    offlineCount: number;
    mirroringCount: number;
    appiumCount: number;
  };
  diagnostics: BridgeDiagnostics;
  backendAvailable?: boolean;
  wsConnected: boolean;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  logCount: number;
}

export function Sidebar({
  activeView,
  onSelectView,
  stats,
  diagnostics,
  backendAvailable = false,
  wsConnected,
  darkMode,
  onToggleDarkMode,
  logCount,
}: SidebarProps) {
  const navItems: {
    id: WorkspaceView;
    label: string;
    icon: typeof Grid;
    meta?: string;
  }[] = [
    {
      id: 'rack',
      label: 'Device Rack',
      icon: Grid,
      meta: `${stats.onlineCount}/${stats.total}`,
    },
    {
      id: 'matrix',
      label: 'Live Matrix',
      icon: MonitorPlay,
      meta: `${stats.mirroringCount} live`,
    },
    {
      id: 'logs',
      label: 'Connection Logs',
      icon: ScrollText,
      meta: `${logCount}`,
    },
    {
      id: 'setup',
      label: 'Kali Host Setup',
      icon: Server,
      meta: diagnostics.pythonBridgeConnected ? 'Ready' : 'Offline',
    },
  ];

  return (
    <aside className="w-full lg:w-52 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between">
      <div>
        <div className="h-16 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 flex items-center justify-center shrink-0">
              <Wifi className="w-4 h-4" />
            </div>
            <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap truncate">
              Android Rack 10
            </span>
          </div>
          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-9 h-9 rounded-md border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

        <nav className="p-3 space-y-1" aria-label="Primary Workspace">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectView(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  isActive
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.meta && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      isActive
                        ? 'text-slate-300 dark:text-slate-600'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {item.meta}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Hardware Telemetry
          </div>
          <dl className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Devices Online</dt>
              <dd className="font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
                {stats.onlineCount} / {stats.total}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">scrcpy Streams</dt>
              <dd className="font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
                {stats.mirroringCount}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400">Appium Sessions</dt>
              <dd className="font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100">
                {stats.appiumCount}
              </dd>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
              <dt className="text-slate-500 dark:text-slate-400">Fleet Mode</dt>
              <dd
                className={`font-medium ${
                  diagnostics.mode === 'virtual' || diagnostics.pythonBridgeConnected
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-amber-700 dark:text-amber-400'
                }`}
              >
                {diagnostics.mode === 'virtual'
                  ? `Virtual (${stats.total})`
                  : diagnostics.pythonBridgeConnected
                  ? 'Hardware Ready'
                  : 'Bridge Offline'}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5" />
                <span>Runtime</span>
              </dt>
              <dd
                className={`font-medium ${
                  wsConnected || (diagnostics.mode === 'virtual' && !backendAvailable)
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                {wsConnected
                  ? 'Live Socket'
                  : diagnostics.mode === 'virtual' && !backendAvailable
                  ? 'Cloud Virtual'
                  : 'Reconnecting'}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
        <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>Authorized Testing Only</span>
        </div>
        <p className="leading-relaxed">
          Automation is restricted to authorized QA testing and legitimate workflows. Ad-fraud or
          reward automation is blocked.
        </p>
      </div>
    </aside>
  );
}
