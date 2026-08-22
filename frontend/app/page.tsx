'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { InvestigationView } from '@/components/InvestigationView';
import { HistoryView } from '@/components/HistoryView';
import { MOCK_SYSTEM_STATS, MOCK_SERVICES } from '@/lib/mock-data';

export default function Home() {
  const [activeView, setActiveView] = useState<'console' | 'history'>('console');

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar
        stats={MOCK_SYSTEM_STATS}
        services={MOCK_SERVICES}
        activeView={activeView}
        onViewChange={setActiveView}
      />

      {/* Main panel */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-10 flex-shrink-0 flex items-center justify-between px-4 border-b border-nexus">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-nexus-dim tracking-widest uppercase">
              {activeView === 'console' ? 'Operations Console' : 'Operation History'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_5px_oklch(0.72_0.19_145/0.8)]" />
              <span className="text-[10px] text-nexus-dim font-mono">nexus-sandbox</span>
            </div>
            <span className="text-[10px] font-mono text-nexus-dim">
              {new Date().toLocaleTimeString('en-GB', { hour12: false })}
            </span>
          </div>
        </header>

        {/* View content */}
        <div className="flex-1 overflow-hidden">
          {activeView === 'console' ? <InvestigationView /> : <HistoryView />}
        </div>
      </main>
    </div>
  );
}
