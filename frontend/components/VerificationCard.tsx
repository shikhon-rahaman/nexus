'use client';

import type { VerificationResult, OperationStatus } from '@/types/nexus';
import { cn } from '@/lib/utils';
import { Check, X, Minus, ClipboardCheck } from 'lucide-react';

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: OperationStatus }) {
  const configs = {
    RESOLVED: {
      label: 'RESOLVED',
      classes: 'bg-emerald-950 text-emerald-400 border-emerald-700 shadow-[0_0_10px_oklch(0.72_0.19_145/0.25)]',
    },
    FAILED: {
      label: 'FAILED',
      classes: 'bg-red-950 text-red-400 border-red-800',
    },
    PARTIAL: {
      label: 'PARTIAL',
      classes: 'bg-amber-950 text-amber-400 border-amber-800',
    },
    IN_PROGRESS: {
      label: 'IN PROGRESS',
      classes: 'bg-blue-950 text-blue-400 border-blue-800',
    },
    BLOCKED: {
      label: 'BLOCKED',
      classes: 'bg-red-950 text-red-400 border-red-800',
    },
  };

  const cfg = configs[status] ?? configs.FAILED;

  return (
    <span
      className={cn(
        'px-2.5 py-1 rounded border text-xs font-bold tracking-widest',
        cfg.classes,
      )}
    >
      {cfg.label}
    </span>
  );
}

// ── Check row ─────────────────────────────────────────────────────────────────
function CheckRow({ name, passed, detail }: { name: string; passed: boolean; detail?: string }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-nexus last:border-0">
      <div
        className={cn(
          'flex-shrink-0 h-5 w-5 rounded flex items-center justify-center mt-0.5',
          passed
            ? 'bg-emerald-950 border border-emerald-800'
            : 'bg-red-950 border border-red-900',
        )}
      >
        {passed ? (
          <Check className="h-3 w-3 text-emerald-400" />
        ) : (
          <X className="h-3 w-3 text-red-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-zinc-200">{name}</div>
        {detail && (
          <div className="text-[11px] font-mono text-nexus-dim mt-0.5">{detail}</div>
        )}
      </div>
    </div>
  );
}

// ── Main VerificationCard ──────────────────────────────────────────────────────
interface VerificationCardProps {
  verification: VerificationResult;
  className?: string;
}

export function VerificationCard({ verification, className }: VerificationCardProps) {
  const passed = verification.checks.filter((c) => c.passed).length;
  const total = verification.checks.length;

  return (
    <div
      className={cn(
        'rounded-lg border border-nexus bg-nexus-surface overflow-hidden animate-slide-in-up',
        className,
      )}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-nexus flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-nexus-dim" />
          <span className="text-xs font-semibold tracking-wide text-white uppercase">
            Verification
          </span>
          <span className="text-[11px] text-nexus-dim font-mono">
            {passed}/{total} checks passed
          </span>
        </div>
        <StatusBadge status={verification.status} />
      </div>

      {/* Checks */}
      <div className="px-4 py-2">
        {verification.checks.map((check, i) => (
          <CheckRow key={i} {...check} />
        ))}
      </div>

      {/* Summary */}
      <div className="px-4 pb-4 pt-1">
        <p className="text-xs text-nexus-dim leading-relaxed">{verification.summary}</p>
      </div>
    </div>
  );
}

// ── Standalone status badge export for use in tables/lists ────────────────────
export { StatusBadge };
