"""
NEXUS Safety Engine.

CRITICAL DESIGN RULE: the LLM never constructs a shell string. It can only
select a tool_name from ALLOWED_TOOLS and pass arguments, which are then
validated here BEFORE anything touches the Linux sandbox. If validation
fails at any layer, the call is BLOCKED and the reason is logged for audit.

Layers (in order):
  1. Tool allowlist        - is this even a known tool?
  2. Argument schema        - are the argument names/types correct?
  3. Argument value check   - is the value in the allowed set (e.g. service name)?
  4. Path validation        - if a path argument exists, is it inside safe roots?
  5. Risk classification    - what tier is this call?
  6. Approval policy        - does this tier require human approval?
"""
from __future__ import annotations
from dataclasses import dataclass, field
from app.schemas import RiskAssessment, ToolCall

# ---- 1. Tool allowlist + static risk tiers -------------------------------

TOOL_RISK: dict[str, str] = {
    "get_memory": "READ_ONLY",
    "get_cpu": "READ_ONLY",
    "get_disk": "READ_ONLY",
    "list_processes": "READ_ONLY",
    "service_status": "READ_ONLY",
    "check_nginx_config": "READ_ONLY",
    "read_logs": "READ_ONLY",
    "list_ports": "READ_ONLY",
    "search_files": "READ_ONLY",
    "restart_service": "MEDIUM",
    "kill_process": "HIGH",
}

# ---- 2/3. Argument allowlists ---------------------------------------------
# Closed enums populated from the sandbox's actual state at startup.
# The LLM cannot pass a value outside these sets, even via prompt injection.

ALLOWED_SERVICES = {"nginx", "sshd", "docker", "python-worker"}
ALLOWED_LOG_UNITS = ALLOWED_SERVICES
SAFE_SEARCH_ROOTS = {"/etc", "/var/log", "/opt/app"}

# Requests requiring human approval before EXECUTING
APPROVAL_REQUIRED_TIERS = {"MEDIUM", "HIGH"}

# Patterns that are never acceptable, checked defensively even though
# structured arguments should make injection impossible.
DANGEROUS_SUBSTRINGS = [";", "&&", "||", "|", "`", "$(", "\n", "..", "~"]


@dataclass
class SafetyDecision:
    allowed: bool
    risk_level: str
    reason: str | None = None
    rules_triggered: list[str] = field(default_factory=list)
    requires_approval: bool = False


def _has_dangerous_chars(value: str) -> bool:
    return any(bad in value for bad in DANGEROUS_SUBSTRINGS)


def _validate_path(path: str) -> bool:
    return any(path.startswith(root) for root in SAFE_SEARCH_ROOTS) and not _has_dangerous_chars(path)


def evaluate(tool_call: ToolCall) -> SafetyDecision:
    rules_triggered: list[str] = []

    # Layer 1 — allowlist
    if tool_call.tool_name not in TOOL_RISK:
        return SafetyDecision(
            allowed=False, risk_level="BLOCKED",
            reason=f"'{tool_call.tool_name}' is not a registered tool.",
            rules_triggered=["UNKNOWN_TOOL"],
        )

    risk = TOOL_RISK[tool_call.tool_name]

    # Layer 2/3 — per-tool argument validation
    args = tool_call.arguments

    if tool_call.tool_name in ("restart_service", "service_status") :
        name = args.get("service_name", "")
        if _has_dangerous_chars(str(name)):
            rules_triggered.append("DANGEROUS_CHARS_IN_ARG")
        if name not in ALLOWED_SERVICES:
            return SafetyDecision(
                allowed=False, risk_level="BLOCKED",
                reason=f"'{name}' is not an allowlisted service.",
                rules_triggered=rules_triggered + ["SERVICE_NOT_ALLOWLISTED"],
            )

    if tool_call.tool_name == "read_logs":
        unit = args.get("unit", "")
        if unit not in ALLOWED_LOG_UNITS:
            return SafetyDecision(
                allowed=False, risk_level="BLOCKED",
                reason=f"'{unit}' is not an allowlisted log unit.",
                rules_triggered=["LOG_UNIT_NOT_ALLOWLISTED"],
            )
        lines = args.get("lines", 50)
        if not isinstance(lines, int) or lines > 500:
            return SafetyDecision(
                allowed=False, risk_level="BLOCKED",
                reason="Log line count exceeds safe limit (500).",
                rules_triggered=["OUTPUT_LIMIT_EXCEEDED"],
            )

    if tool_call.tool_name == "search_files":
        path = args.get("path", "")
        if not _validate_path(path):
            return SafetyDecision(
                allowed=False, risk_level="BLOCKED",
                reason=f"Path '{path}' is outside allowed search roots or contains unsafe characters.",
                rules_triggered=["PATH_TRAVERSAL_BLOCKED"],
            )

    if tool_call.tool_name == "kill_process":
        pid = args.get("pid")
        if not isinstance(pid, int) or pid <= 1:
            return SafetyDecision(
                allowed=False, risk_level="BLOCKED",
                reason="Refusing to kill PID 0/1 or non-integer PID (would destabilize the sandbox).",
                rules_triggered=["PROTECTED_PID"],
            )

    # Layer 5/6 — risk + approval
    requires_approval = risk in APPROVAL_REQUIRED_TIERS
    return SafetyDecision(
        allowed=True, risk_level=risk,
        rules_triggered=rules_triggered,
        requires_approval=requires_approval,
    )


def to_risk_assessment(action_id: str, decision: SafetyDecision) -> RiskAssessment:
    return RiskAssessment(
        action_id=action_id,
        risk_level=decision.risk_level,
        blocked=not decision.allowed,
        blocked_reason=decision.reason,
        policy_rules_triggered=decision.rules_triggered,
    )
