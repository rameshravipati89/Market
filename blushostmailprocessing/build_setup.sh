#!/usr/bin/env bash
# =============================================================
# build_setup.sh — Bluehost Mail Processing Setup
# Reuses the shared mongodb_instance container (already running).
# Seeds indexes + IMAP credentials into it, then starts mail_injector.
# Auto-detects Podman or Docker.
# Works on: macOS (Podman Desktop), Linux VM, Windows (WSL2)
# =============================================================

set -e

# ─────────────────────────────────────────────
# Config — matches existing mongodb_instance
# ─────────────────────────────────────────────
MONGO_CONTAINER="mongodb_instance"
MONGO_USER="admin"
MONGO_PASS="admin123"
MONGO_DB="maildb"
MONGO_PORT="27017"

INJECT_INTERVAL=300
IMAP_BATCH_SIZE=200

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
        echo "[ERROR] Podman is not accessible. Check your rootless setup."
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
      echo "[WARN] podman-compose not found — installing via pip..."
      pip install --user podman-compose 2>/dev/null || pip3 install --user podman-compose 2>/dev/null || {
        echo "[ERROR] Could not install podman-compose. Run: pip install podman-compose"
        exit 1
      }
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
# 4. Verify mongodb_instance is running
# ─────────────────────────────────────────────
check_mongo() {
  echo "[INFO] Checking that $MONGO_CONTAINER is running..."
  if ! $RUNTIME ps --format "{{.Names}}" | grep -q "^${MONGO_CONTAINER}$"; then
    echo "[ERROR] Container '$MONGO_CONTAINER' is not running."
    echo "        Start it first:  cd ../mongodb && ./build_setup.sh"
    exit 1
  fi
  echo "[INFO] $MONGO_CONTAINER is up."
}

# ─────────────────────────────────────────────
# 5. Seed indexes + IMAP credentials into
#    the shared mongodb_instance
# ─────────────────────────────────────────────
seed_mongo() {
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  echo "[INFO] Seeding indexes and credentials into $MONGO_CONTAINER..."

  $RUNTIME exec "$MONGO_CONTAINER" mongosh \
    --username "$MONGO_USER" --password "$MONGO_PASS" --authenticationDatabase admin \
    --quiet \
    --eval "
      var db = db.getSiblingDB('${MONGO_DB}');

      // TTL index — 30 days
      db.mail_events.createIndex(
        { received_at: 1 },
        { expireAfterSeconds: 2592000, name: 'ttl_30d', background: true }
      );
      db.mail_events.createIndex({ message_id: 1 }, { unique: true, sparse: true, name: 'idx_message_id', background: true });
      db.mail_events.createIndex({ from_email: 1 },      { name: 'idx_from_email', background: true });
      db.mail_events.createIndex({ job_contact_mail: 1 }, { name: 'idx_job_contact', background: true });
      db.mail_events.createIndex({ received_at: -1 },     { name: 'idx_received_desc', background: true });

      // credentials indexes
      db.credentials.createIndex({ type: 1, user: 1 }, { unique: true, name: 'idx_type_user', background: true });
      db.credentials.createIndex({ type: 1, active: 1 }, { name: 'idx_type_active', background: true });

      // Upsert IMAP account
      db.credentials.updateOne(
        { type: 'imap', user: 'Sanathm@virtuoustech.com' },
        { \$set: {
            type: 'imap', label: 'Sanath M — VirtuousTech',
            host: 'mail.virtuoustech.com', port: 993, ssl: true,
            user: 'Sanathm@virtuoustech.com', password: '24R21E0082',
            active: true, updated_at: new Date()
          },
          \$setOnInsert: { created_at: new Date() }
        },
        { upsert: true }
      );

      print('Seeding complete.');
    "

  echo "[INFO] MongoDB seeding done."
}

# ─────────────────────────────────────────────
# 6. Write .env
# ─────────────────────────────────────────────
write_env() {
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  ENV_FILE="$SCRIPT_DIR/.env"

  # mail_injector container connects via host.containers.internal (Podman) or host.docker.internal (Docker)
  if [ "$RUNTIME" = "podman" ]; then
    MONGO_HOST="host.containers.internal"
  else
    MONGO_HOST="host.docker.internal"
  fi

  echo "[INFO] Writing $ENV_FILE ..."
  cat > "$ENV_FILE" <<EOF
MONGO_URI=mongodb://${MONGO_USER}:${MONGO_PASS}@${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB}?authSource=admin
MONGO_DB=${MONGO_DB}
INJECT_INTERVAL_SECONDS=${INJECT_INTERVAL}
IMAP_BATCH_SIZE=${IMAP_BATCH_SIZE}
EOF
  echo "[INFO] .env written."
}

# ─────────────────────────────────────────────
# 7. Stop old injector container if running
# ─────────────────────────────────────────────
cleanup() {
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  echo "[INFO] Tearing down any existing injector containers..."
  cd "$SCRIPT_DIR"
  $COMPOSE down --remove-orphans 2>/dev/null || true
}

# ─────────────────────────────────────────────
# 8. Build and start mail_injector
# ─────────────────────────────────────────────
start_services() {
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  echo "[INFO] Building and starting mail_injector..."
  cd "$SCRIPT_DIR"

  if [ "$RUNTIME" = "podman" ] && [ "$OS" = "linux" ]; then
    export PODMAN_USERNS="keep-id"
  fi

  $COMPOSE up --build -d

  echo ""
  echo "=============================================="
  echo "  Bluehost Mail Processing is UP!"
  echo "  Runtime      : $RUNTIME"
  echo "  OS           : $OS"
  echo ""
  echo "  MongoDB (shared): ${MONGO_CONTAINER} @ localhost:${MONGO_PORT}"
  echo "  Database         : ${MONGO_DB}"
  echo "  Collections      : mail_events | credentials"
  echo ""
  echo "  IMAP Account  : Sanathm@virtuoustech.com"
  echo "  Fetch every   : ${INJECT_INTERVAL}s  |  Batch: ${IMAP_BATCH_SIZE}"
  echo "=============================================="
  echo ""
  echo "Useful commands:"
  echo "  Injector logs : $COMPOSE logs -f mail_injector"
  echo "  Mongo shell   : $RUNTIME exec -it ${MONGO_CONTAINER} mongosh -u ${MONGO_USER} -p ${MONGO_PASS}"
  echo "  Stop injector : $COMPOSE down"
  echo ""
}

# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────
echo ""
echo "======= Bluehost Mail Processing build_setup.sh ======="
detect_os
detect_runtime
detect_compose
check_mongo
seed_mongo
write_env
cleanup
start_services
