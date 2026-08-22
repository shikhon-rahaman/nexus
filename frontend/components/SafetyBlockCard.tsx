'use client';

import type { SafetyBlock } from '@/types/nexus';
import { cn } from '@/lib/utils';
import { ShieldAlert, Code } from 'lucide-react';

// ── SafetyBlockCard ───────────────────────────────────────────────────────────
// Deliberately different visual treatment from generic errors:
//   - Thick red left border (not just a color-tinted card)
//   - "SAFETY ENGINE" header in caps — reads as a system name, not a failure label
//   - Policy rule in monospace, visually distinct from error messages
//   - Explicit framing: "the safety system is working"
// ─────────────────────────────────────────────────────────────────────────────
interface SafetyBlockCardProps {
  block: SafetyBlock;
  className?: string;
}

export function SafetyBlockCard({ block, className }: SafetyBlockCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-red-800/70 bg-[oklch(0.13_0.03_25)] overflow-hidden',
        'shadow-[0_0_20px_oklch(0.65_0.22_25/0.15)] animate-slide-in-up',
        'relative',
        className,
      )}
    >
      {/* Thick left accent — key visual differentiator from generic error cards */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 rounded-l-lg" />

      {/* Header */}
      <div className="pl-5 pr-4 py-3 border-b border-red-900/60 flex items-center gap-2.5">
        <ShieldAlert className="h-5 w-5 text-red-400 flex-shrink-0" />
        <div>
          <div className="text-xs font-bold tracking-widest text-red-400 uppercase">
            Safety Engine
          </div>
          <div className="text-[10px] text-red-700 tracking-wide">Action blocked before execution</div>
        </div>
        <div className="ml-auto px-2 py-0.5 bg-red-950 border border-red-800 rounded text-[10px] font-bold text-red-400 tracking-wider">
          BLOCKED
        </div>
      </div>

      {/* Reason */}
      <div className="pl-5 pr-4 pt-4 pb-3">
        <p className="text-sm text-zinc-200 leading-relaxed">{block.reason}</p>
      </div>

      {/* Policy rule — monospace, distinct */}
      <div className="pl-5 pr-4 pb-4">
        <div className="text-[10px] text-red-700 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
          <Code className="h-3 w-3" />
          Policy Rule Triggered
        </div>
        <div className="bg-[oklch(0.10_0.02_25)] border border-red-900/60 rounded px-3 py-2">
          <p className="font-mono-ops text-red-400">{block.policy_rule}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[10px] text-red-800">Triggered by command:</span>
            <code className="font-mono-ops text-[11px] text-red-500">{block.triggered_by}</code>
          </div>
        </div>
      </div>

      {/* Reassurance footer */}
      <div className="pl-5 pr-4 pb-3">
        <p className="text-[11px] text-red-800 italic">
          No action was executed. The safety system is functioning correctly.
        </p>
      </div>
    </div>
  );
}
