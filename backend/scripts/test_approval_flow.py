"""
Direct test of the approval -> execution -> verification flow.

This bypasses the LLM's decision of WHETHER to propose restart_service
(which is a prompting/demo-script concern) and instead directly tests
WHETHER the execution mechanism itself works correctly - since that's
the actual safety-critical code path.

Run from backend/: python scripts/test_approval_flow.py
"""
from app.orchestrator import Orchestrator
from app.schemas import ActionPlan, ToolCall

def main():
    print("=== Testing direct action execution (bypassing LLM proposal) ===\n")

    # Manually construct exactly what the orchestrator would build if the
    # LLM HAD proposed a restart - same code path, same schemas.
    action = ActionPlan(
        action_id="manual-test-001",
        tool_call=ToolCall(
            tool_name="restart_service",
            arguments={"service_name": "nginx"},
            risk_level="MEDIUM",
        ),
        reversibility="PARTIALLY_REVERSIBLE",
        requires_approval=True,
    )

    orchestrator = Orchestrator(on_event=lambda state, payload: print(f"  [{state}] {payload}"))

    print("Simulating human approval of restart_service(nginx)...\n")
    try:
        verification = orchestrator.execute_approved_action(action)
        print(f"\n=== RESULT ===")
        print(f"Status: {verification.status}")
        print(f"Checks: {verification.checks}")
        print(f"Rollback available: {verification.rollback_available}")
        if verification.status == "RESOLVED":
            print("\nPASS: Action executed and verified successfully.")
        else:
            print("\nFAIL: Verification did not report RESOLVED.")
    except Exception as e:
        print(f"\nFAIL: {type(e).__name__}: {e}")

if __name__ == "__main__":
    main()