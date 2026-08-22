"""
NEXUS core data contracts.
Every layer of the system communicates through these schemas —
never raw dicts, never free-text between the LLM and the executor.
"""
from __future__ import annotations
from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field

RiskLevel = Literal["READ_ONLY", "LOW", "MEDIUM", "HIGH", "BLOCKED"]
Reversibility = Literal["FULLY_REVERSIBLE", "PARTIALLY_REVERSIBLE", "NOT_REVERSIBLE"]


class Intent(BaseModel):
    raw_query: str
    intent_type: Literal["diagnostic", "action", "search", "history_query"]
    target_domain: Literal["cpu", "memory", "disk", "network", "service", "file", "unknown"]
    confidence: float = Field(ge=0, le=1)


class ToolCall(BaseModel):
    tool_name: str
    arguments: dict
    risk_level: RiskLevel
    timeout_seconds: int = 10
    output_limit_bytes: int = 8000


class Evidence(BaseModel):
    tool_name: str
    raw_output: str
    parsed_metrics: dict
    collected_at: datetime = Field(default_factory=datetime.utcnow)
    trust_level: Literal["system_verified", "log_derived"]


class Diagnosis(BaseModel):
    root_cause: str
    confidence: float = Field(ge=0, le=1)
    confidence_basis: str
    supporting_evidence: list[Evidence]
    is_heuristic: bool = True


class ActionPlan(BaseModel):
    action_id: str
    tool_call: ToolCall
    reversibility: Reversibility
    pre_state_snapshot: Optional[dict] = None
    requires_approval: bool = True


class RiskAssessment(BaseModel):
    action_id: str
    risk_level: RiskLevel
    blocked: bool
    blocked_reason: Optional[str] = None
    policy_rules_triggered: list[str] = []


class VerificationResult(BaseModel):
    action_id: str
    checks: list[dict]
    status: Literal["RESOLVED", "FAILED", "PARTIAL"]
    rollback_available: bool


class OperationRecord(BaseModel):
    """One row of the audit trail — this is your 'operational memory'."""
    operation_id: str
    user_query: str
    intent: Intent
    evidence: list[Evidence]
    diagnosis: Optional[Diagnosis] = None
    action: Optional[ActionPlan] = None
    risk_assessment: Optional[RiskAssessment] = None
    verification: Optional[VerificationResult] = None
    state: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
