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
import os
import subprocess
import re
from app.schemas import Evidence

TIMEOUT = 8
SANDBOX_CONTAINER = os.getenv("NEXUS_SANDBOX_CONTAINER", "nexus-sandbox")
_CONTAINER_UNREACHABLE_MARKERS = (
    "cannot connect to the docker daemon",
    "error during connect",
    "no such container",
    "is not running",
    "docker desktop is not running",
)
_SUPERVISOR_PROGRAMS = {"python-worker": "worker"}
_SUPERVISOR_LOG_FILES = {
    "nginx": (
        "/var/log/supervisor/nginx.stdout.log",
        "/var/log/supervisor/nginx.stderr.log",
    ),
    "python-worker": (
        "/var/log/supervisor/worker.stdout.log",
        "/var/log/supervisor/worker.stderr.log",
    ),
}


def _run(cmd: list[str]) -> str:
    """Run an allowlisted command with a fixed argv list — never shell=True,
    so there is no shell metacharacter interpretation possible."""
    docker_cmd = ["docker", "exec", SANDBOX_CONTAINER] + cmd
    try:
        result = subprocess.run(
            docker_cmd, capture_output=True, text=True, timeout=TIMEOUT, shell=False
        )
        output = (result.stdout or result.stderr or "").strip()[:8000]
        if result.returncode and any(
            marker in output.lower() for marker in _CONTAINER_UNREACHABLE_MARKERS
        ):
            return f"__CONTAINER_UNREACHABLE__: {output}"[:8000]
        return output
    except subprocess.TimeoutExpired:
        return "__TIMEOUT__"
    except FileNotFoundError:
        return "__CONTAINER_UNREACHABLE__: Docker CLI not found."
    except OSError as exc:
        return f"__CONTAINER_UNREACHABLE__: {exc}"


def _cgroup_value(path: str) -> int | None:
    raw = _run(["cat", path])
    try:
        return int(raw)
    except ValueError:
        return None


def _cgroup_memory_metrics() -> tuple[str, dict] | None:
    v2_current = _cgroup_value("/sys/fs/cgroup/memory.current")
    v2_limit = _cgroup_value("/sys/fs/cgroup/memory.max")
    v2_swap_current = _cgroup_value("/sys/fs/cgroup/memory.swap.current")
    v2_swap_limit = _cgroup_value("/sys/fs/cgroup/memory.swap.max")
    if v2_current is not None and v2_limit is not None and v2_limit > 0:
        return (
            "\n".join(
                [
                    "cgroup_version=2",
                    f"memory.current={v2_current}",
                    f"memory.max={v2_limit}",
                    f"memory.swap.current={v2_swap_current or 0}",
                    f"memory.swap.max={v2_swap_limit or 0}",
                ]
            ),
            {
                "ram_total_mb": int(v2_limit / (1024 ** 2)),
                "ram_used_mb": int(v2_current / (1024 ** 2)),
                "ram_pct": round(v2_current / v2_limit * 100, 1),
                "swap_total_mb": int((v2_swap_limit or 0) / (1024 ** 2)),
                "swap_used_mb": int((v2_swap_current or 0) / (1024 ** 2)),
                "swap_pct": round(
                    (v2_swap_current or 0) / v2_swap_limit * 100, 1
                ) if v2_swap_limit else 0,
            },
        )

    v1_current = _cgroup_value("/sys/fs/cgroup/memory/memory.usage_in_bytes")
    v1_limit = _cgroup_value("/sys/fs/cgroup/memory/memory.limit_in_bytes")
    v1_memsw_current = _cgroup_value("/sys/fs/cgroup/memory/memory.memsw.usage_in_bytes")
    v1_memsw_limit = _cgroup_value("/sys/fs/cgroup/memory/memory.memsw.limit_in_bytes")
    if v1_current is not None and v1_limit is not None and v1_limit > 0:
        swap_current = max(0, (v1_memsw_current or v1_current) - v1_current)
        swap_limit = max(0, (v1_memsw_limit or v1_limit) - v1_limit)
        return (
            "\n".join(
                [
                    "cgroup_version=1",
                    f"memory.usage_in_bytes={v1_current}",
                    f"memory.limit_in_bytes={v1_limit}",
                    f"memory.memsw.usage_in_bytes={v1_memsw_current or v1_current}",
                    f"memory.memsw.limit_in_bytes={v1_memsw_limit or v1_limit}",
                ]
            ),
            {
                "ram_total_mb": int(v1_limit / (1024 ** 2)),
                "ram_used_mb": int(v1_current / (1024 ** 2)),
                "ram_pct": round(v1_current / v1_limit * 100, 1),
                "swap_total_mb": int(swap_limit / (1024 ** 2)),
                "swap_used_mb": int(swap_current / (1024 ** 2)),
                "swap_pct": round(swap_current / swap_limit * 100, 1) if swap_limit else 0,
            },
        )
    return None


def get_memory(**_ignored) -> Evidence:
    cgroup_metrics = _cgroup_memory_metrics()
    if cgroup_metrics is not None:
        raw, metrics = cgroup_metrics
        return Evidence(
            tool_name="get_memory",
            raw_output=raw,
            parsed_metrics=metrics,
            trust_level="system_verified",
        )

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


def get_cpu(**_ignored) -> Evidence:
    raw = _run(["uptime"])
    load = None
    m = re.search(r"load average:\s*([\d.]+)", raw)
    if m:
        load = float(m.group(1))
    return Evidence(tool_name="get_cpu", raw_output=raw, parsed_metrics={"load_1min": load}, trust_level="system_verified")


def get_disk(**_ignored) -> Evidence:
    raw = _run(["df", "-h", "/"])
    metrics = {}
    lines = raw.splitlines()
    if len(lines) >= 2:
        parts = lines[1].split()
        if len(parts) >= 5:
            metrics = {"size": parts[1], "used": parts[2], "avail": parts[3], "use_pct": parts[4]}
    return Evidence(tool_name="get_disk", raw_output=raw, parsed_metrics=metrics, trust_level="system_verified")


def list_processes(top_n: int = 5, **_ignored) -> Evidence:
    raw = _run(["ps", "aux", "--sort=-%mem"])
    lines = raw.splitlines()[1:top_n + 1]
    procs = []
    for line in lines:
        parts = line.split(None, 10)
        if len(parts) >= 11:
            procs.append({"pid": int(parts[1]), "mem_pct": float(parts[3]), "cmd": parts[10][:60]})
    return Evidence(tool_name="list_processes", raw_output=raw, parsed_metrics={"top_processes": procs}, trust_level="system_verified")


def service_status(service_name: str, **_ignored) -> Evidence:
    program_name = _SUPERVISOR_PROGRAMS.get(service_name, service_name)
    raw = _run(["supervisorctl", "status", program_name])
    active = bool(re.search(rf"^{re.escape(program_name)}\s+RUNNING\b", raw, re.MULTILINE))
    return Evidence(tool_name="service_status", raw_output=raw,
                     parsed_metrics={"service": service_name, "active": active},
                     trust_level="system_verified")


def check_nginx_config(**_ignored) -> Evidence:
    raw = _run(["nginx", "-t"])
    normalized_output = raw.lower()
    config_valid = "syntax is ok" in normalized_output and "test failed" not in normalized_output
    return Evidence(
        tool_name="check_nginx_config",
        raw_output=raw,
        parsed_metrics={"config_valid": config_valid, "error": None if config_valid else raw},
        trust_level="system_verified",
    )


def read_logs(unit: str, lines: int = 50, **_ignored) -> Evidence:
    log_files = _SUPERVISOR_LOG_FILES.get(unit)
    if log_files is None:
        raw = f"__SUPERVISOR_LOG_NOT_CONFIGURED__: {unit}"
    else:
        raw = _run(["tail", "-n", str(lines), *log_files])
    raw = _redact_secrets(raw)
    return Evidence(tool_name="read_logs", raw_output=raw, parsed_metrics={"unit": unit, "line_count": lines},
                     trust_level="log_derived")


def list_ports(**_ignored) -> Evidence:
    raw = _run(["ss", "-tulwn"])
    return Evidence(tool_name="list_ports", raw_output=raw, parsed_metrics={}, trust_level="system_verified")


def restart_service(service_name: str, **_ignored) -> Evidence:
    raw = _run(["systemctl", "restart", service_name])
    return Evidence(tool_name="restart_service", raw_output=raw or "OK",
                     parsed_metrics={"service": service_name}, trust_level="system_verified")


def kill_process(pid: int, **_ignored) -> Evidence:
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
    "check_nginx_config": check_nginx_config,
    "read_logs": read_logs,
    "list_ports": list_ports,
    "restart_service": restart_service,
    "kill_process": kill_process,
}
