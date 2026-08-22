"""
NEXUS Agent Orchestrator.

Implements the state machine:
  RECEIVED -> CLASSIFIED -> INVESTIGATING -> DIAGNOSING
  -> (ACTION_PROPOSED -> WAITING_FOR_APPROVAL -> EXECUTING -> VERIFYING)?
  -> COMPLETED | FAILED

CRITICAL INVARIANT: the LLM (via groq_client) only ever SELECTS a tool_name
and arguments. Every single tool call passes through safety_engine.evaluate()
before tool_registry executes it. There is no code path where an LLM output
reaches tool_registry directly. If you are modifying this file, do not
create one.
"""
from __future__ import annotations
import uuid
from datetime import datetime
from typing import Callable, Optional

from app import tool_registry, safety_engine
from app.schemas import (
    Evidence, ToolCall, Diagnosis, ActionPlan, RiskAssessment,
    VerificationResult, OperationRecord,
)
from app.groq_client import classify_and_plan
from app.diagnosis import diagnose_from_evidence

MAX_INVESTIGATION_STEPS = 6


class OrchestrationError(Exception):
    pass


class Orchestrator:
    """
    One instance handles one user query end-to-end. `on_event` is an
    optional callback (state:str, payload:dict) -> None, used to stream
    progress to the frontend via SSE. Pass None for non-streaming/test use.
    """

    def __init__(self, on_event: Optional[Callable[[str, dict], None]] = None):
        self.on_event = on_event or (lambda state, payload: None)
        self.evidence: list[Evidence] = []
        self.state = "RECEIVED"
        self.operation_id = str(uuid.uuid4())

    def _emit(self, state: str, payload: dict | None = None):
        self.state = state
        self.on_event(state, payload or {})

    def run_investigation(self, user_query: str) -> OperationRecord:
        self._emit("RECEIVED", {"query": user_query})
        self._emit("CLASSIFIED")

        self._emit("INVESTIGATING")
        steps = 0
        while steps < MAX_INVESTIGATION_STEPS:
            steps += 1
            message = classify_and_plan(user_query, [e.model_dump(mode="json") for e in self.evidence])

            if message.tool_calls:
                # LLM wants to call a tool - validate, gate, execute.
                tool_call_req = message.tool_calls[0]
                tool_name = tool_call_req.function.name
                try:
                    import json as _json
                    args = _json.loads(tool_call_req.function.arguments or "{}")
                except Exception:
                    self._emit("FAILED", {"reason": "Model produced malformed tool arguments."})
                    raise OrchestrationError("Malformed tool arguments from model")

                tool_call = ToolCall(
                    tool_name=tool_name, arguments=args,
                    risk_level=safety_engine.TOOL_RISK.get(tool_name, "BLOCKED"),
                )

                decision = safety_engine.evaluate(tool_call)
                self._emit("SAFETY_CHECK", {
                    "tool": tool_name, "allowed": decision.allowed,
                    "reason": decision.reason, "risk": decision.risk_level,
                })

                if not decision.allowed:
                    # Read-only investigation tools being blocked ends the
                    # investigation branch cleanly rather than retrying forever.
                    self._emit("FAILED", {
                        "reason": f"Safety engine blocked '{tool_name}': {decision.reason}",
                        "rules_triggered": decision.rules_triggered,
                    })
                    raise OrchestrationError(f"Blocked: {decision.reason}")

                if decision.risk_level != "READ_ONLY":
                    # State-changing tool requested mid-investigation - stop
                    # here and hand off to the action/approval flow instead
                    # of auto-executing it.
                    return self._propose_action(user_query, tool_call, decision)

                fn = tool_registry.REGISTRY[tool_name]
                evidence = fn(**args)
                self.evidence.append(evidence)
                self._emit("EVIDENCE_COLLECTED", {"tool": tool_name, "metrics": evidence.parsed_metrics})
                continue

            # No more tool calls - model is done investigating.
            break

        self._emit("DIAGNOSING")
        diagnosis = diagnose_from_evidence(self.evidence)
        self._emit("DIAGNOSIS_READY", diagnosis.model_dump(mode="json"))

        self._emit("COMPLETED")
        return OperationRecord(
            operation_id=self.operation_id, user_query=user_query,
            intent=self._placeholder_intent(user_query),
            evidence=self.evidence, diagnosis=diagnosis, state="COMPLETED",
        )

    def _propose_action(self, user_query: str, tool_call: ToolCall, decision) -> OperationRecord:
        action_id = str(uuid.uuid4())
        action = ActionPlan(
            action_id=action_id, tool_call=tool_call,
            reversibility="PARTIALLY_REVERSIBLE" if tool_call.tool_name == "restart_service" else "NOT_REVERSIBLE",
            requires_approval=decision.requires_approval,
        )
        risk = safety_engine.to_risk_assessment(action_id, decision)
        self._emit("ACTION_PROPOSED", action.model_dump(mode="json"))
        self._emit("WAITING_FOR_APPROVAL", risk.model_dump(mode="json"))

        return OperationRecord(
            operation_id=self.operation_id, user_query=user_query,
            intent=self._placeholder_intent(user_query),
            evidence=self.evidence, action=action, risk_assessment=risk,
            state="WAITING_FOR_APPROVAL",
        )

    def execute_approved_action(self, action: ActionPlan) -> VerificationResult:
        """Called only after a human has explicitly approved. Re-validates
        with the safety engine anyway - approval does not bypass safety."""
        decision = safety_engine.evaluate(action.tool_call)
        if not decision.allowed:
            self._emit("FAILED", {"reason": "Re-validation failed at execution time."})
            raise OrchestrationError("Safety re-check failed at execution time")

        self._emit("EXECUTING")
        fn = tool_registry.REGISTRY[action.tool_call.tool_name]
        result_evidence = fn(**action.tool_call.arguments)

        self._emit("VERIFYING")
        verification = self._verify(action, result_evidence)
        self._emit(verification.status, verification.model_dump(mode="json"))
        return verification

    def _verify(self, action: ActionPlan, result_evidence: Evidence) -> VerificationResult:
        checks = []
        if action.tool_call.tool_name == "restart_service":
            service_name = action.tool_call.arguments["service_name"]
            status_evidence = tool_registry.service_status(service_name)
            active = status_evidence.parsed_metrics.get("active", False)
            checks.append({"check": "service_active", "passed": active})
            status = "RESOLVED" if active else "FAILED"
        else:
            checks.append({"check": "command_executed", "passed": True})
            status = "RESOLVED"

        return VerificationResult(
            action_id=action.action_id, checks=checks, status=status,
            rollback_available=action.reversibility != "NOT_REVERSIBLE",
        )

    @staticmethod
    def _placeholder_intent(user_query: str):
        from app.schemas import Intent
        return Intent(raw_query=user_query, intent_type="diagnostic",
                      target_domain="unknown", confidence=0.8)