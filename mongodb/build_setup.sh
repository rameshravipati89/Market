#!/usr/bin/env bash
# =============================================================
# build_setup.sh — MongoDB Instance Setup
# Auto-detects Podman or Docker.
# Works on: macOS (Podman Desktop), Linux VM, Windows (WSL2)
# =============================================================

set -e

CONTAINER_NAME="mongodb_instance"
MONGO_IMAGE="mongo:7.0"
MONGO_PORT="27017"
MONGO_USER="admin"
MONGO_PASS="admin123"
MONGO_DB="mydb"

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

    # macOS: ensure Podman machine is running
    if [ "$OS" = "mac" ]; then
      echo "[INFO] Checking Podman machine on macOS..."
      RUNNING=$(podman machine list --format "{{.Running}}" 2>/dev/null | head -1)
      if [ "$RUNNING" != "true" ]; then
        echo "[INFO] Podman machine not running — starting..."
        podman machine list 2>/dev/null | grep -q 'podman-machine-default' || podman machine init
        podman machine start
      else
        echo "[INFO] Podman machine already running."
      fi
    fi

    # Linux: check rootless socket
    if [ "$OS" = "linux" ]; then
      if ! podman info &>/dev/null; then
        echo "[ERROR] Podman is not accessible. Check your rootless setup."
        exit 1
      fi
    fi

  elif command -v docker &>/dev/null; then
    RUNTIME="docker"
    echo "[INFO] Runtime: Docker ($(docker --version))"

    # Linux/WSL: start Docker daemon if not running
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
    echo "[ERROR] Neither Podman nor Docker found. Install one:"
    echo "  macOS  : brew install podman  OR  https://podman-desktop.io"
    echo "  Linux  : sudo apt install podman  OR  sudo dnf install podman"
    echo "  Windows: https://podman-desktop.io  OR  https://docs.docker.com/desktop/windows/"
    exit 1
  fi
}

# ─────────────────────────────────────────────
# 3. Remove old container if exists
# ─────────────────────────────────────────────
cleanup() {
  if $RUNTIME ps -a --format "{{.Names}}" 2>/dev/null | grep -q "^${CONTAINER_NAME}$"; then
    echo "[INFO] Removing existing container '$CONTAINER_NAME'..."
    $RUNTIME rm -f "$CONTAINER_NAME"
  fi
}

# ─────────────────────────────────────────────
# 4. Run MongoDB container
# ─────────────────────────────────────────────
run_mongo() {
  echo "[INFO] Starting MongoDB container..."

  # Podman on Linux needs --userns=keep-id for rootless volume access
  EXTRA_FLAGS=""
  if [ "$RUNTIME" = "podman" ] && [ "$OS" = "linux" ]; then
    EXTRA_FLAGS="--userns=keep-id"
  fi

  $RUNTIME run -d \
    --name "$CONTAINER_NAME" \
    -p "$MONGO_PORT:27017" \
    -e MONGO_INITDB_ROOT_USERNAME="$MONGO_USER" \
    -e MONGO_INITDB_ROOT_PASSWORD="$MONGO_PASS" \
    -e MONGO_INITDB_DATABASE="$MONGO_DB" \
    -v mongo_data:/data/db \
    $EXTRA_FLAGS \
    "$MONGO_IMAGE"

  echo ""
  echo "=============================================="
  echo "  MongoDB is UP!"
  echo "  Runtime   : $RUNTIME"
  echo "  OS        : $OS"
  echo "  Host      : localhost:$MONGO_PORT"
  echo "  Username  : $MONGO_USER"
  echo "  Password  : $MONGO_PASS"
  echo "  Database  : $MONGO_DB"
  echo ""
  echo "  Connection URI:"
  echo "  mongodb://$MONGO_USER:$MONGO_PASS@localhost:$MONGO_PORT/$MONGO_DB?authSource=admin"
  echo "=============================================="
  echo ""
  echo "Useful commands:"
  echo "  Logs    : $RUNTIME logs -f $CONTAINER_NAME"
  echo "  Shell   : $RUNTIME exec -it $CONTAINER_NAME mongosh -u $MONGO_USER -p $MONGO_PASS"
  echo "  Stop    : $RUNTIME stop $CONTAINER_NAME"
  echo "  Remove  : $RUNTIME rm -f $CONTAINER_NAME"
}

# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────
echo ""
echo "======= MongoDB build_setup.sh ======="
detect_os
detect_runtime
cleanup
run_mongo
