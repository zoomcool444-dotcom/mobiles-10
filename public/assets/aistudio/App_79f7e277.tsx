import { useState } from 'react';
import { PythonSourceView } from './components/PythonSourceView';
import { RunnerConsole } from './components/RunnerConsole';
import { SandboxView } from './components/SandboxView';
import { SetupGuideView } from './components/SetupGuideView';
import { TopBar } from './components/TopBar';
import { WorkbenchTab } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('runner');

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <TopBar activeTab={activeTab} onSelectTab={setActiveTab} />

      <main className="flex-1 w-full max-w-[1440px] mx-auto px-6 py-6">
        {activeTab === 'runner' && <RunnerConsole />}
        {activeTab === 'sandbox' && <SandboxView />}
        {activeTab === 'source' && <PythonSourceView />}
        {activeTab === 'setup' && <SetupGuideView />}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-[1440px] mx-auto px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-500">
          <span>UNIVERSAL TASK BOT · Authorized Website Testing Workbench</span>
          <span>Simulated advertisements &amp; authorized test environments only</span>
        </div>
      </footer>
    </div>
  );
}
