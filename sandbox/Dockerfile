# ---------------------------------------------------------------------------
# NEXUS Demo Sandbox
# Base: ubuntu:22.04 (LTS, well-known, predictable apt behaviour)
# Installs: nginx, python3, supervisor
# Runs as root only where required (nginx master, supervisord);
# worker.py could drop privileges but supervisord itself needs root to
# manage processes, so we keep a single uid for simplicity and isolation
# is provided by the container boundary.
# ---------------------------------------------------------------------------
FROM ubuntu:22.04

# Prevent apt from asking interactive questions
ENV DEBIAN_FRONTEND=noninteractive

# ── System packages ─────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
        nginx \
        python3 \
        python3-pip \
        supervisor \
        procps \
        curl \
    && rm -rf /var/lib/apt/lists/*

# ── Python deps (only stdlib needed, but make psutil available for RSS) ──────
RUN pip3 install --no-cache-dir psutil

# ── nginx config ─────────────────────────────────────────────────────────────
# Remove the default symlink so we control exactly what's enabled
RUN rm -f /etc/nginx/sites-enabled/default

# Copy our known-good site config and the bad config (fault artefact)
COPY nginx/nginx-good.conf  /etc/nginx/sites-available/nexus-good.conf
COPY nginx/nginx-bad.conf   /etc/nginx/sites-available/nexus-bad.conf

# Enable the good config at startup
RUN ln -s /etc/nginx/sites-available/nexus-good.conf \
          /etc/nginx/sites-enabled/nexus.conf

# ── Application files ─────────────────────────────────────────────────────────
COPY worker.py              /app/worker.py
COPY toggle_nginx_fault.sh  /usr/local/bin/toggle_nginx_fault.sh

RUN chmod +x /usr/local/bin/toggle_nginx_fault.sh

# ── supervisord config ────────────────────────────────────────────────────────
COPY supervisord.conf       /etc/supervisor/conf.d/nexus.conf

# ── Healthcheck ───────────────────────────────────────────────────────────────
# Verifies nginx is up and responding; does NOT fail on worker state so that
# a memory fault doesn't falsely mark the whole container unhealthy.
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fs http://localhost:80/ > /dev/null || exit 1

# supervisord is PID 1; it owns signal forwarding to children
CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/supervisord.conf"]
