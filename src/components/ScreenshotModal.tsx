import { Download, X } from 'lucide-react';
import { CapturedScreenshot } from '../types/device';

interface ScreenshotModalProps {
  screenshot: CapturedScreenshot;
  onClose: () => void;
}

export function ScreenshotModal({ screenshot, onClose }: ScreenshotModalProps) {
  const filename = `${screenshot.deviceName.toLowerCase().replace(/\s+/g, '-')}-${screenshot.capturedAt.replace(/[:.]/g, '-')}.png`;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Screenshot from ${screenshot.deviceName}`}
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {screenshot.deviceName} Screenshot
            </h2>
            <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              {screenshot.resolution} · {new Date(screenshot.capturedAt).toLocaleTimeString()}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close screenshot preview"
            className="w-8 h-8 rounded-md border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 bg-slate-950 flex items-center justify-center max-h-[65vh] overflow-hidden">
          <img
            src={`data:image/png;base64,${screenshot.imageBase64}`}
            alt={`Captured screenshot from ${screenshot.deviceName}`}
            className="max-h-[60vh] w-auto rounded border border-slate-800"
          />
        </div>

        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Close
          </button>
          <a
            href={`data:image/png;base64,${screenshot.imageBase64}`}
            download={filename}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download PNG</span>
          </a>
        </div>
      </div>
    </div>
  );
}
