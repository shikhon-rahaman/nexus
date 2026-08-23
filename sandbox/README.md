# NEXUS Demo Sandbox

This is the isolated demo environment for **NEXUS**, an AI-powered Linux
Operations Assistant. It runs nginx and a Python memory-pressure worker under
supervisord inside a single Docker container, providing two controllable fault
scenarios for live judging.

---

## Directory Layout

```
nexus/
├── docker-compose.yml          ← start here
└── sandbox/
    ├── Dockerfile
    ├── worker.py               ← memory fault simulator
    ├── supervisord.conf        ← process supervision config
    ├── toggle_nginx_fault.sh   ← nginx fault inject/reset (runs inside container)
    ├── trigger_memory_fault.sh ← sends SIGUSR1 to worker (runs on host)
    └── nginx/
        ├── nginx-good.conf     ← working nginx config
        └── nginx-bad.conf      ← deliberately broken config
```

---

## How to Start

> **Run all commands from the `nexus/` directory** (where `docker-compose.yml` lives).

```bash
# Build the image and start the container in the background
docker compose up -d --build

# Confirm it's running and healthy (wait ~20 s for healthcheck to pass)
docker compose ps
docker inspect nexus-sandbox --format='{{.State.Health.Status}}'
# Expected: healthy
```

nginx is now reachable at **http://localhost:8080/** on your host.

---

## Pre-Demo Health Checklist

Run this before every rehearsal and before judging:

```bash
# 1. Container is running
docker compose ps

# 2. nginx is responding
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/
# Expected: 200

# 3. nginx config is valid inside container
docker exec nexus-sandbox nginx -t
# Expected: syntax is ok / test is successful

# 4. worker is running and idle
docker exec nexus-sandbox pgrep -a -f worker.py
# Expected: a PID and the python3 path

# 5. supervisord shows both programs as RUNNING
docker exec nexus-sandbox supervisorctl status
# Expected:
#   nginx   RUNNING   pid NNN, uptime HH:MM:SS
#   worker  RUNNING   pid NNN, uptime HH:MM:SS

# 6. No existing memory fault active (worker RSS should be < 20 MB)
docker exec nexus-sandbox bash -c \
  'PID=$(pgrep -f worker.py); cat /proc/$PID/status | grep VmRSS'
# Expected: VmRSS: < 20000 kB
```

If any check fails, see **Reset Procedures** below before proceeding.

---

## Fault 1 — Memory Pressure

### Trigger (from your host machine)

```bash
# From nexus/ directory:
bash sandbox/trigger_memory_fault.sh
# Or, if the container name differs:
bash sandbox/trigger_memory_fault.sh nexus-sandbox
```

### What happens

1. The script finds the worker PID inside the container and sends `SIGUSR1`.
2. worker.py activates fault mode: allocates ~20 MiB/second, printing RSS to stdout.
3. RSS climbs from ~5 MB toward the 700 MiB cap. Logs print every second.

### Watch it live

```bash
docker logs -f nexus-sandbox
# Filter to worker lines only:
docker exec nexus-sandbox tail -f /var/log/supervisor/worker.stdout.log
```

### Reset (clear the memory fault)

```bash
# Restart worker — supervisord starts a clean process with no fault state
docker exec nexus-sandbox supervisorctl restart worker

# Confirm RSS is back to baseline
docker exec nexus-sandbox bash -c \
  'PID=$(pgrep -f worker.py); cat /proc/$PID/status | grep VmRSS'
```

### What about OOM kill?

If the host kernel kills the worker before you reset it (exit code 137),
supervisord restarts it automatically (autorestart=unexpected for non-zero
exits). The new process starts **clean** — no fault active. This is correct
escalation behaviour: the fault transitioned to a crash, which is a separate
diagnostic event. Look for the OOM kill in `dmesg` inside the container or in
host kernel logs.

---

## Fault 2 — nginx Config Error

### Trigger (from your host machine)

```bash
docker exec nexus-sandbox toggle_nginx_fault.sh inject
```

### What happens

1. The symlink `/etc/nginx/sites-enabled/nexus.conf` is atomically updated to
   point to `nginx-bad.conf`.
2. nginx is sent `SIGHUP` (reload).
3. nginx master detects the config error, **keeps the old worker processes
   running** (traffic still served), and logs the error.
4. `nginx -t` will now report a syntax error — this is what the AI diagnoses.

### Verify the fault is active

```bash
# Should show a syntax error
docker exec nexus-sandbox nginx -t

# Check nginx error log
docker exec nexus-sandbox tail -20 /var/log/nginx/error.log

# nginx is still serving (old workers are still alive)
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/
# Expected: 200 (master kept old config active)
```

### Reset

```bash
docker exec nexus-sandbox toggle_nginx_fault.sh reset

# Verify clean config
docker exec nexus-sandbox nginx -t
# Expected: syntax is ok / test is successful
```

---

## Full Container Reset (start completely fresh)

Use this between major rehearsal runs or if state is uncertain:

```bash
# From nexus/ directory:
docker compose down --remove-orphans
docker compose up -d --build

# Wait for healthy status
sleep 20
docker inspect nexus-sandbox --format='{{.State.Health.Status}}'
```

> **Note on log volumes:** `nginx_logs` and `supervisor_logs` named volumes
> survive a `docker compose down` so you can review logs post-demo. To wipe
> them too: `docker compose down -v`.

---

## Container Resource Limits

| Limit | Value | Reason |
|-------|-------|--------|
| Memory | 768 MiB | Lets the 700 MiB worker cap cross the diagnosis threshold |
| Swap | 0 (disabled) | Makes OOM kills deterministic |
| nginx port | host 8080 → container 80 | Change in docker-compose.yml if 8080 is busy |

---

## Troubleshooting

| Symptom | Check | Fix |
|---------|-------|-----|
| `docker compose up` port conflict | `netstat -an \| grep 8080` | Change host port in docker-compose.yml |
| Healthcheck stays `starting` | `docker logs nexus-sandbox` | Check supervisord/nginx startup errors |
| `supervisorctl` shows worker FATAL | `docker exec nexus-sandbox supervisorctl tail worker` | Check worker.py for Python errors |
| nginx -t errors on fresh start | `docker exec nexus-sandbox cat /etc/nginx/sites-enabled/nexus.conf` | Verify symlink points to nexus-good.conf |
| Memory fault won't trigger | Verify worker is RUNNING: `supervisorctl status` | `supervisorctl start worker` |
