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
import { MOCK_INVESTIGATION_EVENTS } from '@/lib/mock-data';

// ── Stage icon + color map ────────────────────────────────────────────────────
const STAGE_META = {
  understanding:      { icon: Search,        color: 'text-blue-400',    label: 'Understanding' },
  collecting:         { icon: Database,       color: 'text-cyan-400',    label: 'Collecting Evidence' },
  diagnosing:         { icon: Microscope,     color: 'text-purple-400',  label: 'Analysing' },
  root_cause:         { icon: Target,         color: 'text-nexus-cyan',  label: 'Root Cause Found' },
  proposing_action:   { icon: Wrench,         color: 'text-amber-400',   label: 'Proposing Action' },
  awaiting_approval:  { icon: ShieldCheck,    color: 'text-amber-400',   label: 'Awaiting Approval' },
  executing:          { icon: Play,           color: 'text-emerald-400', label: 'Executing' },
  verifying:          { icon: ClipboardList,  color: 'text-emerald-400', label: 'Verifying' },
  complete:           { icon: CheckCircle2,   color: 'text-emerald-400', label: 'Complete' },
  blocked:            { icon: ShieldAlert,    color: 'text-red-400',     label: 'Blocked' },
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

// ── Streaming simulation ──────────────────────────────────────────────────────
function useStreamedEvents(events: InvestigationEvent[], trigger: boolean) {
  const [visible, setVisible] = useState<InvestigationEvent[]>([]);
  const [streaming, setStreaming] = useState(false);
  const timeoutRefs = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!trigger) return;

    // Clear previous
    timeoutRefs.current.forEach(clearTimeout);
    timeoutRefs.current = [];
    setVisible([]);
    setStreaming(true);

    events.forEach((event, i) => {
      const t = setTimeout(
        () => {
          setVisible((prev) => [...prev, event]);
          if (i === events.length - 1) setStreaming(false);
        },
        800 + i * 1400,
      );
      timeoutRefs.current.push(t);
    });

    return () => timeoutRefs.current.forEach(clearTimeout);
  }, [trigger, events]);

  return { visible, streaming };
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
  'why is my system running out of memory?',
  'why is nginx returning errors?',
  'clean up old log files to free disk space',
];

// ── Main InvestigationView ────────────────────────────────────────────────────
export function InvestigationView() {
  const [query, setQuery] = useState<string | null>(null);
  const [trigger, setTrigger] = useState(false);
  const [approved, setApproved] = useState(false);

  const isSafetyScenario = query?.toLowerCase().includes('log') || query?.toLowerCase().includes('delete');

  const events = isSafetyScenario
    ? [
        {
          stage: 'understanding' as const,
          timestamp: new Date().toISOString(),
          label: 'Understanding request',
          detail: 'Parsed intent: delete log files. Scope: /var/log/. Destructive action detected.',
        },
        {
          stage: 'blocked' as const,
          timestamp: new Date(Date.now() + 1200).toISOString(),
          label: 'Safety Engine blocked action',
          safety_block: {
            reason:
              'The proposed command attempts to delete files in /var/log/ matching a wildcard pattern. Bulk deletion of system log files is classified as destructive and irreversible under the active safety policy.',
            policy_rule: 'POLICY-007: Wildcard file deletion in system directories is blocked.',
            triggered_by: 'rm -rf /var/log/*.gz',
          },
        },
      ]
    : MOCK_INVESTIGATION_EVENTS;

  const { visible, streaming } = useStreamedEvents(events, trigger);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visible]);

  const handleSubmit = (q: string) => {
    setQuery(q);
    setApproved(false);
    setTrigger(false);
    // Small delay so state resets before new stream starts
    setTimeout(() => setTrigger(true), 50);
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
          <div
            key={`${event.stage}-${i}`}
            style={{ animationDelay: `0ms` }}
            className="animate-slide-in-up"
          >
            <StageCard
              event={event}
              isLast={i === visible.length - 1 && !streaming}
              onApprove={() => setApproved(true)}
              onDeny={() => {}}
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
