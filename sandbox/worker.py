#!/usr/bin/env python3
"""
worker.py — NEXUS Demo Sandbox: Memory-Pressure Simulator
==========================================================
Normal behaviour  : idle loop, ~5 MB RSS, logs heartbeat every 30 s.
Fault behaviour   : on SIGUSR1, allocates ~1 MB/tick, logging RSS each
                    second, up to a 1.5 GB cap.

Design decisions
----------------
* Signal handler is registered before any blocking call to close the race
  window where a signal could arrive unhandled.
* Allocation happens in the main thread (via a flag set by the handler) so
  we never fight Python's GIL from a signal context.
* 1 MB chunk size means we overshoot the cap by at most ~1 MB, not 50 MB.
* The 1.5 GB cap prevents an OOM kill from happening too quickly — judges
  need time to watch the AI diagnose the fault. An OOM kill (exit 137) is
  still possible if the container's memory limit is lower; that is expected
  escalation behaviour and is documented.
* A clear STARTUP banner makes restarts visible in aggregated logs.
"""

import os
import signal
import sys
import time
import psutil

# ── Configuration ────────────────────────────────────────────────────────────
ALLOC_CHUNK_BYTES  = 1 * 1024 * 1024   # 1 MB per tick
TICK_INTERVAL_SEC  = 1.0               # sleep between ticks during fault
HEARTBEAT_INTERVAL = 30                # seconds between idle heartbeats
MAX_RSS_BYTES      = 1.5 * 1024 ** 3   # 1.5 GB hard cap

# ── State ────────────────────────────────────────────────────────────────────
_fault_active = False   # set True by SIGUSR1 handler; never reset automatically
_allocations  = []      # kept alive to prevent GC reclaiming our RSS


# ── Signal handlers ──────────────────────────────────────────────────────────
def _handle_sigusr1(signum, frame):
    """
    Activate the memory fault.  Idempotent: a second SIGUSR1 while the fault
    is already active is logged and ignored so repeated triggers don't
    compound unexpectedly.
    """
    global _fault_active
    if _fault_active:
        _log("SIGUSR1 received but fault is already active — ignored")
    else:
        _fault_active = True
        _log("SIGUSR1 received — MEMORY FAULT ACTIVATED")


def _handle_sigterm(signum, frame):
    """
    Clean shutdown.  supervisord sends SIGTERM to stop the worker; we log
    and exit with code 0 so supervisord's autorestart=unexpected does NOT
    restart us (exitcodes=0 means 0 is 'expected').
    """
    _log("SIGTERM received — shutting down cleanly (exit 0)")
    sys.exit(0)


# ── Helpers ──────────────────────────────────────────────────────────────────
def _rss_mb() -> float:
    return psutil.Process(os.getpid()).memory_info().rss / (1024 ** 2)


def _log(msg: str):
    """
    All output goes to stdout so supervisord/Docker captures it uniformly.
    """
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    print(f"[worker] {ts}  {msg}", flush=True)


# ── Main loop ────────────────────────────────────────────────────────────────
def main():
    # Register handlers FIRST — before any sleep or blocking call
    signal.signal(signal.SIGUSR1, _handle_sigusr1)
    signal.signal(signal.SIGTERM, _handle_sigterm)

    _log("=" * 60)
    _log("NEXUS worker started  PID=%d" % os.getpid())
    _log("Send SIGUSR1 to activate memory fault")
    _log("=" * 60)

    idle_counter = 0

    while True:
        if _fault_active:
            # ── Fault mode: allocate and log RSS ────────────────────────────
            current_rss = psutil.Process(os.getpid()).memory_info().rss
            if current_rss >= MAX_RSS_BYTES:
                _log(
                    f"RSS={current_rss / (1024**2):.1f} MB — CAP REACHED (1.5 GB) "
                    f"holding allocation, no more growth"
                )
                # Keep sleeping; we don't exit — the AI should detect and fix
                time.sleep(TICK_INTERVAL_SEC)
            else:
                # Allocate one chunk and log
                chunk = bytearray(ALLOC_CHUNK_BYTES)
                _allocations.append(chunk)
                rss_mb = current_rss / (1024 ** 2)
                _log(f"[FAULT] RSS={rss_mb:.1f} MB  allocating +1 MB/s ...")
                time.sleep(TICK_INTERVAL_SEC)
        else:
            # ── Idle mode: heartbeat every HEARTBEAT_INTERVAL seconds ────────
            time.sleep(1)
            idle_counter += 1
            if idle_counter >= HEARTBEAT_INTERVAL:
                _log(f"[idle] RSS={_rss_mb():.1f} MB  — waiting for SIGUSR1")
                idle_counter = 0


if __name__ == "__main__":
    main()
