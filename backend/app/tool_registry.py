"""
NEXUS Tool Registry.

Every function here is the ONLY way the system touches the Linux sandbox.
Each one:
  - takes structured, validated arguments (never a raw shell string)
  - runs with a timeout
  - returns an Evidence object with parsed_metrics, never just raw text
  - is called ONLY after safety_engine.evaluate() has approved the ToolCall

This file has zero LLM involvement. It should be unit-testable against
a real container without touching app/orchestrator.py at all.
"""
from __future__ import annotations
import subprocess
import re
from app.schemas import Evidence

TIMEOUT = 8


def _run(cmd: list[str]) -> str:
    """Run an allowlisted command with a fixed argv list — never shell=True,
    so there is no shell metacharacter interpretation possible."""
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=TIMEOUT, shell=False
        )
        return (result.stdout or result.stderr or "").strip()[:8000]
    except subprocess.TimeoutExpired:
        return "__TIMEOUT__"
    except FileNotFoundError:
        return "__TOOL_NOT_FOUND__"


def get_memory() -> Evidence:
    raw = _run(["free", "-m"])
    metrics = {}
    for line in raw.splitlines():
        if line.startswith("Mem:"):
            parts = line.split()
            total, used = int(parts[1]), int(parts[2])
            metrics = {"ram_total_mb": total, "ram_used_mb": used,
                       "ram_pct": round(used / total * 100, 1) if total else 0}
        if line.startswith("Swap:"):
            parts = line.split()
            total, used = int(parts[1]), int(parts[2])
            metrics["swap_total_mb"] = total
            metrics["swap_used_mb"] = used
            metrics["swap_pct"] = round(used / total * 100, 1) if total else 0
    return Evidence(tool_name="get_memory", raw_output=raw, parsed_metrics=metrics, trust_level="system_verified")


def get_cpu() -> Evidence:
    raw = _run(["uptime"])
    load = None
    m = re.search(r"load average:\s*([\d.]+)", raw)
    if m:
        load = float(m.group(1))
    return Evidence(tool_name="get_cpu", raw_output=raw, parsed_metrics={"load_1min": load}, trust_level="system_verified")


def get_disk() -> Evidence:
    raw = _run(["df", "-h", "/"])
    metrics = {}
    lines = raw.splitlines()
    if len(lines) >= 2:
        parts = lines[1].split()
        if len(parts) >= 5:
            metrics = {"size": parts[1], "used": parts[2], "avail": parts[3], "use_pct": parts[4]}
    return Evidence(tool_name="get_disk", raw_output=raw, parsed_metrics=metrics, trust_level="system_verified")


def list_processes(top_n: int = 5) -> Evidence:
    raw = _run(["ps", "aux", "--sort=-%mem"])
    lines = raw.splitlines()[1:top_n + 1]
    procs = []
    for line in lines:
        parts = line.split(None, 10)
        if len(parts) >= 11:
            procs.append({"pid": int(parts[1]), "mem_pct": float(parts[3]), "cmd": parts[10][:60]})
    return Evidence(tool_name="list_processes", raw_output=raw, parsed_metrics={"top_processes": procs}, trust_level="system_verified")


def service_status(service_name: str) -> Evidence:
    raw = _run(["systemctl", "status", service_name, "--no-pager"])
    active = "active (running)" in raw
    return Evidence(tool_name="service_status", raw_output=raw,
                     parsed_metrics={"service": service_name, "active": active},
                     trust_level="system_verified")


def read_logs(unit: str, lines: int = 50) -> Evidence:
    raw = _run(["journalctl", "-u", unit, "-n", str(lines), "--no-pager"])
    raw = _redact_secrets(raw)
    return Evidence(tool_name="read_logs", raw_output=raw, parsed_metrics={"unit": unit, "line_count": lines},
                     trust_level="log_derived")


def list_ports() -> Evidence:
    raw = _run(["ss", "-tulwn"])
    return Evidence(tool_name="list_ports", raw_output=raw, parsed_metrics={}, trust_level="system_verified")


def restart_service(service_name: str) -> Evidence:
    raw = _run(["systemctl", "restart", service_name])
    return Evidence(tool_name="restart_service", raw_output=raw or "OK",
                     parsed_metrics={"service": service_name}, trust_level="system_verified")


def kill_process(pid: int) -> Evidence:
    raw = _run(["kill", "-15", str(pid)])
    return Evidence(tool_name="kill_process", raw_output=raw or "OK",
                     parsed_metrics={"pid": pid}, trust_level="system_verified")


_SECRET_PATTERNS = [
    re.compile(r"(api[_-]?key\s*[:=]\s*)([^\s]+)", re.I),
    re.compile(r"(password\s*[:=]\s*)([^\s]+)", re.I),
    re.compile(r"(secret\s*[:=]\s*)([^\s]+)", re.I),
    re.compile(r"(token\s*[:=]\s*)([^\s]+)", re.I),
]


def _redact_secrets(text: str) -> str:
    for pattern in _SECRET_PATTERNS:
        text = pattern.sub(r"\1[REDACTED]", text)
    return text


REGISTRY = {
    "get_memory": get_memory,
    "get_cpu": get_cpu,
    "get_disk": get_disk,
    "list_processes": list_processes,
    "service_status": service_status,
    "read_logs": read_logs,
    "list_ports": list_ports,
    "restart_service": restart_service,
    "kill_process": kill_process,
}
