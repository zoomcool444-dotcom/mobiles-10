import { RefreshCw } from 'lucide-react';
import { DeviceFilter, WorkspaceView } from '../types/device';

interface TopBarProps {
  activeView: WorkspaceView;
  filter: DeviceFilter;
  onFilterChange: (filter: DeviceFilter) => void;
  onScanDevices: () => void;
  scanning: boolean;
}

const VIEW_LABELS: Record<WorkspaceView, string> = {
  rack: 'Kali Host / 10-Device Wireless Rack',
  matrix: 'Kali Host / Live Screen Matrix',
  logs: 'Kali Host / Device Connection Logs',
  setup: 'Kali Host / Hardware Bridge Setup',
};

export function TopBar({
  activeView,
  filter,
  onFilterChange,
  onScanDevices,
  scanning,
}: TopBarProps) {
  const filterLinks: { id: DeviceFilter; label: string }[] = [
    { id: 'all', label: 'All Slots' },
    { id: 'online', label: 'Online' },
    { id: 'offline', label: 'Offline' },
    { id: 'mirroring', label: 'Mirroring' },
  ];

  return (
    <header className="h-14 sm:h-16 px-3 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3 sm:gap-8 shrink-0">
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-xs sm:text-base font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap truncate">
          {VIEW_LABELS[activeView]}
        </h1>
      </div>

      <nav
        className="hidden md:flex items-center gap-6 text-sm font-medium"
        aria-label="Device Slot Filters"
      >
        {filterLinks.map((item) => {
          const active = filter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onFilterChange(item.id)}
              className={`whitespace-nowrap shrink-0 pb-0.5 border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                active
                  ? 'border-blue-600 text-slate-900 dark:text-slate-100'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="shrink-0">
        <button
          type="button"
          onClick={onScanDevices}
          disabled={scanning}
          className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
          <span>{scanning ? 'Scanning...' : 'Scan Devices'}</span>
        </button>
      </div>
    </header>
  );
}
