#!/usr/bin/env bash
# =============================================================================
# trigger_memory_fault.sh — NEXUS Demo: trigger worker memory fault from host
# =============================================================================
# Usage:
#   ./trigger_memory_fault.sh [CONTAINER_NAME]
#
# Default container name: nexus-sandbox
# (matches the container_name in docker-compose.yml)
#
# What it does:
#   1. Finds the PID of worker.py inside the container using pgrep.
#   2. Sends SIGUSR1 to that PID via `docker exec`.
#   Both steps happen in a single docker exec call so there is no time gap
#   between PID lookup and signal delivery.
#
# Safety:
#   • If pgrep finds no worker.py, the script exits with an error rather
#     than sending a signal to PID 0 or an arbitrary process.
#   • Works whether the container is run via docker compose or docker run.
# =============================================================================
set -euo pipefail

CONTAINER="${1:-nexus-sandbox}"

echo "[trigger_memory_fault] $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "[trigger_memory_fault] Target container: $CONTAINER"

# Verify container is running before proceeding
if ! docker inspect --format='{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
    echo "[trigger_memory_fault] ERROR: Container '$CONTAINER' is not running."
    echo "  Start it with: docker compose up -d  (from nexus/ directory)"
    exit 1
fi

# Find worker PID and send SIGUSR1 in one atomic exec call
docker exec "$CONTAINER" bash -c '
    PID=$(pgrep -f "python3 /app/worker.py" | head -1)
    if [ -z "$PID" ]; then
        echo "[trigger_memory_fault] ERROR: worker.py not found in container"
        exit 1
    fi
    echo "[trigger_memory_fault] Found worker PID=$PID — sending SIGUSR1"
    kill -USR1 "$PID"
    echo "[trigger_memory_fault] SIGUSR1 sent — fault activating"
    echo "[trigger_memory_fault] Watch logs: docker logs -f '"$CONTAINER"'"
'
