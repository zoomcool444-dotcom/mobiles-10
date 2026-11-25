import { useState } from 'react';
import { Check, Copy, Download, ShieldCheck } from 'lucide-react';

function CommandBlock({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard ignored
    }
  };

  return (
    <div className="border border-slate-200 rounded-md overflow-hidden">
      <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-700">{label}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-xs font-medium text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3.5 bg-slate-950 text-slate-100 text-xs font-mono overflow-x-auto">
        <code>{command}</code>
      </pre>
    </div>
  );
}

export function SetupGuideView() {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  return (
    <div className="space-y-6 max-w-4xl">
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <h1 className="text-lg font-bold text-slate-900">Setup & Execution Instructions</h1>
        <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
          Follow these steps to run the desktop Python Selenium application locally with Google Chrome and test it against the built-in Authorized Demo Sandbox or your own staging website.
        </p>

        <div className="mt-6 space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 mb-2">
              01. Verify Prerequisites
            </h2>
            <ul className="text-sm text-slate-600 space-y-1.5 list-disc pl-5">
              <li>Python 3.10 or newer with Tkinter included (standard on Windows and macOS Python installers; on Ubuntu/Debian run <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">sudo apt install python3-tk</code>).</li>
              <li>Google Chrome installed on your workstation. Selenium 4.20+ uses Selenium Manager to download the matching ChromeDriver automatically.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-semibold text-slate-900 mb-2">
              02. Download Project Files
            </h2>
            <p className="text-sm text-slate-600 mb-3">
              Save both files into a dedicated project folder on your machine:
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="/api/download/universal_task_bot.py"
                download="universal_task_bot.py"
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 inline-flex items-center gap-2"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download universal_task_bot.py</span>
              </a>
              <a
                href="/api/download/requirements.txt"
                download="requirements.txt"
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 inline-flex items-center gap-2"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download requirements.txt</span>
              </a>
              <a
                href="/api/download/bot_config.json"
                download="bot_config.json"
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 inline-flex items-center gap-2"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download bot_config.json</span>
              </a>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">
              03. Create a Virtual Environment & Install Selenium
            </h2>
            <CommandBlock
              label="macOS / Linux"
              command={`python3 -m venv .venv\nsource .venv/bin/activate\npip install -r requirements.txt`}
            />
            <CommandBlock
              label="Windows (PowerShell)"
              command={`python -m venv .venv\n.venv\\Scripts\\Activate.ps1\npip install -r requirements.txt`}
            />
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">
              04. Run Against Any Authorized Website or Local HTML File
            </h2>
            <CommandBlock
              label="Launch Desktop GUI (or pass --url and --autostart)"
              command={`python universal_task_bot.py\n# Or launch Chrome directly on an authorized demo URL:\npython universal_task_bot.py --url "${origin}/demo-sandbox" --wait 3.0 --autostart`}
            />
            <p className="text-sm text-slate-600 leading-relaxed">
              Click <strong>Browse HTML...</strong> inside the desktop GUI to pick a local <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">.html</code> file (<code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">file://</code>), or paste any authorized <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">https://</code> demo URL. If your target website uses custom class names or attributes, enter them in the <strong>Optional Custom Selectors</strong> row and click <strong>Start</strong>.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Error Handling, Safe Shutdown & Ethical Scope</h2>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
              The Python engine wraps all WebDriver navigation in explicit <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">try / except / finally</code> handlers catching <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">TimeoutException</code>, <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">NoSuchWindowException</code>, <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">StaleElementReferenceException</code>, and <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">WebDriverException</code>. Clicking <strong>Stop</strong> sets a thread-safe <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">threading.Event</code> checked every 100ms, immediately exiting the wait loop and running <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">driver.quit()</code> in <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">safe_shutdown()</code>.
            </p>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              <strong>Policy Reminder:</strong> Only automate simulated advertisements and authorized QA test environments. Never target live ad-network impressions, rewarded ads, or monetization systems.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
