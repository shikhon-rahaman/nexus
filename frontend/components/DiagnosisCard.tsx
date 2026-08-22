'use client';

import { useState } from 'react';
import type { DiagnosisResult } from '@/types/nexus';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, AlertTriangle, Info } from 'lucide-react';

// ── Evidence row ─────────────────────────────────────────────────────────────
function EvidenceRow({ source, summary, raw }: { source: string; summary: string; raw?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-nexus rounded-md overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-nexus-surface-2 transition-colors"
      >
        <span className="flex-shrink-0 mt-0.5">
          {open ? (
            <ChevronDown className="h-3 w-3 text-nexus-dim" />
          ) : (
            <ChevronRight className="h-3 w-3 text-nexus-dim" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-mono text-nexus-cyan mr-2">{source}</span>
          <span className="text-xs text-zinc-400">{summary}</span>
        </div>
      </button>
      {open && raw && (
        <div className="border-t border-nexus bg-[oklch(0.10_0.005_250)] px-4 py-3">
          <pre className="font-mono-ops text-zinc-300 whitespace-pre-wrap break-all">{raw}</pre>
        </div>
      )}
    </div>
  );
}

// ── Confidence bar ────────────────────────────────────────────────────────────
function ConfidenceBar({ value }: { value: number }) {
  const color =
    value >= 80 ? 'bg-emerald-400' : value >= 60 ? 'bg-amber-400' : 'bg-red-400';
  const label =
    value >= 80 ? 'High' : value >= 60 ? 'Moderate' : 'Low';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-nexus-dim">Confidence</span>
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-white">{value}%</span>
          <span
            className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-medium',
              value >= 80
                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                : value >= 60
                ? 'bg-amber-950 text-amber-400 border border-amber-800'
                : 'bg-red-950 text-red-400 border border-red-800',
            )}
          >
            {label}
          </span>
        </div>
      </div>
      <div className="stat-bar-track">
        <div className={cn('stat-bar-fill', color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ── Main Diagnosis card ───────────────────────────────────────────────────────
interface DiagnosisCardProps {
  diagnosis: DiagnosisResult;
  className?: string;
}

export function DiagnosisCard({ diagnosis, className }: DiagnosisCardProps) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);

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
          <div className="h-2 w-2 rounded-full bg-nexus-cyan shadow-[0_0_8px_oklch(0.78_0.15_195/0.8)]" />
          <span className="text-xs font-semibold tracking-wide text-white uppercase">Root Cause</span>
        </div>
        <ConfidenceBar value={diagnosis.confidence} />
      </div>

      {/* Root cause text */}
      <div className="px-4 py-4">
        <p className="text-sm text-zinc-200 leading-relaxed">{diagnosis.root_cause}</p>
      </div>

      {/* Heuristic disclaimer */}
      {diagnosis.is_heuristic && (
        <div className="mx-4 mb-3 flex items-start gap-2 px-3 py-2 rounded-md bg-amber-950/40 border border-amber-800/50">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-300 leading-relaxed">
            <span className="font-semibold">Heuristic estimate.</span> Confidence is derived from
            pattern matching, not deterministic proof. Verify manually before taking
            irreversible actions.
          </p>
        </div>
      )}

      {/* Evidence toggle */}
      <div className="px-4 pb-4">
        <button
          onClick={() => setEvidenceOpen((o) => !o)}
          className="flex items-center gap-1.5 text-[11px] text-nexus-dim hover:text-nexus-cyan transition-colors"
        >
          <Info className="h-3 w-3" />
          {evidenceOpen ? 'Hide' : 'Show'} {diagnosis.evidence.length} evidence sources
          {evidenceOpen ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>
        {evidenceOpen && (
          <div className="mt-3 space-y-2 animate-fade-in">
            {diagnosis.evidence.map((e, i) => (
              <EvidenceRow key={i} {...e} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
