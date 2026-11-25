import { Download } from 'lucide-react';
import { WorkbenchTab } from '../types';

interface TopBarProps {
  activeTab: WorkbenchTab;
  onSelectTab: (tab: WorkbenchTab) => void;
}

const NAV_ITEMS: Array<{ id: WorkbenchTab; label: string }> = [
  { id: 'runner', label: 'Runner' },
  { id: 'sandbox', label: 'Demo Sandbox' },
  { id: 'source', label: 'Python Source' },
  { id: 'setup', label: 'Setup Guide' },
];

export function TopBar({ activeTab, onSelectTab }: TopBarProps) {
  return (
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
        <a
          href="#runner"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('runner');
          }}
          className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
        >
          UNIVERSAL TASK BOT
        </a>

        <nav className="flex items-center gap-6 overflow-x-auto" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`py-2 text-sm font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  isActive
                    ? 'border-blue-600 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="shrink-0">
          <a
            href="/api/download/universal_task_bot.py"
            download="universal_task_bot.py"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Download .py</span>
          </a>
        </div>
      </div>
    </header>
  );
}
