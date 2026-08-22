// ============================================================================
// types/nexus.ts — shared data shapes for NEXUS frontend
// Structured to match the backend contract; mock data adheres to this shape
// so swapping mock → real API data requires only replacing data sources.
// ============================================================================

export type RiskLevel = 'low' | 'medium' | 'high';
export type OperationStatus = 'RESOLVED' | 'FAILED' | 'PARTIAL' | 'IN_PROGRESS' | 'BLOCKED';
export type InvestigationStage =
  | 'understanding'
  | 'collecting'
  | 'diagnosing'
  | 'root_cause'
  | 'proposing_action'
  | 'awaiting_approval'
  | 'executing'
  | 'verifying'
  | 'complete'
  | 'blocked';

export interface EvidenceItem {
  source: string;         // e.g. "top", "/proc/meminfo", "systemctl"
  summary: string;        // human-readable one-liner
  raw?: string;           // raw command output for expandable view
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface DiagnosisResult {
  root_cause: string;
  confidence: number;           // 0–100
  is_heuristic: boolean;
  evidence: EvidenceItem[];
}

export interface ProposedAction {
  description: string;
  command: string;              // exact shell command for transparency
  risk_level: RiskLevel;
  risk_reason: string;
}

export interface VerificationResult {
  checks: VerificationCheck[];
  status: OperationStatus;
  summary: string;
}

export interface SafetyBlock {
  reason: string;
  policy_rule: string;
  triggered_by: string;
}

export interface InvestigationEvent {
  stage: InvestigationStage;
  timestamp: string;            // ISO-8601
  label: string;
  detail?: string;
  diagnosis?: DiagnosisResult;
  action?: ProposedAction;
  verification?: VerificationResult;
  safety_block?: SafetyBlock;
}

export interface Operation {
  id: string;
  query: string;
  timestamp: string;            // ISO-8601
  status: OperationStatus;
  events: InvestigationEvent[];
  diagnosis?: DiagnosisResult;
  action?: ProposedAction;
  verification?: VerificationResult;
  safety_block?: SafetyBlock;
}

export interface SystemStat {
  label: string;
  value: number;    // 0–100 percentage OR raw number depending on unit
  unit: string;
  warning?: boolean;
  critical?: boolean;
}

export interface ServiceStatus {
  name: string;
  status: 'running' | 'stopped' | 'degraded' | 'unknown';
  pid?: number;
  uptime?: string;
}
