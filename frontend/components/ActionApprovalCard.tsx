'use client';

import { useState } from 'react';
import type { ProposedAction, RiskLevel } from '@/types/nexus';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, Shield, Terminal, Check, X } from 'lucide-react';

// ── Risk badge ────────────────────────────────────────────────────────────────
function RiskBadge({ level }: { level: RiskLevel }) {
  const styles = {
    low: 'bg-emerald-950 text-emerald-400 border-emerald-800',
    medium: 'bg-amber-950 text-amber-400 border-amber-800',
    high: 'bg-red-950 text-red-400 border-red-800',
  };
  const labels = { low: 'LOW RISK', medium: 'MEDIUM RISK', high: 'HIGH RISK' };

  return (
    <span
      className={cn(
        'px-2 py-0.5 rounded border text-[10px] font-bold tracking-wider',
        styles[level],
      )}
    >
      {labels[level]}
    </span>
  );
}

// ── Main ActionApprovalCard ───────────────────────────────────────────────────
interface ActionApprovalCardProps {
  action: ProposedAction;
  onApprove: () => void;
  onDeny: () => void;
  className?: string;
}

export function ActionApprovalCard({
  action,
  onApprove,
  onDeny,
  className,
}: ActionApprovalCardProps) {
  const [cmdOpen, setCmdOpen] = useState(false);
  const [decided, setDecided] = useState<'approved' | 'denied' | null>(null);

  const handleApprove = () => {
    setDecided('approved');
    onApprove();
  };

  const handleDeny = () => {
    setDecided('denied');
    onDeny();
  };

  return (
    <div
      className={cn(
        'rounded-lg border border-nexus bg-nexus-surface overflow-hidden animate-slide-in-up',
        decided === 'approved' && 'border-emerald-800/60',
        decided === 'denied' && 'border-zinc-700',
        className,
      )}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-nexus flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-nexus-dim" />
          <span className="text-xs font-semibold tracking-wide text-white uppercase">
            Action Requires Approval
          </span>
        </div>
        <RiskBadge level={action.risk_level} />
      </div>

      {/* Description */}
      <div className="px-4 py-4">
        <p className="text-sm text-zinc-200 leading-relaxed">{action.description}</p>
        <p className="mt-1.5 text-[11px] text-nexus-dim">{action.risk_reason}</p>
      </div>

      {/* Expandable command */}
      <div className="px-4 pb-4">
        <button
          onClick={() => setCmdOpen((o) => !o)}
          className="flex items-center gap-1.5 text-[11px] text-nexus-dim hover:text-nexus-cyan transition-colors"
        >
          <Terminal className="h-3 w-3" />
          View exact command
          {cmdOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        {cmdOpen && (
          <div className="mt-2 px-3 py-2 bg-[oklch(0.10_0.005_250)] border border-nexus rounded-md animate-fade-in">
            <pre className="font-mono-ops text-nexus-cyan">
              <span className="text-nexus-dim select-none">$ </span>
              {action.command}
            </pre>
          </div>
        )}
      </div>

      {/* Approve / Deny */}
      <div className="px-4 pb-4 flex items-center gap-3">
        {decided === null ? (
          <>
            <button
              onClick={handleApprove}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-emerald-950 border border-emerald-700 text-emerald-400 text-xs font-semibold hover:bg-emerald-900 hover:border-emerald-600 transition-all active:scale-95"
            >
              <Check className="h-3.5 w-3.5" />
              Approve &amp; Execute
            </button>
            <button
              onClick={handleDeny}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-400 text-xs font-semibold hover:bg-zinc-800 hover:text-zinc-200 transition-all active:scale-95"
            >
              <X className="h-3.5 w-3.5" />
              Deny
            </button>
          </>
        ) : decided === 'approved' ? (
          <div className="flex items-center gap-2 text-emerald-400 text-xs">
            <Check className="h-4 w-4" />
            <span className="font-semibold">Approved — executing...</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-zinc-500 text-xs">
            <X className="h-4 w-4" />
            <span className="font-semibold">Action denied by operator</span>
          </div>
        )}
      </div>
    </div>
  );
}
