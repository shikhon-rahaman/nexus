'use client';

import { useState, useRef, useEffect } from 'react';
import type { InvestigationEvent } from '@/types/nexus';
import { cn } from '@/lib/utils';
import { DiagnosisCard } from './DiagnosisCard';
import { ActionApprovalCard } from './ActionApprovalCard';
import { VerificationCard } from './VerificationCard';
import { SafetyBlockCard } from './SafetyBlockCard';
import {
  Search,
  Loader2,
  CheckCircle2,
  Circle,
  Send,
  Cpu,
  Database,
  Microscope,
  Target,
  Wrench,
  ShieldCheck,
  Play,
  ClipboardList,
  ShieldAlert,
} from 'lucide-react';
import { streamInvestigation, approveAction, denyAction } from '@/lib/api';

// ── Stage icon + color map ────────────────────────────────────────────────────
const STAGE_META = {
  understanding: { icon: Search, color: 'text-blue-400', label: 'Understanding' },
  collecting: { icon: Database, color: 'text-cyan-400', label: 'Collecting Evidence' },
  diagnosing: { icon: Microscope, color: 'text-purple-400', label: 'Analysing' },
  root_cause: { icon: Target, color: 'text-nexus-cyan', label: 'Root Cause Found' },
  proposing_action: { icon: Wrench, color: 'text-amber-400', label: 'Proposing Action' },
  awaiting_approval: { icon: ShieldCheck, color: 'text-amber-400', label: 'Awaiting Approval' },
  executing: { icon: Play, color: 'text-emerald-400', label: 'Executing' },
  verifying: { icon: ClipboardList, color: 'text-emerald-400', label: 'Verifying' },
  complete: { icon: CheckCircle2, color: 'text-emerald-400', label: 'Complete' },
  blocked: { icon: ShieldAlert, color: 'text-red-400', label: 'Blocked' },
} as const;

// ── Single timeline stage card ────────────────────────────────────────────────
function StageCard({
  event,
  isLast,
  onApprove,
  onDeny,
}: {
  event: InvestigationEvent;
  isLast: boolean;
  onApprove: () => void;
  onDeny: () => void;
}) {
  const meta = STAGE_META[event.stage] ?? STAGE_META.understanding;
  const Icon = meta.icon;

  return (
    <div className="flex gap-3">
      {/* Icon + connector */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            'flex-shrink-0 h-6 w-6 rounded-full border flex items-center justify-center z-10',
            event.stage === 'root_cause'
              ? 'border-cyan-600 bg-cyan-950'
              : event.stage === 'blocked'
                ? 'border-red-800 bg-red-950'
                : 'border-zinc-700 bg-nexus-surface-2',
          )}
        >
          <Icon className={cn('h-3 w-3', meta.color)} />
        </div>
        {!isLast && <div className="stage-connector mt-1 flex-1 min-h-[16px]" />}
      </div>

      {/* Content */}
      <div className="pb-4 flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={cn('text-xs font-semibold', meta.color)}>{event.label}</span>
          <span className="text-[10px] font-mono text-nexus-dim">
            {new Date(event.timestamp).toLocaleTimeString('en-GB', { hour12: false })}
          </span>
        </div>
        {event.detail && (
          <p className="text-xs text-zinc-400 leading-relaxed mb-2">{event.detail}</p>
        )}

        {/* Rich sub-cards */}
        {event.diagnosis && <DiagnosisCard diagnosis={event.diagnosis} className="mt-2" />}
        {event.action && (
          <ActionApprovalCard
            action={event.action}
            onApprove={onApprove}
            onDeny={onDeny}
            className="mt-2"
          />
        )}
        {event.verification && (
          <VerificationCard verification={event.verification} className="mt-2" />
        )}
        {event.safety_block && (
          <SafetyBlockCard block={event.safety_block} className="mt-2" />
        )}
      </div>
    </div>
  );
}

// ── Query input ───────────────────────────────────────────────────────────────
function QueryInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (q: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState('');

  const submit = () => {
    const q = value.trim();
    if (!q || disabled) return;
    onSubmit(q);
    setValue('');
  };

  return (
    <div className="relative flex items-center gap-0">
      <div className="absolute left-3.5 text-nexus-dim pointer-events-none">
        <span className="font-mono-ops text-nexus-cyan">$</span>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Ask NEXUS anything... e.g. 'why is my system slow?'"
        disabled={disabled}
        className={cn(
          'w-full pl-8 pr-12 py-3 rounded-lg border border-nexus bg-nexus-surface-2',
          'text-sm text-white placeholder:text-nexus-dim',
          'focus:outline-none input-nexus transition-shadow',
          'font-mono disabled:opacity-50',
        )}
      />
      <button
        onClick={submit}
        disabled={disabled || !value.trim()}
        className="absolute right-2 p-1.5 rounded text-nexus-dim hover:text-nexus-cyan disabled:opacity-30 transition-colors"
      >
        {disabled ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}

// ── Example prompts ───────────────────────────────────────────────────────────
const EXAMPLE_PROMPTS = [
  'why is my system slow?',
  'nginx is not working, please diagnose and fix it',
  'why is nginx returning errors?',
];

// ── Main InvestigationView, wired to the real backend ─────────────────────────
export function InvestigationView() {
  const [query, setQuery] = useState<string | null>(null);
  const [visible, setVisible] = useState<InvestigationEvent[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visible]);

  useEffect(() => {
    // Abort any in-flight stream on unmount.
    return () => abortRef.current?.();
  }, []);

  const handleSubmit = (q: string) => {
    abortRef.current?.();
    setQuery(q);
    setVisible([]);
    setActionId(null);
    setStreaming(true);

    abortRef.current = streamInvestigation(
      q,
      (event) => {
        setVisible((prev) => [...prev, event]);
        if (event.stage === 'complete' || event.stage === 'blocked') {
          setStreaming(false);
        }
      },
      (id) => setActionId(id),
    );
  };

  const handleApprove = async () => {
    if (!actionId) return;
    try {
      const result = await approveAction(actionId);
      setVisible((prev) => [
        ...prev,
        {
          stage: 'verifying',
          timestamp: new Date().toISOString(),
          label: `Verification: ${result.status}`,
          verification: result,
        },
      ]);
    } catch (err) {
      setVisible((prev) => [
        ...prev,
        {
          stage: 'blocked',
          timestamp: new Date().toISOString(),
          label: 'Approval failed',
          safety_block: {
            reason: (err as Error).message,
            policy_rule: 'n/a',
            triggered_by: 'approval',
          },
        },
      ]);
    } finally {
      setActionId(null);
    }
  };

  const handleDeny = async () => {
    if (!actionId) return;
    try {
      await denyAction(actionId);
      setVisible((prev) => [
        ...prev,
        {
          stage: 'complete',
          timestamp: new Date().toISOString(),
          label: 'Action denied by user',
        },
      ]);
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Query input — pinned top */}
      <div className="p-4 border-b border-nexus">
        <QueryInput onSubmit={handleSubmit} disabled={streaming} />

        {/* Example chips */}
        {!query && (
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => handleSubmit(p)}
                className="text-[11px] font-mono px-2.5 py-1 rounded border border-nexus text-nexus-dim hover:border-cyan-700 hover:text-nexus-cyan transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto p-4 space-y-0">
        {!query && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <Cpu className="h-10 w-10 text-nexus-dim/40" />
            <p className="text-sm text-nexus-dim">
              Type a question above or pick an example to start an investigation.
            </p>
          </div>
        )}

        {query && (
          <div className="mb-4 animate-fade-in">
            <div className="flex items-center gap-2 mb-1">
              <Circle className="h-1.5 w-1.5 fill-nexus-cyan text-nexus-cyan flex-shrink-0" />
              <span className="text-[10px] tracking-widest text-nexus-dim uppercase">Query</span>
            </div>
            <p className="text-sm font-mono text-white pl-3.5">{query}</p>
          </div>
        )}

        {visible.map((event, i) => (
          <div key={`${event.stage}-${i}`} className="animate-slide-in-up">
            <StageCard
              event={event}
              isLast={i === visible.length - 1 && !streaming}
              onApprove={handleApprove}
              onDeny={handleDeny}
            />
          </div>
        ))}

        {streaming && (
          <div className="flex items-center gap-2 pl-9 text-nexus-dim animate-fade-in">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="text-xs font-mono">investigating...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}