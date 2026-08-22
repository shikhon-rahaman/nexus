"""FastAPI transport layer for the NEXUS orchestrator."""
from __future__ import annotations

from dotenv import load_dotenv
load_dotenv()

import asyncio
import json
import logging
import os
import threading
from dataclasses import dataclass
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, status
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from app.orchestrator import OrchestrationError, Orchestrator
from app.schemas import ActionPlan, OperationRecord, VerificationResult

logger = logging.getLogger(__name__)


class InvestigationRequest(BaseModel):
    query: str = Field(min_length=1)


class ActionStatusResponse(BaseModel):
    action_id: str
    status: Literal["DENIED"]


class HealthResponse(BaseModel):
    status: Literal["ok"]


@dataclass
class PendingAction:
    action: ActionPlan
    orchestrator: Orchestrator
    operation: OperationRecord
    status: Literal["PENDING", "EXECUTING", "COMPLETED", "DENIED", "FAILED"] = "PENDING"


pending_actions: dict[str, PendingAction] = {}
operation_history: list[OperationRecord] = []
state_lock = threading.Lock()

app = FastAPI(title="NEXUS API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("NEXUS_FRONTEND_ORIGIN", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


def _store_investigation_result(orchestrator: Orchestrator, record: OperationRecord) -> None:
    with state_lock:
        if record.action is not None:
            pending_actions[record.action.action_id] = PendingAction(
                action=record.action,
                orchestrator=orchestrator,
                operation=record,
            )
        elif record.state == "COMPLETED":
            operation_history.append(record)


@app.post("/api/investigate")
async def investigate(request: InvestigationRequest) -> EventSourceResponse:
    event_queue: asyncio.Queue[tuple[str, dict[str, Any]] | None] = asyncio.Queue()
    event_loop = asyncio.get_running_loop()
    emitted_failure = False

    def on_event(event_state: str, payload: dict[str, Any]) -> None:
        nonlocal emitted_failure
        if event_state == "FAILED":
            emitted_failure = True
        event_loop.call_soon_threadsafe(event_queue.put_nowait, (event_state, payload))

    orchestrator = Orchestrator(on_event=on_event)

    async def run_investigation() -> None:
        try:
            record = await asyncio.to_thread(orchestrator.run_investigation, request.query)
            _store_investigation_result(orchestrator, record)
        except OrchestrationError as exc:
            if not emitted_failure:
                on_event("FAILED", {"reason": str(exc)})
        except Exception:
            logger.exception("Investigation failed")
            on_event("FAILED", {"reason": "Investigation failed."})
        finally:
            event_loop.call_soon_threadsafe(event_queue.put_nowait, None)

    async def event_stream():
        while True:
            queued_event = await event_queue.get()
            if queued_event is None:
                return
            event_state, payload = queued_event
            yield {
                "event": event_state,
                "data": json.dumps(
                    {"state": event_state, "payload": jsonable_encoder(payload)}
                ),
            }

    asyncio.create_task(run_investigation())
    return EventSourceResponse(event_stream())


@app.post("/api/actions/{action_id}/approve", response_model=VerificationResult)
async def approve_action(action_id: str) -> VerificationResult:
    try:
        with state_lock:
            pending = pending_actions.get(action_id)
            if pending is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action not found.")
            if pending.status != "PENDING":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Action cannot be approved because it is {pending.status.lower()}.",
                )
            pending.status = "EXECUTING"

        verification = await asyncio.to_thread(
            pending.orchestrator.execute_approved_action, pending.action
        )
        completed_operation = pending.operation.model_copy(
            update={"verification": verification, "state": "COMPLETED"}
        )
        with state_lock:
            pending.status = "COMPLETED"
            operation_history.append(completed_operation)
        return verification
    except HTTPException:
        raise
    except OrchestrationError as exc:
        with state_lock:
            if "pending" in locals():
                pending.status = "FAILED"
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None
    except Exception:
        logger.exception("Approved action failed")
        with state_lock:
            if "pending" in locals():
                pending.status = "FAILED"
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Approved action failed.",
        ) from None


@app.post("/api/actions/{action_id}/deny", response_model=ActionStatusResponse)
async def deny_action(action_id: str) -> ActionStatusResponse:
    try:
        with state_lock:
            pending = pending_actions.get(action_id)
            if pending is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action not found.")
            if pending.status != "PENDING":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Action cannot be denied because it is {pending.status.lower()}.",
                )
            pending.status = "DENIED"
        return ActionStatusResponse(action_id=action_id, status="DENIED")
    except HTTPException:
        raise
    except Exception:
        logger.exception("Deny action failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to deny action.",
        ) from None


@app.get("/api/history", response_model=list[OperationRecord])
async def get_history() -> list[OperationRecord]:
    try:
        with state_lock:
            return list(operation_history)
    except Exception:
        logger.exception("History lookup failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to retrieve history.",
        ) from None


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    try:
        return HealthResponse(status="ok")
    except Exception:
        logger.exception("Health check failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Health check failed.",
        ) from None
