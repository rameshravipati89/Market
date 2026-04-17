#!/usr/bin/env bash
# =============================================================================
#  full_build.sh — Stop, rebuild, and restart all multilevel-marketing services
#
#  Uses the single docker-compose.yml at the project root.
#
#  Usage:
#    ./full_build.sh          # rebuild and start everything
#    ./full_build.sh down     # stop and remove all containers
# =============================================================================

set -euo pipefail

BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$BASE/docker-compose.yml"

# ── Ensure podman compose / podman-compose is available ──────────────────────
USER_BIN="$(python3 -m site --user-base 2>/dev/null)/bin"
export PATH="$USER_BIN:$PATH"

if ! command -v podman &>/dev/null; then
    echo "[ERROR] podman not found. Install Podman Desktop and try again."
    exit 1
fi

# Prefer built-in subcommand "podman compose"; fall back to podman-compose
if podman compose version &>/dev/null 2>&1; then
    COMPOSE="podman compose"
elif command -v podman-compose &>/dev/null; then
    COMPOSE="podman-compose"
else
    echo "[ERROR] Neither 'podman compose' nor 'podman-compose' found."
    echo "        Run: pip install podman-compose"
    exit 1
fi

log()  { echo ""; echo "▶  [$(date '+%H:%M:%S')] $*"; }
ok()   { echo "   ✓ $*"; }

# ── Handle "down" argument ────────────────────────────────────────────────────
if [[ "${1:-}" == "down" ]]; then
    log "Stopping all services..."
    cd "$BASE" && $COMPOSE -f "$COMPOSE_FILE" down --remove-orphans
    ok "All services stopped."
    exit 0
fi

# =============================================================================
# STEP 1 — Tear down existing containers
# =============================================================================
log "Stopping existing containers..."
cd "$BASE" && $COMPOSE -f "$COMPOSE_FILE" down --remove-orphans 2>/dev/null || true

# Force-remove any lingering named containers from old compose stacks
for c in mongodb_instance bluehost_injector mailclean_pipeline \
          localadmin_api localadmin_frontend \
          recruiter_backend recruiter_frontend cloudflare_tunnel; do
    podman rm -f "$c" 2>/dev/null || true
done
ok "Old containers removed."

# =============================================================================
# STEP 2 — Build and start everything
# =============================================================================
log "Building and starting all services (this may take a few minutes)..."
cd "$BASE" && $COMPOSE -f "$COMPOSE_FILE" up -d --build
ok "All containers started."

# =============================================================================
# STEP 3 — Wait for MongoDB health check to pass
# =============================================================================
log "Waiting for MongoDB to be healthy..."
for i in $(seq 1 40); do
    STATUS=$(podman inspect --format '{{.State.Health.Status}}' mongodb_instance 2>/dev/null || echo "unknown")
    if [[ "$STATUS" == "healthy" ]]; then
        ok "MongoDB is healthy (${i}x3s)."
        break
    fi
    if [[ $i -eq 40 ]]; then
        echo "[ERROR] MongoDB did not become healthy in time."
        podman logs mongodb_instance 2>&1 | tail -20
        exit 1
    fi
    sleep 3
done

# =============================================================================
# STEP 4 — Grab Cloudflare public URL (retry up to 30s)
# =============================================================================
log "Waiting for Cloudflare Tunnel public URL..."
PUBLIC_URL=""
for i in $(seq 1 15); do
    PUBLIC_URL=$(podman logs cloudflare_tunnel 2>&1 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1)
    if [[ -n "$PUBLIC_URL" ]]; then
        ok "Public URL found."
        break
    fi
    sleep 2
done

# =============================================================================
# Done — show running containers
# =============================================================================
log "All services are up."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
podman ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Admin UI       →  http://localhost:3000"
echo "  RecruitIQ Pro  →  http://localhost:3001"
echo "  API docs       →  http://localhost:3000/api/docs"
echo "  Recruiter API  →  http://localhost:3001/api/docs"
if [[ -n "$PUBLIC_URL" ]]; then
echo ""
echo "  ★ Public URL   →  $PUBLIC_URL   (share this with anyone)"
fi
echo ""
