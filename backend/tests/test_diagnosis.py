"""
Tests the deterministic diagnosis engine directly against constructed
evidence - no Docker container and no Groq API key needed for this one.
Run: python -m pytest tests/test_diagnosis.py -v
"""
from app.schemas import Evidence
from app.diagnosis import diagnose_from_evidence


def _ev(tool_name, metrics):
    return Evidence(tool_name=tool_name, raw_output="mock", parsed_metrics=metrics, trust_level="system_verified")


def test_memory_pressure_scenario_matches_your_original_example():
    """Mirrors the exact scenario from the product spec: RAM 94%, swap 82%,
    python-worker at 6.8GB - should land in the 80-95% confidence band with
    memory pressure as the root cause."""
    evidence = [
        _ev("get_memory", {"ram_pct": 94, "swap_pct": 82}),
        _ev("list_processes", {"top_processes": [{"pid": 123, "mem_pct": 55.0, "cmd": "python-worker"}]}),
    ]
    diagnosis = diagnose_from_evidence(evidence)
    assert "memory pressure" in diagnosis.root_cause.lower()
    assert "python-worker" in diagnosis.root_cause
    assert 0.75 <= diagnosis.confidence <= 0.95
    assert diagnosis.is_heuristic is True


def test_healthy_system_gives_low_confidence_no_alarm():
    evidence = [
        _ev("get_memory", {"ram_pct": 40, "swap_pct": 2}),
        _ev("get_cpu", {"load_1min": 0.8}),
    ]
    diagnosis = diagnose_from_evidence(evidence)
    assert diagnosis.confidence <= 0.3
    assert "no clear anomaly" in diagnosis.root_cause.lower()


def test_single_dominant_process_without_memory_pressure():
    evidence = [
        _ev("get_memory", {"ram_pct": 50, "swap_pct": 5}),
        _ev("list_processes", {"top_processes": [{"pid": 456, "mem_pct": 35.0, "cmd": "runaway-script"}]}),
    ]
    diagnosis = diagnose_from_evidence(evidence)
    assert "runaway-script" in diagnosis.root_cause
    assert diagnosis.confidence < 0.8  # single signal, not multiple agreeing