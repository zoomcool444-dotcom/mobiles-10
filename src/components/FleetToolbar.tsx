import { useState, FormEvent } from 'react';
import {
  Bot,
  CheckSquare,
  Download,
  Globe,
  Home,
  PlugZap,
  Play,
  Square,
  Camera,
  X,
} from 'lucide-react';

interface FleetToolbarProps {
  selectedIds: string[];
  onlineCount: number;
  fleetBusy: string | null;
  isVirtualMode?: boolean;
  activeBotCount?: number;
  onSelectAllOnline: () => void;
  onClearSelection: () => void;
  onConnectAll: () => void;
  onOpenUrlFleet: (url: string, slotIds?: string[]) => void;
  onInstallAppFleet?: (url: string, name?: string, slotIds?: string[]) => void;
  onStartAllBots?: (slotIds?: string[]) => void;
  onStopAllBots?: () => void;
  onFleetAction: (
    action: 'start' | 'stop' | 'disconnect' | 'browser' | 'home' | 'back' | 'reload' | 'screenshot',
    slotIds?: string[]
  ) => void;
}

export function FleetToolbar({
  selectedIds,
  onlineCount,
  fleetBusy,
  isVirtualMode = false,
  activeBotCount = 0,
  onSelectAllOnline,
  onClearSelection,
  onConnectAll,
  onOpenUrlFleet,
  onInstallAppFleet,
  onStartAllBots,
  onStopAllBots,
  onFleetAction,
}: FleetToolbarProps) {
  const [urlInput, setUrlInput] = useState('https://example.com');

  const handleSubmitUrl = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    onOpenUrlFleet(trimmed, selectedIds.length > 0 ? selectedIds : undefined);
  };

  const targetLabel =
    selectedIds.length > 0 ? `${selectedIds.length} Selected` : 'All Online Devices';

  return (
    <section
      aria-label="Multi-Device Fleet Controls"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onConnectAll}
            disabled={Boolean(fleetBusy)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <PlugZap className="w-3.5 h-3.5" />
            <span>Connect All Devices</span>
          </button>

          <button
            type="button"
            onClick={onSelectAllOnline}
            disabled={onlineCount === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>Select Online ({onlineCount})</span>
          </button>

          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={onClearSelection}
              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear ({selectedIds.length})</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              onFleetAction('start', selectedIds.length > 0 ? selectedIds : undefined)
            }
            disabled={Boolean(fleetBusy) || onlineCount === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Start ({targetLabel})</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onFleetAction('stop', selectedIds.length > 0 ? selectedIds : undefined)
            }
            disabled={Boolean(fleetBusy) || onlineCount === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            <Square className="w-3.5 h-3.5" />
            <span>Stop</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onFleetAction('home', selectedIds.length > 0 ? selectedIds : undefined)
            }
            disabled={Boolean(fleetBusy) || onlineCount === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Go Home</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onFleetAction('screenshot', selectedIds.length > 0 ? selectedIds : undefined)
            }
            disabled={Boolean(fleetBusy) || onlineCount === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Screenshot</span>
          </button>

          {onStartAllBots && (
            activeBotCount > 0 && onStopAllBots ? (
              <button
                type="button"
                onClick={onStopAllBots}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white transition-colors whitespace-nowrap shrink-0"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Stop Real Bots ({activeBotCount})</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  onStartAllBots(selectedIds.length > 0 ? selectedIds : undefined)
                }
                disabled={onlineCount === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
              >
                <Bot className="w-3.5 h-3.5" />
                <span>
                  {selectedIds.length > 0
                    ? `Real Bot (${selectedIds.length})`
                    : 'Start Real Bot All'}
                </span>
              </button>
            )
          )}
        </div>
      </div>

      <form
        onSubmit={handleSubmitUrl}
        className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
      >
        <label htmlFor="fleet-url-input" className="sr-only">
          Authorized Test URL for Fleet
        </label>
        <div className="relative flex-1">
          <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="fleet-url-input"
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Search or URL (e.g. wikipedia.org or app.apk)"
            className="w-full pl-9 pr-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <button
          type="submit"
          disabled={Boolean(fleetBusy)}
          className="px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
        >
          {selectedIds.length > 0
            ? `Open URL on ${selectedIds.length} Selected`
            : 'Open URL on All Devices'}
        </button>
        {isVirtualMode && onInstallAppFleet && (
          <button
            type="button"
            disabled={Boolean(fleetBusy) || !urlInput.trim()}
            onClick={() => {
              const trimmed = urlInput.trim();
              if (!trimmed) return;
              onInstallAppFleet(trimmed, undefined, selectedIds.length > 0 ? selectedIds : undefined);
            }}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium border border-emerald-200 dark:border-emerald-900/70 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>
              {selectedIds.length > 0
                ? `Install on ${selectedIds.length} Selected`
                : 'Install App on All'}
            </span>
          </button>
        )}
      </form>
    </section>
  );
}
