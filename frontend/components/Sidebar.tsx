'use client';

import type { SystemStat, ServiceStatus } from '@/types/nexus';
import { cn } from '@/lib/utils';
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Activity,
  Server,
  Circle,
  Terminal,
  Zap,
} from 'lucide-react';

// ── Stat bar ─────────────────────────────────────────────────────────────────
function StatBar({ stat }: { stat: SystemStat }) {
  const fillColor = stat.critical
    ? 'bg-red-500'
    : stat.warning
    ? 'bg-amber-400'
    : 'bg-cyan-400';

  const textColor = stat.critical
    ? 'text-red-400'
    : stat.warning
    ? 'text-amber-400'
    : 'text-cyan-400';

  const isPercentage = stat.unit === '%';
  const displayValue = isPercentage
    ? `${stat.value}%`
    : `${stat.value} ${stat.unit}`;

  const iconMap: Record<string, React.ReactNode> = {
    CPU:       <Cpu className="h-3 w-3" />,
    RAM:       <MemoryStick className="h-3 w-3" />,
    Swap:      <Activity className="h-3 w-3" />,
    'Disk /':  <HardDrive className="h-3 w-3" />,
    'Load avg': <Zap className="h-3 w-3" />,
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-nexus-dim">
          {iconMap[stat.label]}
          <span className="text-xs font-medium tracking-wide">{stat.label}</span>
        </div>
        <span className={cn('text-xs font-mono font-semibold', textColor)}>
          {displayValue}
        </span>
      </div>
      {isPercentage && (
        <div className="stat-bar-track">
          <div
            className={cn('stat-bar-fill', fillColor)}
            style={{ width: `${stat.value}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ── Service dot ───────────────────────────────────────────────────────────────
function ServiceDot({ status }: { status: ServiceStatus['status'] }) {
  const colors = {
    running:  'bg-emerald-400 shadow-[0_0_6px_oklch(0.72_0.19_145/0.7)]',
    stopped:  'bg-zinc-600',
    degraded: 'bg-amber-400 shadow-[0_0_6px_oklch(0.78_0.17_70/0.7)]',
    unknown:  'bg-zinc-500',
  };
  return (
    <span className={cn('inline-block h-2 w-2 rounded-full flex-shrink-0 mt-1', colors[status])} />
  );
}

// ── Main Sidebar ──────────────────────────────────────────────────────────────
interface SidebarProps {
  stats: SystemStat[];
  services: ServiceStatus[];
  activeView: 'console' | 'history';
  onViewChange: (v: 'console' | 'history') => void;
}

export function Sidebar({ stats, services, activeView, onViewChange }: SidebarProps) {
  return (
    <aside className="w-60 flex-shrink-0 flex flex-col border-r border-nexus bg-[oklch(0.12_0.006_250)] h-screen overflow-y-auto">
      {/* Wordmark */}
      <div className="px-4 py-4 border-b border-nexus">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Terminal className="h-5 w-5 text-nexus-cyan" />
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_5px_oklch(0.72_0.19_145/0.8)]" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-widest text-white uppercase">NEXUS</div>
            <div className="text-[9px] tracking-[0.2em] text-nexus-dim uppercase">Ops Assistant</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="px-3 pt-3 space-y-1">
        <button
          onClick={() => onViewChange('console')}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors',
            activeView === 'console'
              ? 'bg-nexus-surface-3 text-nexus-cyan'
              : 'text-nexus-dim hover:bg-nexus-surface-2 hover:text-white',
          )}
        >
          <Terminal className="h-3.5 w-3.5" />
          Console
        </button>
        <button
          onClick={() => onViewChange('history')}
          className={cn(
            'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors',
            activeView === 'history'
              ? 'bg-nexus-surface-3 text-nexus-cyan'
              : 'text-nexus-dim hover:bg-nexus-surface-2 hover:text-white',
          )}
        >
          <Server className="h-3.5 w-3.5" />
          History
        </button>
      </nav>

      {/* System Stats */}
      <div className="px-4 pt-5 pb-3">
        <div className="text-[9px] font-semibold tracking-[0.15em] text-nexus-dim uppercase mb-3">
          System Health
        </div>
        <div className="space-y-3">
          {stats.map((s) => (
            <StatBar key={s.label} stat={s} />
          ))}
        </div>
      </div>

      <div className="border-t border-nexus mx-4" />

      {/* Services */}
      <div className="px-4 pt-4 pb-6 flex-1">
        <div className="text-[9px] font-semibold tracking-[0.15em] text-nexus-dim uppercase mb-3">
          Services
        </div>
        <div className="space-y-2">
          {services.map((svc) => (
            <div key={svc.name} className="flex items-start gap-2.5">
              <ServiceDot status={svc.status} />
              <div className="min-w-0">
                <div className="text-xs font-mono text-white truncate">{svc.name}</div>
                <div className="text-[10px] text-nexus-dim">
                  {svc.status === 'running' && svc.uptime
                    ? `up ${svc.uptime}`
                    : svc.status === 'degraded'
                    ? 'degraded'
                    : svc.status === 'stopped'
                    ? 'stopped'
                    : 'unknown'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-nexus">
        <div className="flex items-center gap-1.5">
          <Circle className="h-1.5 w-1.5 fill-emerald-400 text-emerald-400" />
          <span className="text-[10px] text-nexus-dim">Container healthy</span>
        </div>
      </div>
    </aside>
  );
}
