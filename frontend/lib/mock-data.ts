// ============================================================================
// lib/mock-data.ts — hardcoded sample data for standalone UI development
// Replace with fetch() / SSE calls when wiring to the backend.
// All data adheres to types/nexus.ts shapes.
// ============================================================================
import type {
  Operation,
  SystemStat,
  ServiceStatus,
  InvestigationEvent,
  DiagnosisResult,
  ProposedAction,
  VerificationResult,
  SafetyBlock,
} from '@/types/nexus';

// ── Live system stats (sidebar) ──────────────────────────────────────────────
export const MOCK_SYSTEM_STATS: SystemStat[] = [
  { label: 'CPU', value: 78, unit: '%', warning: true },
  { label: 'RAM', value: 91, unit: '%', critical: true },
  { label: 'Swap', value: 34, unit: '%' },
  { label: 'Disk /', value: 62, unit: '%' },
  { label: 'Load avg', value: 3.82, unit: '(1m)' },
];

// ── Service health list (sidebar) ────────────────────────────────────────────
export const MOCK_SERVICES: ServiceStatus[] = [
  { name: 'nginx',       status: 'running',  pid: 1234,  uptime: '3d 14h' },
  { name: 'worker.py',   status: 'running',  pid: 5678,  uptime: '0h 04m' },
  { name: 'postgresql',  status: 'running',  pid: 9101,  uptime: '3d 14h' },
  { name: 'redis',       status: 'degraded', uptime: '0h 01m' },
  { name: 'supervisor',  status: 'running',  pid: 1,     uptime: '3d 14h' },
  { name: 'fail2ban',    status: 'stopped' },
];

// ── Diagnosis (shared across scenarios) ─────────────────────────────────────
export const MOCK_DIAGNOSIS: DiagnosisResult = {
  root_cause:
    'Python worker process (PID 5678) is leaking memory via a growing list of bytearray objects. RSS has climbed from 5 MB to 1.1 GB in 4 minutes. No GC pressure visible — allocations are intentionally retained.',
  confidence: 87,
  is_heuristic: true,
  evidence: [
    {
      source: '/proc/5678/status',
      summary: 'Worker RSS = 1,126 MB, up from 5 MB (baseline)',
      raw: 'VmRSS:   1153024 kB\nVmSize:  1320448 kB\nVmPeak:  1321984 kB',
    },
    {
      source: 'top (1s snapshot)',
      summary: '%MEM=73.2% — worker is the dominant consumer',
      raw: '  PID USER  PR  NI    VIRT    RES    SHR S  %CPU  %MEM   TIME+ COMMAND\n 5678 root  20   0 1320m 1126m   8m  S   2.3  73.2   4:02.11 python3',
    },
    {
      source: '/proc/5678/smaps_rollup',
      summary: 'Anonymous pages account for 97% of RSS — heap leak pattern',
      raw: 'Anonymous:      1089536 kB\nShared_Clean:     12288 kB\nPrivate_Dirty:  1089536 kB',
    },
    {
      source: 'dmesg (last 60s)',
      summary: 'No OOM events yet — kernel has not started killing processes',
      raw: '[ 4321.882] Nothing logged — oom_killer not triggered',
    },
  ],
};

// ── Proposed action ──────────────────────────────────────────────────────────
export const MOCK_ACTION: ProposedAction = {
  description:
    'Restart the worker process via supervisorctl. This clears the in-memory allocation list immediately and returns RSS to baseline (~5 MB). The process will be re-supervised automatically.',
  command: 'supervisorctl restart worker',
  risk_level: 'low',
  risk_reason:
    'supervisorctl restart is atomic and supervised. The worker has no persistent state — no data is lost. nginx continues serving during the restart.',
};

// ── Verification result ──────────────────────────────────────────────────────
export const MOCK_VERIFICATION: VerificationResult = {
  checks: [
    { name: 'worker process restarted',           passed: true,  detail: 'PID changed: 5678 → 6789' },
    { name: 'worker RSS < 20 MB',                 passed: true,  detail: 'RSS = 6.2 MB (baseline)' },
    { name: 'nginx still serving (HTTP 200)',      passed: true,  detail: 'curl http://localhost:80/ → 200 OK' },
    { name: 'supervisord shows worker RUNNING',   passed: true,  detail: 'uptime 0:00:03' },
    { name: 'system free memory recovered',       passed: true,  detail: 'Available: 5.8 GB (+4.1 GB)' },
  ],
  status: 'RESOLVED',
  summary: 'All 5 checks passed. System memory pressure resolved.',
};

// ── Safety block scenario ────────────────────────────────────────────────────
export const MOCK_SAFETY_BLOCK: SafetyBlock = {
  reason:
    "The proposed command attempts to delete files in /var/log/ matching a wildcard pattern. Bulk deletion of system log files is classified as destructive and irreversible under the active safety policy.",
  policy_rule: 'POLICY-007: Wildcard file deletion in system directories is blocked.',
  triggered_by: 'rm -rf /var/log/*.gz',
};

// ── Investigation event stream (in-progress memory fault scenario) ───────────
export const MOCK_INVESTIGATION_EVENTS: InvestigationEvent[] = [
  {
    stage: 'understanding',
    timestamp: '2026-08-20T01:32:01Z',
    label: 'Understanding request',
    detail: 'Parsed intent: diagnose high memory usage. Scope: all running processes. No destructive actions inferred.',
  },
  {
    stage: 'collecting',
    timestamp: '2026-08-20T01:32:02Z',
    label: 'Collecting evidence',
    detail: 'Running: top, /proc/*/status, /proc/meminfo, dmesg, journalctl, smaps_rollup for top-5 consumers.',
  },
  {
    stage: 'diagnosing',
    timestamp: '2026-08-20T01:32:05Z',
    label: 'Analysing evidence',
    detail: 'Correlating RSS growth rate with smaps anonymous page data. Checking GC and OOM kill history.',
  },
  {
    stage: 'root_cause',
    timestamp: '2026-08-20T01:32:08Z',
    label: 'Root cause found',
    detail: 'Memory leak isolated to worker.py PID 5678.',
    diagnosis: MOCK_DIAGNOSIS,
  },
  {
    stage: 'proposing_action',
    timestamp: '2026-08-20T01:32:09Z',
    label: 'Proposing remediation',
    detail: 'Action selected: supervisorctl restart worker (risk: low)',
    action: MOCK_ACTION,
  },
];

// ── Completed operation (history) ────────────────────────────────────────────
export const MOCK_COMPLETED_OPERATION: Operation = {
  id: 'op-001',
  query: 'why is the system slow and running out of memory?',
  timestamp: '2026-08-20T01:32:00Z',
  status: 'RESOLVED',
  events: [
    ...MOCK_INVESTIGATION_EVENTS,
    {
      stage: 'executing',
      timestamp: '2026-08-20T01:32:15Z',
      label: 'Executing approved action',
      detail: 'Running: supervisorctl restart worker',
    },
    {
      stage: 'verifying',
      timestamp: '2026-08-20T01:32:18Z',
      label: 'Verifying resolution',
      detail: 'Running 5 verification checks...',
      verification: MOCK_VERIFICATION,
    },
  ],
  diagnosis: MOCK_DIAGNOSIS,
  action: MOCK_ACTION,
  verification: MOCK_VERIFICATION,
};

export const MOCK_BLOCKED_OPERATION: Operation = {
  id: 'op-002',
  query: 'clean up old log files to free disk space',
  timestamp: '2026-08-20T00:18:44Z',
  status: 'BLOCKED',
  events: [
    {
      stage: 'understanding',
      timestamp: '2026-08-20T00:18:44Z',
      label: 'Understanding request',
      detail: 'Parsed intent: delete log files. Scope: /var/log/. Destructive action detected.',
    },
    {
      stage: 'blocked',
      timestamp: '2026-08-20T00:18:45Z',
      label: 'Safety Engine blocked action',
      safety_block: MOCK_SAFETY_BLOCK,
    },
  ],
  safety_block: MOCK_SAFETY_BLOCK,
};

export const MOCK_FAILED_OPERATION: Operation = {
  id: 'op-003',
  query: 'why is nginx returning 502 errors?',
  timestamp: '2026-08-19T22:05:11Z',
  status: 'FAILED',
  events: [],
  diagnosis: {
    root_cause: 'nginx config syntax error causing reload failure. Old worker processes still serving but new config not applied.',
    confidence: 92,
    is_heuristic: false,
    evidence: [
      { source: 'nginx -t', summary: 'nginx: [emerg] invalid directive at /etc/nginx/sites-enabled/nexus.conf:12' },
      { source: '/var/log/nginx/error.log', summary: '3 config reload failures in 10 minutes' },
    ],
  },
  verification: {
    checks: [
      { name: 'nginx config is valid',           passed: false, detail: 'nginx -t still reports syntax error' },
      { name: 'nginx reloaded successfully',     passed: false, detail: 'SIGHUP rejected by master' },
      { name: 'HTTP 200 on localhost:80',         passed: true,  detail: 'Old worker still serving' },
    ],
    status: 'FAILED',
    summary: '2 of 3 checks failed. Manual intervention required.',
  },
};

// ── Full operation history ────────────────────────────────────────────────────
export const MOCK_OPERATION_HISTORY: Operation[] = [
  MOCK_COMPLETED_OPERATION,
  MOCK_BLOCKED_OPERATION,
  MOCK_FAILED_OPERATION,
  {
    id: 'op-004',
    query: 'what processes are consuming the most CPU?',
    timestamp: '2026-08-19T21:33:00Z',
    status: 'RESOLVED',
    events: [],
  },
  {
    id: 'op-005',
    query: 'check disk I/O wait times',
    timestamp: '2026-08-19T20:11:22Z',
    status: 'PARTIAL',
    events: [],
    verification: {
      checks: [
        { name: 'iostat data collected', passed: true },
        { name: 'I/O wait reduced below 5%', passed: false, detail: 'Still at 12%' },
      ],
      status: 'PARTIAL',
      summary: 'Partial resolution — I/O wait reduced from 42% to 12% but target not met.',
    },
  },
];
