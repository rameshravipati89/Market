#!/usr/bin/env bash
# =============================================================
# build_setup.sh — mailclean Pipeline Setup
# Connects to shared mongodb_instance (already running).
# Builds the pipeline image (includes spaCy en_core_web_lg).
# Auto-detects Podman or Docker.
# NOTE: First build takes ~5-10 min (downloading spaCy model)
# =============================================================

set -e

MONGO_CONTAINER="mongodb_instance"
MONGO_USER="admin"
MONGO_PASS="admin123"
MONGO_DB="maildb"
MONGO_IP="10.88.0.2"   # IP of mongodb_instance on podman network

BATCH_SIZE=100
LOOP_SLEEP=120

# ─────────────────────────────────────────────
# 1. Detect OS
# ─────────────────────────────────────────────
detect_os() {
  case "$(uname -s)" in
    Darwin)  OS="mac" ;;
    Linux)
      if grep -qi microsoft /proc/version 2>/dev/null; then OS="wsl"
      else OS="linux"; fi ;;
    CYGWIN*|MINGW*|MSYS*) OS="windows" ;;
    *) OS="unknown" ;;
  esac
  echo "[INFO] OS detected: $OS"
}

# ─────────────────────────────────────────────
# 2. Detect Podman or Docker
# ─────────────────────────────────────────────
detect_runtime() {
  if command -v podman &>/dev/null; then
    RUNTIME="podman"
    echo "[INFO] Runtime: Podman ($(podman --version))"
    if [ "$OS" = "mac" ]; then
      RUNNING=$(podman machine list --format "{{.Running}}" 2>/dev/null | head -1)
      if [ "$RUNNING" != "true" ]; then
        echo "[INFO] Starting Podman machine…"
        podman machine list 2>/dev/null | grep -q 'podman-machine-default' || podman machine init
        podman machine start
      else
        echo "[INFO] Podman machine already running."
      fi
    fi
  elif command -v docker &>/dev/null; then
    RUNTIME="docker"
    echo "[INFO] Runtime: Docker ($(docker --version))"
    if [ "$OS" = "linux" ] || [ "$OS" = "wsl" ]; then
      docker info &>/dev/null || {
        sudo systemctl start docker 2>/dev/null || sudo service docker start 2>/dev/null || {
          echo "[ERROR] Could not start Docker."; exit 1
        }
      }
    fi
  else
    echo "[ERROR] Neither Podman nor Docker found."; exit 1
  fi
}

# ─────────────────────────────────────────────
# 3. Detect compose
# ─────────────────────────────────────────────
detect_compose() {
  if [ "$RUNTIME" = "podman" ]; then
    if command -v podman-compose &>/dev/null; then
      COMPOSE="podman-compose"
    else
      pip install --user podman-compose 2>/dev/null || pip3 install --user podman-compose 2>/dev/null || {
        echo "[ERROR] Could not install podman-compose."; exit 1
      }
      USER_BIN="$(python3 -m site --user-base 2>/dev/null || python -m site --user-base)/bin"
      export PATH="$USER_BIN:$PATH"
      COMPOSE="podman-compose"
    fi
  else
    if docker compose version &>/dev/null 2>&1; then COMPOSE="docker compose"
    elif command -v docker-compose &>/dev/null; then COMPOSE="docker-compose"
    else echo "[ERROR] docker compose not found."; exit 1; fi
  fi
  echo "[INFO] Compose: $COMPOSE"
}

# ─────────────────────────────────────────────
# 4. Check mongodb_instance is running
# ─────────────────────────────────────────────
check_mongo() {
  echo "[INFO] Checking $MONGO_CONTAINER is running…"
  if ! $RUNTIME ps --format "{{.Names}}" | grep -q "^${MONGO_CONTAINER}$"; then
    echo "[ERROR] $MONGO_CONTAINER is not running."
    echo "        Start it first: cd ../mongodb && ./build_setup.sh"
    exit 1
  fi
  # Verify the mongodb IP is still correct
  ACTUAL_IP=$($RUNTIME inspect "$MONGO_CONTAINER" --format "{{.NetworkSettings.Networks.podman.IPAddress}}" 2>/dev/null)
  if [ -n "$ACTUAL_IP" ] && [ "$ACTUAL_IP" != "$MONGO_IP" ]; then
    echo "[WARN] MongoDB IP changed: expected $MONGO_IP, got $ACTUAL_IP — updating .env"
    MONGO_IP="$ACTUAL_IP"
  fi
  echo "[INFO] $MONGO_CONTAINER is UP at $MONGO_IP"
}

# ─────────────────────────────────────────────
# 5. Write .env
# ─────────────────────────────────────────────
write_env() {
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  echo "[INFO] Writing .env…"
  cat > "$SCRIPT_DIR/.env" <<EOF
MONGO_URI=mongodb://${MONGO_USER}:${MONGO_PASS}@${MONGO_IP}:27017/${MONGO_DB}?authSource=admin
MONGO_DB=${MONGO_DB}
BATCH_SIZE=${BATCH_SIZE}
LOOP_SLEEP_SECONDS=${LOOP_SLEEP}
SPACY_MODEL=en_core_web_lg
EOF
  echo "[INFO] .env written."
}

# ─────────────────────────────────────────────
# 6. Stop old container
# ─────────────────────────────────────────────
cleanup() {
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd "$SCRIPT_DIR"
  $COMPOSE down --remove-orphans 2>/dev/null || true
}

# ─────────────────────────────────────────────
# 7. Build and start
# ─────────────────────────────────────────────
start_services() {
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd "$SCRIPT_DIR"
  echo "[INFO] Building pipeline image (first run: ~5-10 min for spaCy download)…"
  $COMPOSE up --build -d

  echo ""
  echo "=============================================="
  echo "  mailclean Pipeline is UP!"
  echo "  MongoDB  : ${MONGO_CONTAINER} @ ${MONGO_IP}:27017"
  echo "  Database : ${MONGO_DB}"
  echo "  Batch    : ${BATCH_SIZE} emails/pass"
  echo "  Interval : ${LOOP_SLEEP}s between passes"
  echo ""
  echo "  Input  collection : raw_emails   (status=pending)"
  echo "  Output collections: processed_jobs | junk_emails"
  echo "=============================================="
  echo ""
  echo "Useful commands:"
  echo "  Live logs  : $COMPOSE logs -f mailclean"
  echo "  Stop       : $COMPOSE down"
  echo ""
}

# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────
echo ""
echo "======= mailclean build_setup.sh ======="
detect_os
detect_runtime
detect_compose
check_mongo
write_env
cleanup
start_services
