#!/usr/bin/env bash
# =============================================================================
# toggle_nginx_fault.sh — NEXUS Demo: nginx config fault injection / reset
# =============================================================================
# Usage (inside the container):
#   toggle_nginx_fault.sh inject   — swap in bad config, trigger visible error
#   toggle_nginx_fault.sh reset    — restore good config, reload nginx cleanly
#
# Design:
#   • Operates on /etc/nginx/sites-enabled/nexus.conf (a symlink to sites-available)
#   • "inject": replaces the symlink target with the bad conf and reloads.
#     nginx will log the config error and keep serving with the old (good)
#     worker processes — so the container stays up while the fault is visible
#     in logs and `nginx -t` output.
#   • "reset": restores the symlink to the good conf and reloads cleanly.
#   • We NEVER delete the original good conf — reset is always possible.
# =============================================================================
set -euo pipefail

SITES_ENABLED="/etc/nginx/sites-enabled/nexus.conf"
GOOD_CONF="/etc/nginx/sites-available/nexus-good.conf"
BAD_CONF="/etc/nginx/sites-available/nexus-bad.conf"

_log() { echo "[toggle_nginx_fault] $(date -u +%Y-%m-%dT%H:%M:%SZ)  $*"; }

case "${1:-}" in
  inject)
    _log "MODE: inject — swapping in bad nginx config"

    # Verify the bad conf is genuinely broken (double-check our artefact)
    if nginx -t -c /dev/stdin <<EOF 2>/dev/null
events {}
http { include $BAD_CONF; }
EOF
    then
        _log "ERROR: bad conf unexpectedly passed nginx -t — aborting"
        exit 1
    fi
    _log "Confirmed: nginx -t rejects bad conf (expected)"

    # Swap symlink atomically
    ln -sf "$BAD_CONF" "$SITES_ENABLED"
    _log "Symlink updated: $SITES_ENABLED -> $BAD_CONF"

    # Reload nginx; master stays up, logs config error, serves old workers
    nginx -s reload || true
    sleep 1

    # Show the error for immediate feedback
    _log "nginx -t output (should show error):"
    nginx -t 2>&1 || true
    _log "FAULT INJECTED — check nginx error log: /var/log/nginx/error.log"
    ;;

  reset)
    _log "MODE: reset — restoring good nginx config"

    # Restore symlink to good config
    ln -sf "$GOOD_CONF" "$SITES_ENABLED"
    _log "Symlink restored: $SITES_ENABLED -> $GOOD_CONF"

    # Verify the good config passes before reloading
    if ! nginx -t 2>&1; then
        _log "ERROR: good config failed nginx -t — this should never happen"
        exit 1
    fi

    nginx -s reload
    sleep 1
    _log "nginx reloaded successfully with good config"
    _log "FAULT CLEARED — nginx is serving normally"
    ;;

  *)
    echo "Usage: $0 {inject|reset}"
    exit 1
    ;;
esac
