import { useState } from 'react';
import { Check, Copy, Download, ExternalLink } from 'lucide-react';

export function SandboxView() {
  const [taskCount, setTaskCount] = useState<number>(5);
  const [copied, setCopied] = useState<boolean>(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const sandboxUrl = taskCount === 5 ? `${origin}/demo-sandbox` : `${origin}/demo-sandbox?tasks=${taskCount}`;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(sandboxUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard fallback ignored if blocked by permissions
    }
  };

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Authorized Demo Task Sandbox</h1>
          <p className="text-sm text-slate-600 mt-1">
            Point your local Python Selenium script directly at this URL to test live Chrome automation against simulated tasks and demo advertisements.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-md">
            {[4, 5, 8].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTaskCount(n)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded tabular-nums cursor-pointer transition-colors ${
                  taskCount === n ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {n} Tasks
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleCopyUrl}
            className="h-9 px-3.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied URL' : 'Copy URL'}</span>
          </button>

          <a
            href="/api/download/demo_sandbox.html"
            download="demo_sandbox.html"
            className="h-9 px-3.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download HTML</span>
          </a>

          <a
            href={sandboxUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 px-3.5 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open Standalone</span>
          </a>
        </div>
      </section>

      {/* Selector Contract Reference */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-700">Selenium Selector Contract</h2>
          <span className="text-xs font-mono text-slate-500">{sandboxUrl}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="py-2.5 px-5 font-semibold">Workflow Step</th>
                <th className="py-2.5 px-5 font-semibold">Primary CSS Selector</th>
                <th className="py-2.5 px-5 font-semibold">Fallback Text Match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              <tr className="h-10 hover:bg-slate-50/70">
                <td className="px-5 font-medium text-slate-900">Detect Demo Task Buttons</td>
                <td className="px-5 font-mono text-blue-700">[data-demo-task]:not([data-completed=&apos;true&apos;])</td>
                <td className="px-5 font-mono text-slate-600">&quot;Start Task&quot;, &quot;Open Task&quot;, &quot;Demo Task&quot;</td>
              </tr>
              <tr className="h-10 hover:bg-slate-50/70">
                <td className="px-5 font-medium text-slate-900">Click Simulated Watch Ad</td>
                <td className="px-5 font-mono text-blue-700">[data-watch-ad]:not([disabled])</td>
                <td className="px-5 font-mono text-slate-600">&quot;Watch Ad&quot;, &quot;View Demo Ad&quot;</td>
              </tr>
              <tr className="h-10 hover:bg-slate-50/70">
                <td className="px-5 font-medium text-slate-900">Close Simulated Ad & Return</td>
                <td className="px-5 font-mono text-blue-700">[data-close-ad]:not([disabled])</td>
                <td className="px-5 font-mono text-slate-600">&quot;Close Ad&quot;, &quot;Return to Tasks&quot;, &quot;Close&quot;</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Embedded Live Demo Sandbox */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
          Live Preview Frame (/demo-sandbox)
        </div>
        <iframe
          key={sandboxUrl}
          src={sandboxUrl}
          title="Authorized Demo Task Sandbox"
          className="w-full h-[640px] border-0 bg-slate-50"
        />
      </section>
    </div>
  );
}
