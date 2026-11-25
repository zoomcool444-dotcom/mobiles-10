import { useEffect, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';

interface PythonFilesPayload {
  botSource: string;
  requirements: string;
  botConfig: string;
}

export function PythonSourceView() {
  const [files, setFiles] = useState<PythonFilesPayload | null>(null);
  const [activeFile, setActiveFile] = useState<'bot' | 'req' | 'cfg'>('bot');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    fetch('/api/python-source')
      .then(async (res) => {
        if (!res.ok) throw new Error('Unable to load Python source code.');
        return res.json();
      })
      .then((data: PythonFilesPayload) => {
        if (active) {
          setFiles(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load source.');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const currentCode =
    activeFile === 'bot'
      ? files?.botSource ?? ''
      : activeFile === 'req'
      ? files?.requirements ?? ''
      : files?.botConfig ?? '';
  const currentFilename =
    activeFile === 'bot'
      ? 'universal_task_bot.py'
      : activeFile === 'req'
      ? 'requirements.txt'
      : 'bot_config.json';

  const handleCopy = async () => {
    if (!currentCode) return;
    try {
      await navigator.clipboard.writeText(currentCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable
    }
  };

  return (
    <div className="space-y-4">
      <section className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Complete Python Selenium Source Code</h1>
          <p className="text-sm text-slate-600 mt-1">
            Full desktop Tkinter + Selenium 4 Chrome automation application with thread-safe Stop control, configurable ad wait timer, and guaranteed browser shutdown.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            disabled={!currentCode}
            className="h-9 px-3.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied Code' : 'Copy Code'}</span>
          </button>
          <a
            href={`/api/download/${currentFilename}`}
            download={currentFilename}
            className="h-9 px-3.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download {currentFilename}</span>
          </a>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="inline-flex items-center bg-slate-200/70 p-0.5 rounded-md">
            <button
              type="button"
              onClick={() => setActiveFile('bot')}
              className={`px-3 py-1 text-xs font-mono font-medium rounded transition-colors cursor-pointer ${
                activeFile === 'bot' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              universal_task_bot.py
            </button>
            <button
              type="button"
              onClick={() => setActiveFile('req')}
              className={`px-3 py-1 text-xs font-mono font-medium rounded transition-colors cursor-pointer ${
                activeFile === 'req' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              requirements.txt
            </button>
            <button
              type="button"
              onClick={() => setActiveFile('cfg')}
              className={`px-3 py-1 text-xs font-mono font-medium rounded transition-colors cursor-pointer ${
                activeFile === 'cfg' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              bot_config.json
            </button>
          </div>
          {files && (
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {currentCode.split('\n').length} lines
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-6 space-y-2.5 bg-slate-950">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-4 bg-slate-800/80 rounded w-3/4" />
            ))}
          </div>
        ) : error ? (
          <div className="p-6 text-sm text-red-700 bg-red-50">{error}</div>
        ) : (
          <pre className="p-5 bg-slate-950 text-slate-100 text-xs font-mono leading-relaxed overflow-x-auto max-h-[680px]">
            <code>{currentCode}</code>
          </pre>
        )}
      </section>
    </div>
  );
}
