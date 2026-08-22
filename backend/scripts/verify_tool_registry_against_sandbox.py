"""Run NEXUS registry tools against an already-running Docker sandbox."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.tool_registry import (
    get_cpu,
    get_disk,
    get_memory,
    list_ports,
    list_processes,
    service_status,
)


def main() -> None:
    checks = [
        ("get_memory", get_memory),
        ("get_cpu", get_cpu),
        ("get_disk", get_disk),
        ("list_processes", list_processes),
        ("service_status(nginx)", lambda: service_status("nginx")),
        ("list_ports", list_ports),
    ]

    for name, tool in checks:
        evidence = tool()
        print(f"{name}: {evidence.parsed_metrics}")
        print(f"raw_output: {evidence.raw_output}\n")


if __name__ == "__main__":
    main()
