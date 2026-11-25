import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileCode2,
  Globe,
  Play,
  RotateCcw,
  Search,
  Settings2,
  ShieldAlert,
  Square,
  Trash2,
} from 'lucide-react';
import { createDemoTasks, isBlockedAdDomain } from '../data/demoTasks';
import {
  BotStatus,
  DemoTaskItem,
  LogEntry,
  LogLevel,
  SelectorProfile,
  UrlInspectionResult,
} from '../types';

type BrowserViewMode = 'directory' | 'task-detail' | 'ad-modal';

function formatTimestamp(date: Date = new Date()): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

export function RunnerConsole() {
  const defaultOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const [targetUrl, setTargetUrl] = useState<string>(`${defaultOrigin}/demo-sandbox`);
  const [waitSecondsInput, setWaitSecondsInput] = useState<string>('3');
  const [sandboxTaskTotal, setSandboxTaskTotal] = useState<number>(5);

  const [tasks, setTasks] = useState<DemoTaskItem[]>(() => createDemoTasks(5));
  const [status, setStatus] = useState<BotStatus>('Idle');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [highlightedSelector, setHighlightedSelector] = useState<string | null>(null);
  const [browserView, setBrowserView] = useState<BrowserViewMode>('directory');
  const [adElapsed, setAdElapsed] = useState<number>(0);

  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'init-1',
      timestamp: formatTimestamp(),
      level: 'INFO',
      message: 'UNIVERSAL TASK BOT initialized. Ready for authorized demo URL.',
    },
  ]);
  const [logFilter, setLogFilter] = useState<'ALL' | LogLevel>('ALL');

  const [inspecting, setInspecting] = useState<boolean>(false);
  const [inspection, setInspection] = useState<UrlInspectionResult | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showSelectors, setShowSelectors] = useState<boolean>(false);
  const [selectors, setSelectors] = useState<SelectorProfile>({
    taskSelector: '[data-demo-task], .demo-task-btn',
    actionSelector: '[data-watch-ad], .watch-ad-btn',
    closeSelector: "[data-close-ad], .close-ad-btn, button[aria-label='Close task details']",
  });
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<boolean>(false);

  const stopRequestedRef = useRef<boolean>(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const appendLog = useCallback((level: LogLevel, message: string) => {
    setLogs((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: formatTimestamp(),
        level,
        message,
      },
    ]);
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [logs]);

  const completedCount = useMemo(() => tasks.filter((t) => t.completed).length, [tasks]);
  const taskCount = tasks.length;

  const parsedWaitSeconds = useMemo(() => {
    const val = Number.parseFloat(waitSecondsInput);
    if (!Number.isFinite(val)) return 3;
    return Math.min(Math.max(val, 0.5), 60);
  }, [waitSecondsInput]);

  const sleepInterruptible = useCallback((ms: number, onTick?: (elapsedMs: number) => void): Promise<boolean> => {
    return new Promise((resolve) => {
      const start = performance.now();
      const interval = window.setInterval(() => {
        if (stopRequestedRef.current) {
          window.clearInterval(interval);
          resolve(false);
          return;
        }
        const elapsed = performance.now() - start;
        if (onTick) {
          onTick(Math.min(elapsed, ms));
        }
        if (elapsed >= ms) {
          window.clearInterval(interval);
          resolve(true);
        }
      }, 50);
    });
  }, []);

  const validateUrl = useCallback((rawUrl: string): string | null => {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      return 'Enter an authorized demo website URL.';
    }
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return 'URL must include http:// or https:// protocol.';
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'Only http:// and https:// URLs are allowed.';
    }
    if (isBlockedAdDomain(trimmed)) {
      return 'Blocked domain: real ad-network URLs are prohibited. Only automate authorized demo test sites.';
    }
    return null;
  }, []);

  const handleInspectUrl = async () => {
    const err = validateUrl(targetUrl);
    if (err) {
      setValidationError(err);
      appendLog('ERROR', err);
      return;
    }

    setValidationError(null);
    setInspecting(true);
    appendLog('INFO', `Inspecting authorized target: ${targetUrl.trim()}`);

    try {
      const res = await fetch(`/api/inspect-url?url=${encodeURIComponent(targetUrl.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || 'Failed to inspect URL.';
        setValidationError(msg);
        appendLog('ERROR', msg);
        setInspection(null);
        return;
      }
      setInspection(data as UrlInspectionResult);
      if (data.isBuiltInSandbox && data.detectedTaskCount > 0) {
        setSandboxTaskTotal(data.detectedTaskCount);
        setTasks(createDemoTasks(data.detectedTaskCount));
      }
      appendLog(
        'INFO',
        `HTTP ${data.statusCode} · "${data.title}" · ${data.detectedTaskCount} demo task element(s) detected.`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error inspecting URL.';
      setValidationError(msg);
      appendLog('ERROR', msg);
    } finally {
      setInspecting(false);
    }
  };

  const handleLoadHtmlFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      const doc = new DOMParser().parseFromString(content, 'text/html');
      const customParts = selectors.taskSelector
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const matched = new Map<Element, string>();

      for (const sel of customParts) {
        try {
          doc.querySelectorAll(sel).forEach((el) => {
            if (!matched.has(el)) {
              matched.set(el, (el.textContent || '').trim() || `Task ${matched.size + 1}`);
            }
          });
        } catch {
          // Skip invalid user CSS selector safely
        }
      }

      if (matched.size === 0) {
        doc.querySelectorAll('button, a').forEach((el) => {
          const txt = (el.textContent || '').trim();
          if (/start task|open task|demo task|complete task|watch ad|open file/i.test(txt)) {
            matched.set(el, txt);
          }
        });
      }

      const extracted: DemoTaskItem[] = Array.from(matched.values()).map((label, idx) => ({
        id: `file-task-${idx + 1}`,
        index: idx + 1,
        title: label,
        description: `Detected inside local file "${file.name}"`,
        completed: false,
      }));

      setLoadedFileName(file.name);
      setTargetUrl(`file:///${file.name}`);
      setBrowserView('directory');
      setActiveTaskId(null);
      setInspection(null);
      setValidationError(null);

      if (extracted.length > 0) {
        setTasks(extracted);
        appendLog('INFO', `Loaded "${file.name}" · Auto-detected ${extracted.length} task button(s).`);
      } else {
        setTasks([]);
        appendLog('WARN', `Loaded "${file.name}", but no matching task buttons were found. Adjust Task Button CSS.`);
      }
    } catch {
      appendLog('ERROR', `Could not read HTML file "${file.name}".`);
    } finally {
      e.target.value = '';
    }
  };

  const handleDownloadConfiguredJson = () => {
    const payload = {
      url: targetUrl.trim(),
      wait_seconds: String(parsedWaitSeconds),
      task_selector: selectors.taskSelector.trim(),
      action_selector: selectors.actionSelector.trim(),
      close_selector: selectors.closeSelector.trim(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bot_config.json';
    a.click();
    URL.revokeObjectURL(url);
    appendLog('INFO', 'Exported bot_config.json with your target URL and custom selectors.');
  };

  const pythonLaunchCommand = useMemo(() => {
    const safeUrl = targetUrl.trim() || `${defaultOrigin}/demo-sandbox`;
    return `python universal_task_bot.py --url "${safeUrl}" --wait ${parsedWaitSeconds.toFixed(1)} --autostart`;
  }, [targetUrl, parsedWaitSeconds, defaultOrigin]);

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText(pythonLaunchCommand);
      setCopiedCmd(true);
      window.setTimeout(() => setCopiedCmd(false), 1800);
    } catch {
      // Clipboard ignored
    }
  };

  const handleChangeSandboxCount = (count: number) => {
    if (isRunning) return;
    setLoadedFileName(null);
    setSandboxTaskTotal(count);
    const updatedTasks = createDemoTasks(count);
    setTasks(updatedTasks);
    setBrowserView('directory');
    setActiveTaskId(null);
    setHighlightedSelector(null);
    setStatus('Idle');
    const urlObj = new URL(`${defaultOrigin}/demo-sandbox`);
    if (count !== 5) {
      urlObj.searchParams.set('tasks', String(count));
    }
    setTargetUrl(urlObj.toString());
    appendLog('INFO', `Configured Demo Sandbox with ${count} simulated tasks.`);
  };

  const handleReset = () => {
    if (isRunning) return;
    setLoadedFileName(null);
    setTasks(createDemoTasks(sandboxTaskTotal));
    setStatus('Idle');
    setActiveTaskId(null);
    setHighlightedSelector(null);
    setBrowserView('directory');
    setAdElapsed(0);
    setValidationError(null);
    appendLog('INFO', 'Demo tasks reset to pending state.');
  };

  const handleStop = () => {
    if (!isRunning) return;
    stopRequestedRef.current = true;
    setStatus('Stopping');
    appendLog('WARN', 'Stop requested. Interrupting active wait and shutting down browser safely...');
  };

  const handleStart = async () => {
    if (isRunning) return;

    const trimmedUrl = targetUrl.trim();
    const isBuiltInOrLocalFile =
      Boolean(loadedFileName) ||
      trimmedUrl.startsWith(`${defaultOrigin}/demo-sandbox`) ||
      trimmedUrl.startsWith('http://localhost:3000/demo-sandbox') ||
      trimmedUrl.startsWith('file://');

    if (!isBuiltInOrLocalFile) {
      // Validate external authorized URL via server inspector, then guide Chrome Python launcher
      const err = validateUrl(trimmedUrl);
      if (err) {
        setValidationError(err);
        appendLog('ERROR', err);
        setStatus('Error');
        return;
      }
      setValidationError(null);
      setIsRunning(true);
      setStatus('Opening URL');
      appendLog('ACTION', `Verifying external demo target: ${trimmedUrl}`);
      try {
        const res = await fetch(`/api/inspect-url?url=${encodeURIComponent(trimmedUrl)}`);
        const data = await res.json();
        if (!res.ok) {
          const msg = data.error || 'Target URL unreachable.';
          setValidationError(msg);
          appendLog('ERROR', msg);
          setStatus('Error');
          return;
        }
        setInspection(data as UrlInspectionResult);
        appendLog(
          'INFO',
          `Verified HTTP ${data.statusCode} · "${data.title}". Ready for local Chrome Selenium execution.`
        );
        appendLog(
          'WARN',
          'Browser security blocks cross-origin DOM automation inside this web tab. Use the Python Launch Command below or download bot_config.json to run Chrome directly.'
        );
        setStatus('Idle');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unable to reach target URL.';
        setValidationError(msg);
        appendLog('ERROR', msg);
        setStatus('Error');
      } finally {
        setIsRunning(false);
      }
      return;
    }

    if (!loadedFileName) {
      const err = validateUrl(trimmedUrl);
      if (err) {
        setValidationError(err);
        appendLog('ERROR', err);
        setStatus('Error');
        return;
      }
    }

    const waitNum = Number.parseFloat(waitSecondsInput);
    if (!Number.isFinite(waitNum) || waitNum < 0.5 || waitNum > 60) {
      const msg = 'Waiting time must be between 0.5 and 60 seconds.';
      setValidationError(msg);
      appendLog('ERROR', msg);
      return;
    }

    setValidationError(null);
    stopRequestedRef.current = false;
    setIsRunning(true);

    let workingTasks =
      tasks.length > 0 && tasks.every((t) => t.completed)
        ? loadedFileName
          ? tasks.map((t) => ({ ...t, completed: false }))
          : createDemoTasks(sandboxTaskTotal)
        : [...tasks];
    if (tasks.length > 0 && tasks.every((t) => t.completed)) {
      setTasks(workingTasks);
    }

    try {
      setStatus('Opening URL');
      setBrowserView('directory');
      setActiveTaskId(null);
      appendLog('ACTION', `Opening Chrome session for authorized target: ${trimmedUrl}`);

      if (!(await sleepInterruptible(600))) {
        throw new Error('USER_STOPPED');
      }

      setStatus('Detecting Tasks');
      setHighlightedSelector('[data-demo-task]');
      const pendingTasks = workingTasks.filter((t) => !t.completed);
      appendLog('INFO', `Detected ${workingTasks.length} total demo tasks (${pendingTasks.length} pending).`);

      if (!(await sleepInterruptible(500))) {
        throw new Error('USER_STOPPED');
      }

      for (let i = 0; i < workingTasks.length; i += 1) {
        if (stopRequestedRef.current) {
          throw new Error('USER_STOPPED');
        }
        const task = workingTasks[i];
        if (task.completed) continue;

        // Step 4 & 8: Open simulated demo task
        setStatus('Opening Task');
        setActiveTaskId(task.id);
        setHighlightedSelector(`[data-demo-task="${task.id}"]`);
        appendLog('ACTION', `Opening demo task #${task.index}: "${task.title}"`);
        if (!(await sleepInterruptible(450))) {
          throw new Error('USER_STOPPED');
        }

        setBrowserView('task-detail');
        setHighlightedSelector('[data-watch-ad]');
        if (!(await sleepInterruptible(400))) {
          throw new Error('USER_STOPPED');
        }

        // Step 5: Click simulated Watch Ad button
        setStatus('Clicking Watch Ad');
        appendLog('ACTION', `Clicking simulated 'Watch Ad' button for ${task.id}...`);
        if (!(await sleepInterruptible(300))) {
          throw new Error('USER_STOPPED');
        }

        // Step 6: Wait configured duration on simulated demo advertisement
        setBrowserView('ad-modal');
        setHighlightedSelector(null);
        setAdElapsed(0);
        setStatus('Waiting on Demo Ad');
        appendLog('INFO', `Waiting ${waitNum.toFixed(1)}s on simulated demo advertisement...`);

        const completedWait = await sleepInterruptible(waitNum * 1000, (elapsedMs) => {
          setAdElapsed(elapsedMs / 1000);
        });
        if (!completedWait) {
          throw new Error('USER_STOPPED');
        }

        // Step 7: Close demo advertisement & return to task page
        setStatus('Closing Demo Ad');
        setHighlightedSelector('[data-close-ad]');
        appendLog('ACTION', 'Closing simulated demo advertisement and returning to task page...');
        if (!(await sleepInterruptible(350))) {
          throw new Error('USER_STOPPED');
        }

        workingTasks = workingTasks.map((t) => (t.id === task.id ? { ...t, completed: true } : t));
        setTasks(workingTasks);
        setBrowserView('directory');
        setHighlightedSelector(null);
        setActiveTaskId(null);
        setStatus('Returning to Task Page');

        const doneSoFar = workingTasks.filter((t) => t.completed).length;
        appendLog('INFO', `Completed ${task.id} (${doneSoFar}/${workingTasks.length}).`);

        if (!(await sleepInterruptible(350))) {
          throw new Error('USER_STOPPED');
        }
      }

      setStatus('Completed');
      appendLog('INFO', 'All demo tasks completed. Chrome WebDriver shut down cleanly.');
    } catch (err) {
      if (err instanceof Error && err.message === 'USER_STOPPED') {
        setStatus('Stopped');
        setBrowserView('directory');
        setActiveTaskId(null);
        setHighlightedSelector(null);
        appendLog('WARN', 'Execution stopped cleanly. Browser closed safely.');
      } else {
        const message = err instanceof Error ? err.message : 'Unexpected automation error.';
        setStatus('Error');
        appendLog('ERROR', `${message} Executed safe browser shutdown.`);
      }
    } finally {
      setIsRunning(false);
      stopRequestedRef.current = false;
      setHighlightedSelector(null);
    }
  };

  const handleSimulateError = async () => {
    if (isRunning) return;
    setStatus('Error');
    setHighlightedSelector(null);
    appendLog('ERROR', 'TimeoutException: [data-watch-ad] not clickable within 6.0s on test fixture.');
    appendLog('INFO', 'Safe browser shutdown triggered via finally block (driver.quit()).');
  };

  const handleExportLogs = () => {
    const text = logs.map((l) => `[${l.timestamp}] [${l.level}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `universal-task-bot-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLogs = useMemo(() => {
    if (logFilter === 'ALL') return logs;
    return logs.filter((l) => l.level === logFilter);
  }, [logs, logFilter]);

  const activeTask = useMemo(
    () => tasks.find((t) => t.id === activeTaskId) ?? null,
    [tasks, activeTaskId]
  );

  const statusTone = useMemo(() => {
    if (status === 'Completed') return 'text-emerald-700';
    if (status === 'Error') return 'text-red-700';
    if (status === 'Stopped' || status === 'Stopping') return 'text-amber-700';
    if (isRunning) return 'text-blue-700';
    return 'text-slate-900';
  }, [status, isRunning]);

  return (
    <div className="space-y-6">
      {/* Compliance Notice */}
      <div className="bg-white border border-slate-200 rounded-lg px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 text-sm text-slate-700">
          <ShieldAlert className="w-4 h-4 text-blue-600 shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
          <span>
            <strong className="font-semibold text-slate-900">Authorized Test Environments Only:</strong>{' '}
            Automate simulated advertisements and QA sandboxes. Real ad-network domains are blocked.
          </span>
        </div>
        <div className="text-xs text-slate-500 whitespace-nowrap shrink-0">
          Selenium 4 · Chrome WebDriver
        </div>
      </div>

      {/* Controller Bar */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div className="lg:col-span-6">
            <label htmlFor="demo-url-input" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Authorized Demo Website URL
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Globe
                  className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="demo-url-input"
                  type="url"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  disabled={isRunning}
                  placeholder="http://localhost:3000/demo-sandbox"
                  className="w-full h-10 pl-9 pr-3 text-sm font-mono bg-slate-50 border border-slate-300 rounded-md text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 disabled:opacity-60"
                />
              </div>
              <button
                type="button"
                onClick={handleInspectUrl}
                disabled={isRunning || inspecting}
                className="h-10 px-3.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <Search className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{inspecting ? 'Checking...' : 'Inspect URL'}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,.htm"
                onChange={handleLoadHtmlFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isRunning}
                className="h-10 px-3.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <FileCode2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Load .html File</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-2">
            <label htmlFor="wait-seconds-input" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Ad Wait Time (sec)
            </label>
            <input
              id="wait-seconds-input"
              type="number"
              min="0.5"
              max="60"
              step="0.5"
              value={waitSecondsInput}
              onChange={(e) => setWaitSecondsInput(e.target.value)}
              disabled={isRunning}
              className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-slate-50 border border-slate-300 rounded-md text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 disabled:opacity-60"
            />
          </div>

          <div className="lg:col-span-4 flex flex-wrap items-center gap-2 lg:justify-end">
            <button
              type="button"
              onClick={handleStart}
              disabled={isRunning}
              className="h-10 px-5 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              <Play className="w-4 h-4" aria-hidden="true" />
              <span>Start</span>
            </button>

            <button
              type="button"
              onClick={handleStop}
              disabled={!isRunning}
              className="h-10 px-5 text-sm font-semibold text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
            >
              <Square className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Stop</span>
            </button>

            <button
              type="button"
              onClick={handleReset}
              disabled={isRunning}
              className="h-10 px-3.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Sandbox task preset + Custom selector toggle + URL inspection summary */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium text-slate-700">Demo Sandbox Tasks:</span>
            <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-md">
              {[4, 5, 8].map((count) => (
                <button
                  key={count}
                  type="button"
                  disabled={isRunning}
                  onClick={() => handleChangeSandboxCount(count)}
                  className={`px-2.5 py-1 rounded text-xs font-medium tabular-nums transition-colors cursor-pointer disabled:opacity-50 ${
                    !loadedFileName && sandboxTaskTotal === count
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {count} tasks
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowSelectors((prev) => !prev)}
              className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/70 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{showSelectors ? 'Hide Other-Site Settings' : 'Use on Another Website'}</span>
            </button>
          </div>

          {inspection && !validationError && (
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
              <span>Verified HTTP {inspection.statusCode}</span>
              <span aria-hidden="true">·</span>
              <span className="truncate max-w-[220px]">{inspection.title}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {inspection.isSpaShell ? 'SPA (runtime Chrome detection)' : `${inspection.detectedTaskCount} task selector(s)`}
              </span>
            </div>
          )}

          {validationError && (
            <div className="flex items-center gap-2 text-xs text-red-700 font-medium">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{validationError}</span>
            </div>
          )}
        </div>

        {/* Custom CSS Selectors & Portable Chrome Launch Panel */}
        {showSelectors && (
          <div className="mt-4 pt-4 border-t border-slate-200 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Task Button CSS Selector
                </label>
                <input
                  type="text"
                  value={selectors.taskSelector}
                  onChange={(e) => setSelectors((prev) => ({ ...prev, taskSelector: e.target.value }))}
                  className="w-full h-9 px-2.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-md text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Watch Ad / Action CSS Selector
                </label>
                <input
                  type="text"
                  value={selectors.actionSelector}
                  onChange={(e) => setSelectors((prev) => ({ ...prev, actionSelector: e.target.value }))}
                  className="w-full h-9 px-2.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-md text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Close Ad / Return CSS Selector
                </label>
                <input
                  type="text"
                  value={selectors.closeSelector}
                  onChange={(e) => setSelectors((prev) => ({ ...prev, closeSelector: e.target.value }))}
                  className="w-full h-9 px-2.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-md text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-md p-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-700 mb-1">
                  Run in Real Google Chrome (Python CLI Command)
                </div>
                <code className="block text-xs font-mono text-slate-800 truncate">{pythonLaunchCommand}</code>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyCommand}
                  className="h-8 px-3 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-100 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedCmd ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCmd ? 'Copied' : 'Copy Command'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadConfiguredJson}
                  className="h-8 px-3 text-xs font-semibold text-white bg-blue-600 rounded hover:bg-blue-700 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export bot_config.json</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 4-Column Metric Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-lg divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Task Count</div>
          <div className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums">{taskCount}</div>
        </div>
        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Completed Count</div>
          <div className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {completedCount} <span className="text-sm font-normal text-slate-500">/ {taskCount}</span>
          </div>
        </div>
        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Current Status</div>
          <div className={`mt-1 text-base font-semibold leading-8 truncate ${statusTone}`}>{status}</div>
        </div>
        <div className="p-5">
          <div className="text-xs font-medium text-slate-500">Configured Ad Wait</div>
          <div className="mt-1 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {parsedWaitSeconds.toFixed(1)}s
          </div>
        </div>
      </section>

      {/* Main Split Workspace: Live Chrome Viewport + Activity Logs */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Interactive Chrome Browser Viewport */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg flex flex-col overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0">
                Chrome Automation Viewport
              </span>
              <span className="text-slate-300" aria-hidden="true">/</span>
              <span className="text-xs font-mono text-slate-500 truncate">{targetUrl}</span>
            </div>
            <button
              type="button"
              onClick={handleSimulateError}
              disabled={isRunning}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
            >
              Test Error Recovery
            </button>
          </div>

          {/* Browser Body */}
          <div className="p-5 flex-1 bg-slate-50/50 relative min-h-[430px] flex flex-col">
            {browserView === 'directory' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Available Demo Tasks</h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Selector target: <code className="font-mono text-slate-700">[data-demo-task]</code>
                    </p>
                  </div>
                  <div className="text-xs font-mono tabular-nums text-slate-500">
                    {completedCount}/{taskCount} complete
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {tasks.map((task) => {
                    const isTargeted = highlightedSelector === `[data-demo-task="${task.id}"]` || highlightedSelector === '[data-demo-task]';
                    return (
                      <div
                        key={task.id}
                        className={`p-4 rounded-md border transition-colors ${
                          task.completed
                            ? 'bg-emerald-50/70 border-emerald-200'
                            : isTargeted
                            ? 'bg-blue-50/60 border-blue-500 ring-2 ring-blue-500/20'
                            : 'bg-white border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                          <span className="font-mono">Task 0{task.index}</span>
                          <span className={task.completed ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                            {task.completed ? 'Completed' : 'Pending'}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-slate-900">{task.title}</div>
                        <p className="text-xs text-slate-600 mt-1 line-clamp-2">{task.description}</p>
                        <div className="mt-3">
                          <button
                            type="button"
                            disabled={task.completed || isRunning}
                            onClick={() => {
                              setActiveTaskId(task.id);
                              setBrowserView('task-detail');
                              appendLog('INFO', `Manual preview opened ${task.id}.`);
                            }}
                            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                              task.completed
                                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                : 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
                            }`}
                          >
                            {task.completed ? 'Completed' : `Start Task ${task.index}`}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {browserView === 'task-detail' && activeTask && (
              <div className="flex-1 flex flex-col justify-center max-w-lg mx-auto w-full">
                <div className="bg-white border border-slate-200 rounded-lg p-6">
                  <div className="text-xs font-mono text-slate-500 mb-1">
                    Active Scenario · {activeTask.id}
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">{activeTask.title}</h3>
                  <p className="text-sm text-slate-600 mt-2">{activeTask.description}</p>
                  <div className="mt-6 pt-5 border-t border-slate-100 flex items-center gap-3">
                    <button
                      type="button"
                      disabled={isRunning}
                      onClick={() => {
                        setBrowserView('ad-modal');
                        setAdElapsed(0);
                      }}
                      className={`px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors cursor-pointer ${
                        highlightedSelector === '[data-watch-ad]' ? 'ring-4 ring-blue-500/30' : ''
                      }`}
                    >
                      Watch Ad
                    </button>
                    <button
                      type="button"
                      disabled={isRunning}
                      onClick={() => {
                        setBrowserView('directory');
                        setActiveTaskId(null);
                      }}
                      className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer"
                    >
                      Back to Tasks
                    </button>
                  </div>
                </div>
              </div>
            )}

            {browserView === 'ad-modal' && (
              <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
                <div className="bg-white border border-slate-300 rounded-lg p-6 shadow-sm">
                  <div className="text-xs text-slate-500">
                    Simulated Advertisement · Non-Monetized QA Fixture
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 mt-1">
                    Demo Product Showcase
                  </h3>
                  <div className="mt-4 bg-slate-900 text-white rounded-md p-6 text-center">
                    <div className="text-xs font-mono text-slate-400">SIMULATED AD PREVIEW</div>
                    <div className="text-lg font-semibold mt-1">Acme Cloud QA Suite</div>
                    <div className="mt-3 text-sm font-mono tabular-nums text-blue-300">
                      Wait Progress: {adElapsed.toFixed(1)}s / {parsedWaitSeconds.toFixed(1)}s
                    </div>
                    <div className="mt-3 w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-[width] duration-75"
                        style={{
                          width: `${Math.min(100, (adElapsed / parsedWaitSeconds) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="mt-5 flex justify-end">
                    <button
                      type="button"
                      disabled={isRunning}
                      onClick={() => {
                        if (activeTask) {
                          setTasks((prev) =>
                            prev.map((t) => (t.id === activeTask.id ? { ...t, completed: true } : t))
                          );
                        }
                        setBrowserView('directory');
                        setActiveTaskId(null);
                      }}
                      className={`px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 cursor-pointer ${
                        highlightedSelector === '[data-close-ad]' ? 'ring-4 ring-blue-500/30' : ''
                      }`}
                    >
                      Close Ad
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Real-Time Activity Logs */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg flex flex-col overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0">
              Activity Logs
            </span>
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center bg-slate-200/70 p-0.5 rounded text-xs">
                {(['ALL', 'INFO', 'ACTION', 'ERROR'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setLogFilter(lvl)}
                    className={`px-2 py-0.5 rounded font-medium cursor-pointer transition-colors ${
                      logFilter === lvl ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleExportLogs}
                title="Export logs"
                className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-200/60 cursor-pointer"
                aria-label="Export activity logs"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setLogs([])}
                title="Clear logs"
                className="p-1.5 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-200/60 cursor-pointer"
                aria-label="Clear activity logs"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="p-4 flex-1 bg-slate-950 text-slate-100 font-mono text-xs leading-relaxed overflow-y-auto max-h-[430px] min-h-[430px] space-y-1.5">
            {filteredLogs.length === 0 ? (
              <div className="text-slate-500">No log entries matching current filter.</div>
            ) : (
              filteredLogs.map((entry) => {
                const levelColor =
                  entry.level === 'ERROR'
                    ? 'text-red-400'
                    : entry.level === 'WARN'
                    ? 'text-amber-400'
                    : entry.level === 'ACTION'
                    ? 'text-blue-400'
                    : 'text-emerald-400';
                return (
                  <div key={entry.id} className="flex items-start gap-2">
                    <span className="text-slate-500 tabular-nums shrink-0">{entry.timestamp}</span>
                    <span className={`font-semibold shrink-0 w-14 ${levelColor}`}>{entry.level}</span>
                    <span className="text-slate-200 break-words">{entry.message}</span>
                  </div>
                );
              })
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </section>
    </div>
  );
}
