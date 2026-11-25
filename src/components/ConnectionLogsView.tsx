import { useMemo, useState } from 'react';
import { Search, Trash2 } from 'lucide-react';
import { ConnectionLogEntry, LogLevel } from '../types/device';

interface ConnectionLogsViewProps {
  logs: ConnectionLogEntry[];
  onClearLogs: () => void;
}

export function ConnectionLogsView({ logs, onClearLogs }: ConnectionLogsViewProps) {
  const [levelFilter, setLevelFilter] = useState<'all' | LogLevel>('all');
  const [search, setSearch] = useState('');

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((entry) => {
      if (levelFilter !== 'all' && entry.level !== levelFilter) return false;
      if (!q) return true;
      return (
        entry.message.toLowerCase().includes(q) ||
        entry.source.toLowerCase().includes(q) ||
        (entry.deviceName || '').toLowerCase().includes(q)
      );
    });
  }, [logs, levelFilter, search]);

  const levelColor = (level: LogLevel) => {
    switch (level) {
      case 'success':
        return 'text-emerald-700 dark:text-emerald-400';
      case 'warn':
        return 'text-amber-700 dark:text-amber-400';
      case 'error':
        return 'text-rose-700 dark:text-rose-400';
      default:
        return 'text-slate-600 dark:text-slate-400';
    }
  };

  return (
    <section
      aria-label="Device Connection Logs"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col"
    >
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          {(['all', 'info', 'success', 'warn', 'error'] as const).map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => setLevelFilter(lvl)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                levelFilter === lvl
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-1 sm:flex-initial">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter logs by device or message..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <button
            type="button"
            onClick={onClearLogs}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {filteredLogs.length === 0 ? (
        <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
          No connection logs match the current filter.
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[620px] overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-2.5 px-4 whitespace-nowrap">Timestamp</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Source</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Device</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Level</th>
                <th className="py-2.5 px-4">Event</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {filteredLogs.map((entry) => (
                <tr
                  key={entry.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {entry.source}
                  </td>
                  <td className="py-2.5 px-3 text-slate-900 dark:text-slate-100 whitespace-nowrap font-medium">
                    {entry.deviceName || 'Fleet'}
                  </td>
                  <td className={`py-2.5 px-3 font-medium capitalize whitespace-nowrap ${levelColor(entry.level)}`}>
                    {entry.level}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                    {entry.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
