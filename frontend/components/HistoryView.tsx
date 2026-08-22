'use client';

import type { Operation, OperationStatus } from '@/types/nexus';
import { cn } from '@/lib/utils';
import { MOCK_OPERATION_HISTORY } from '@/lib/mock-data';
import { Clock, ChevronRight } from 'lucide-react';

// ── Status badge (inline, compact for table use) ──────────────────────────────
function StatusPill({ status }: { status: OperationStatus }) {
  const configs = {
    RESOLVED: 'bg-emerald-950 text-emerald-400 border-emerald-800',
    FAILED:   'bg-red-950 text-red-400 border-red-900',
    PARTIAL:  'bg-amber-950 text-amber-400 border-amber-800',
    IN_PROGRESS: 'bg-blue-950 text-blue-400 border-blue-800',
    BLOCKED:  'bg-red-950 text-red-600 border-red-900',
  };
  return (
    <span
      className={cn(
        'px-1.5 py-0.5 rounded border text-[10px] font-bold tracking-wider whitespace-nowrap',
        configs[status],
      )}
    >
      {status}
    </span>
  );
}

// ── Relative timestamp ────────────────────────────────────────────────────────
function RelativeTime({ iso }: { iso: string }) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const label =
    days > 0
      ? `${days}d ago`
      : hours > 0
      ? `${hours}h ago`
      : minutes > 0
      ? `${minutes}m ago`
      : 'just now';

  return (
    <span title={new Date(iso).toLocaleString()} className="font-mono text-[11px] text-nexus-dim">
      {label}
    </span>
  );
}

// ── Operation row ─────────────────────────────────────────────────────────────
function OperationRow({ op }: { op: Operation }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-nexus hover:bg-nexus-surface-2 transition-colors group cursor-pointer">
      {/* Status */}
      <div className="w-24 flex-shrink-0">
        <StatusPill status={op.status} />
      </div>

      {/* Query */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-200 truncate font-mono">{op.query}</p>
        {op.diagnosis && (
          <p className="text-[11px] text-nexus-dim mt-0.5 truncate">{op.diagnosis.root_cause}</p>
        )}
        {op.safety_block && (
          <p className="text-[11px] text-red-700 mt-0.5 truncate">
            Blocked: {op.safety_block.policy_rule}
          </p>
        )}
      </div>

      {/* Confidence (if available) */}
      {op.diagnosis && (
        <div className="flex-shrink-0 w-16 text-right">
          <span className="text-[11px] font-mono text-nexus-dim">
            {op.diagnosis.confidence}% conf
          </span>
        </div>
      )}

      {/* Timestamp */}
      <div className="flex-shrink-0 flex items-center gap-1 text-nexus-dim">
        <Clock className="h-3 w-3" />
        <RelativeTime iso={op.timestamp} />
      </div>

      {/* Arrow */}
      <ChevronRight className="h-3.5 w-3.5 text-nexus-dim/0 group-hover:text-nexus-dim transition-all" />
    </div>
  );
}

// ── Main HistoryView ──────────────────────────────────────────────────────────
export function HistoryView() {
  const ops = MOCK_OPERATION_HISTORY;

  const counts = {
    RESOLVED:   ops.filter((o) => o.status === 'RESOLVED').length,
    FAILED:     ops.filter((o) => o.status === 'FAILED').length,
    BLOCKED:    ops.filter((o) => o.status === 'BLOCKED').length,
    PARTIAL:    ops.filter((o) => o.status === 'PARTIAL').length,
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-nexus flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-white tracking-wide">Operation History</h1>
          <p className="text-xs text-nexus-dim mt-0.5">
            {ops.length} operations — last 24 hours
          </p>
        </div>
        {/* Summary counters */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-emerald-400 font-mono font-semibold">{counts.RESOLVED}</span>
            <span className="text-nexus-dim">resolved</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-amber-400 font-mono font-semibold">{counts.PARTIAL}</span>
            <span className="text-nexus-dim">partial</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-red-400 font-mono font-semibold">{counts.FAILED}</span>
            <span className="text-nexus-dim">failed</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-red-600 font-mono font-semibold">{counts.BLOCKED}</span>
            <span className="text-nexus-dim">blocked</span>
          </div>
        </div>
      </div>

      {/* Table header */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-nexus bg-nexus-surface">
        <div className="w-24 flex-shrink-0 text-[9px] tracking-widest text-nexus-dim uppercase">
          Status
        </div>
        <div className="flex-1 text-[9px] tracking-widest text-nexus-dim uppercase">Query / Finding</div>
        <div className="w-16 flex-shrink-0 text-right text-[9px] tracking-widest text-nexus-dim uppercase">
          Conf
        </div>
        <div className="flex-shrink-0 text-[9px] tracking-widest text-nexus-dim uppercase">Time</div>
        <div className="w-4" />
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {ops.map((op) => (
          <OperationRow key={op.id} op={op} />
        ))}
      </div>
    </div>
  );
}
