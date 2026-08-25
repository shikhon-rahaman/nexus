// ============================================================================
// lib/api.ts — real backend client, translating raw SSE events from
// NEXUS's FastAPI backend into the InvestigationEvent shape defined in
// types/nexus.ts, so existing components (DiagnosisCard, ActionApprovalCard,
// VerificationCard, SafetyBlockCard) work unchanged.
// ============================================================================
import type {
    InvestigationEvent,
    DiagnosisResult,
    VerificationResult,
    RiskLevel,
} from '@/types/nexus';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface RawBackendEvent {
    state: string;
    payload: Record<string, any>;
}

function riskLevelFromBackend(risk: string | undefined): RiskLevel {
    if (risk === 'HIGH') return 'high';
    if (risk === 'MEDIUM') return 'medium';
    return 'low';
}

function toEvidenceItem(e: Record<string, any>) {
    return {
        source: e.tool_name || 'unknown',
        summary:
            Object.entries(e.parsed_metrics || {})
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ') || 'no metrics parsed',
        raw: e.raw_output,
    };
}

function toDiagnosisResult(payload: Record<string, any>): DiagnosisResult {
    return {
        root_cause: payload.root_cause,
        confidence: Math.round((payload.confidence ?? 0) * 100),
        is_heuristic: payload.is_heuristic ?? true,
        evidence: (payload.supporting_evidence || []).map(toEvidenceItem),
    };
}

function translateEvent(raw: RawBackendEvent): InvestigationEvent | null {
    const timestamp = new Date().toISOString();

    switch (raw.state) {
        case 'RECEIVED':
        case 'CLASSIFIED':
            return null;

        case 'INVESTIGATING':
            return {
                stage: 'understanding',
                timestamp,
                label: 'Investigating',
                detail: 'Collecting evidence from allowlisted tools.',
            };

        case 'EVIDENCE_COLLECTED':
            return {
                stage: 'collecting',
                timestamp,
                label: `Evidence collected: ${raw.payload.tool}`,
                detail: Object.entries(raw.payload.metrics || {})
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(', '),
            };

        case 'SAFETY_CHECK':
            if (raw.payload.allowed === false) {
                return {
                    stage: 'blocked',
                    timestamp,
                    label: 'Safety Engine blocked action',
                    safety_block: {
                        reason: raw.payload.reason || 'Blocked by safety policy.',
                        policy_rule: (raw.payload.rules_triggered || []).join(', ') || 'unspecified',
                        triggered_by: raw.payload.tool || 'unknown tool',
                    },
                };
            }
            return null;

        case 'DIAGNOSING':
            return { stage: 'diagnosing', timestamp, label: 'Analysing evidence' };

        case 'DIAGNOSIS_READY':
            return {
                stage: 'root_cause',
                timestamp,
                label: 'Root cause identified',
                diagnosis: toDiagnosisResult(raw.payload),
            };

        case 'ACTION_PROPOSED':
            return {
                stage: 'proposing_action',
                timestamp,
                label: 'Proposing action',
                action: {
                    description: `${raw.payload.tool_call?.tool_name}(${JSON.stringify(
                        raw.payload.tool_call?.arguments || {}
                    )})`,
                    command: `${raw.payload.tool_call?.tool_name} ${JSON.stringify(
                        raw.payload.tool_call?.arguments || {}
                    )}`,
                    risk_level: riskLevelFromBackend(raw.payload.tool_call?.risk_level),
                    risk_reason: `Reversibility: ${raw.payload.reversibility || 'unknown'}`,
                },
            };

        case 'WAITING_FOR_APPROVAL':
            return { stage: 'awaiting_approval', timestamp, label: 'Awaiting your approval' };

        case 'EXECUTING':
            return { stage: 'executing', timestamp, label: 'Executing approved action' };

        case 'VERIFYING':
            return { stage: 'verifying', timestamp, label: 'Verifying result' };

        case 'COMPLETED':
            return { stage: 'complete', timestamp, label: 'Investigation complete' };

        case 'FAILED':
            return {
                stage: 'blocked',
                timestamp,
                label: 'Investigation failed',
                safety_block: {
                    reason: raw.payload.reason || 'Investigation failed.',
                    policy_rule: (raw.payload.rules_triggered || []).join(', ') || 'n/a',
                    triggered_by: 'orchestrator',
                },
            };

        default:
            return null;
    }
}

/**
 * Streams an investigation from the real backend. Calls onEvent for each
 * translated InvestigationEvent as it arrives, and onActionId whenever an
 * action_id becomes available (needed for approve/deny calls).
 * Returns an abort function.
 */
export function streamInvestigation(
    query: string,
    onEvent: (event: InvestigationEvent) => void,
    onActionId: (actionId: string) => void
): () => void {
    const controller = new AbortController();

    (async () => {
        try {
            const response = await fetch(`${API_BASE}/api/investigate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query }),
                signal: controller.signal,
            });

            if (!response.ok || !response.body) {
                onEvent({
                    stage: 'blocked',
                    timestamp: new Date().toISOString(),
                    label: 'Connection failed',
                    safety_block: {
                        reason: `Backend request failed with status ${response.status}.`,
                        policy_rule: 'n/a',
                        triggered_by: 'connection',
                    },
                });
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const frames = buffer.split('\n\n');
                buffer = frames.pop() || '';

                for (const frame of frames) {
                    const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
                    if (!dataLine) continue;

                    try {
                        const raw: RawBackendEvent = JSON.parse(dataLine.slice(5).trim());

                        if (raw.payload?.action_id) {
                            onActionId(raw.payload.action_id);
                        }

                        const translated = translateEvent(raw);
                        if (translated) onEvent(translated);
                    } catch {
                        continue;
                    }
                }
            }
        } catch (err) {
            if ((err as Error).name === 'AbortError') return;
            onEvent({
                stage: 'blocked',
                timestamp: new Date().toISOString(),
                label: 'Connection lost',
                safety_block: {
                    reason: 'Lost connection to the NEXUS backend.',
                    policy_rule: 'n/a',
                    triggered_by: 'connection',
                },
            });
        }
    })();

    return () => controller.abort();
}

export async function approveAction(actionId: string): Promise<VerificationResult> {
    const response = await fetch(`${API_BASE}/api/actions/${actionId}/approve`, {
        method: 'POST',
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.detail || 'Approval failed.');
    return {
        checks: (body.checks || []).map((c: any) => ({ name: c.check, passed: c.passed })),
        status: body.status,
        summary:
            body.status === 'RESOLVED'
                ? 'Action executed and verified successfully.'
                : 'Verification did not confirm the fix.',
    };
}

export async function denyAction(actionId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/actions/${actionId}/deny`, {
        method: 'POST',
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Deny failed.');
    }
}

export async function checkHealth(): Promise<boolean> {
    try {
        const response = await fetch(`${API_BASE}/api/health`);
        return response.ok;
    } catch {
        return false;
    }
}