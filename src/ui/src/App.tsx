
import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { RequestEditor } from './components/RequestEditor';
import { ResponseViewer } from './components/ResponseViewer';
import { EnvironmentSwitcher } from './components/EnvironmentSwitcher';
import { SettingsPanel } from './components/SettingsPanel';

function App() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 border-b border-gray-800 bg-gray-950 flex items-center justify-between px-4 shrink-0">
        <h1 className="font-semibold tracking-wide">Reqly</h1>
        <div className="flex items-center gap-4">
          <EnvironmentSwitcher />
          <button onClick={() => setShowSettings(true)} className="text-gray-400 hover:text-white text-sm">Settings</button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 border-r border-gray-800 bg-gray-900 overflow-y-auto">
          <Sidebar />
        </aside>
        <main className="flex-1 bg-gray-950 overflow-y-auto p-4 flex flex-col gap-4">
          <div className="h-1/2 min-h-[300px]">
            <RequestEditor request={{ name: 'New Request', method: 'GET', url: '' }} onFire={() => {}} onSave={() => {}} />
          </div>
          <ResponseViewer response={null} />
        </main>
      </div>
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}


export default App;
