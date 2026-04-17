#!/usr/bin/env bash
# =============================================================
# build_setup.sh — Local Admin UI Setup
# Writes .env, builds images, starts backend + frontend.
# Connects to the same MongoDB as blushostmailprocessing.
# Auto-detects Podman or Docker.
# Works on: macOS (Podman Desktop), Linux VM, Windows (WSL2)
# =============================================================

set -e

# ─────────────────────────────────────────────
# Config — must match blushostmailprocessing
# ─────────────────────────────────────────────
MONGO_USER="admin"
MONGO_PASS="admin123"
MONGO_DB="maildb"
MONGO_PORT="27017"
BACKEND_PORT="4000"
FRONTEND_PORT="3000"

# ─────────────────────────────────────────────
# 1. Detect OS
# ─────────────────────────────────────────────
detect_os() {
  case "$(uname -s)" in
    Darwin)  OS="mac" ;;
    Linux)
      if grep -qi microsoft /proc/version 2>/dev/null; then
        OS="wsl"
      else
        OS="linux"
      fi
      ;;
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
        echo "[INFO] Podman machine not running — starting..."
        podman machine list 2>/dev/null | grep -q 'podman-machine-default' || podman machine init
        podman machine start
      else
        echo "[INFO] Podman machine already running."
      fi
    fi

    if [ "$OS" = "linux" ]; then
      if ! podman info &>/dev/null; then
        echo "[ERROR] Podman not accessible. Check rootless setup."
        exit 1
      fi
    fi

  elif command -v docker &>/dev/null; then
    RUNTIME="docker"
    echo "[INFO] Runtime: Docker ($(docker --version))"

    if [ "$OS" = "linux" ] || [ "$OS" = "wsl" ]; then
      if ! docker info &>/dev/null; then
        echo "[WARN] Docker daemon not running — attempting to start..."
        sudo systemctl start docker 2>/dev/null || sudo service docker start 2>/dev/null || {
          echo "[ERROR] Could not start Docker. Please start it manually."
          exit 1
        }
      fi
    fi

  else
    echo "[ERROR] Neither Podman nor Docker found."
    exit 1
  fi
}

# ─────────────────────────────────────────────
# 3. Detect compose command
# ─────────────────────────────────────────────
detect_compose() {
  if [ "$RUNTIME" = "podman" ]; then
    if command -v podman-compose &>/dev/null; then
      COMPOSE="podman-compose"
    else
      echo "[WARN] podman-compose not found — installing..."
      pip install --user podman-compose 2>/dev/null || pip3 install --user podman-compose 2>/dev/null || {
        echo "[ERROR] Could not install podman-compose."
        exit 1
      }
      # Add Python user bin to PATH so the just-installed binary is found
      USER_BIN="$(python3 -m site --user-base 2>/dev/null || python -m site --user-base)/bin"
      export PATH="$USER_BIN:$PATH"
      COMPOSE="podman-compose"
    fi
  else
    if docker compose version &>/dev/null 2>&1; then
      COMPOSE="docker compose"
    elif command -v docker-compose &>/dev/null; then
      COMPOSE="docker-compose"
    else
      echo "[ERROR] docker compose not found."
      exit 1
    fi
  fi
  echo "[INFO] Compose command: $COMPOSE"
}

# ─────────────────────────────────────────────
# 4. Set the correct MongoDB host for containers
#    Podman/Docker cannot use "localhost" to reach
#    the host machine — use the special hostname.
# ─────────────────────────────────────────────
resolve_mongo_host() {
  if [ "$RUNTIME" = "podman" ]; then
    MONGO_HOST="host.containers.internal"
  else
    MONGO_HOST="host.docker.internal"
  fi
  echo "[INFO] MongoDB host for containers: $MONGO_HOST"
}

# ─────────────────────────────────────────────
# 5. Write .env
# ─────────────────────────────────────────────
write_env() {
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  ENV_FILE="$SCRIPT_DIR/.env"
  echo "[INFO] Writing $ENV_FILE ..."
  cat > "$ENV_FILE" <<EOF
# MongoDB — connects to blushostmailprocessing's MongoDB instance
MONGO_URI=mongodb://${MONGO_USER}:${MONGO_PASS}@${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB}?authSource=admin
MONGO_DB=${MONGO_DB}
PORT=${BACKEND_PORT}
EOF
  echo "[INFO] .env written."
}

# ─────────────────────────────────────────────
# 6. Stop existing containers
# ─────────────────────────────────────────────
cleanup() {
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  echo "[INFO] Tearing down any existing containers..."
  cd "$SCRIPT_DIR"
  $COMPOSE down --remove-orphans 2>/dev/null || true
}

# ─────────────────────────────────────────────
# 7. Build and start
# ─────────────────────────────────────────────
start_services() {
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  echo "[INFO] Building images and starting services..."
  cd "$SCRIPT_DIR"

  if [ "$RUNTIME" = "podman" ] && [ "$OS" = "linux" ]; then
    export PODMAN_USERNS="keep-id"
  fi

  $COMPOSE up --build -d

  echo ""
  echo "=============================================="
  echo "  Local Admin is UP!"
  echo "  Runtime   : $RUNTIME"
  echo "  OS        : $OS"
  echo ""
  echo "  Admin UI  : http://localhost:${FRONTEND_PORT}"
  echo "  API       : http://localhost:${BACKEND_PORT}/api"
  echo ""
  echo "  Connected to MongoDB @ ${MONGO_HOST}:${MONGO_PORT}"
  echo "  Database  : ${MONGO_DB}"
  echo "  Reading   : mail_events | credentials"
  echo "=============================================="
  echo ""
  echo "  Make sure blushostmailprocessing MongoDB is running first!"
  echo ""
  echo "Useful commands:"
  echo "  Frontend logs : $COMPOSE logs -f frontend"
  echo "  Backend logs  : $COMPOSE logs -f backend"
  echo "  Stop all      : $COMPOSE down"
  echo ""
}

# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────
echo ""
echo "======= Local Admin build_setup.sh ======="
detect_os
detect_runtime
detect_compose
resolve_mongo_host
write_env
cleanup
start_services
