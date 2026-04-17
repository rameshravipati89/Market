# =============================================================================
#  full_build.ps1 — Stop, rebuild, and restart all multilevel-marketing services
#  Windows PowerShell script using the single docker-compose.yml at project root.
#
#  Requirements:
#    - Podman Desktop installed  (https://podman-desktop.io)
#    - Run from PowerShell (not cmd.exe)
#
#  Usage:
#    .\full_build.ps1          # rebuild and start everything
#    .\full_build.ps1 down     # stop and remove all containers
# =============================================================================

param([string]$Action = "")

$ErrorActionPreference = "Stop"

# ── Resolve script directory ──────────────────────────────────────────────────
$BASE          = Split-Path -Parent $MyInvocation.MyCommand.Definition
$COMPOSE_FILE  = Join-Path $BASE "docker-compose.yml"

# ── Helper functions ──────────────────────────────────────────────────────────
function log   { param($msg) Write-Host "`n▶  [$((Get-Date).ToString('HH:mm:ss'))] $msg" -ForegroundColor Cyan }
function ok    { param($msg) Write-Host "   ✓ $msg" -ForegroundColor Green }
function fatal { param($msg) Write-Host "`n[ERROR] $msg" -ForegroundColor Red; exit 1 }

# ── Verify tooling ─────────────────────────────────────────────────────────────
if (-not (Get-Command podman -ErrorAction SilentlyContinue)) {
    fatal "podman not found. Install Podman Desktop from https://podman-desktop.io and try again."
}
ok "podman found: $(podman --version)"

# ── Handle "down" argument ────────────────────────────────────────────────────
if ($Action -eq "down") {
    log "Stopping all services..."
    Set-Location $BASE
    podman compose -f $COMPOSE_FILE down --remove-orphans
    ok "All services stopped."
    exit 0
}

# =============================================================================
# STEP 1 — Tear down existing containers
# =============================================================================
log "Stopping existing containers..."
Set-Location $BASE
podman compose -f $COMPOSE_FILE down --remove-orphans 2>$null
ok "Old containers removed."

# =============================================================================
# STEP 2 — Build and start everything
# =============================================================================
log "Building and starting all services (this may take a few minutes)..."
Set-Location $BASE
podman compose -f $COMPOSE_FILE up -d --build
if ($LASTEXITCODE -ne 0) { fatal "podman compose up failed. See output above." }
ok "All containers started."

# =============================================================================
# STEP 3 — Wait for MongoDB health check to pass
# =============================================================================
log "Waiting for MongoDB to be healthy..."
$ready = $false
for ($i = 1; $i -le 40; $i++) {
    $status = podman inspect --format "{{.State.Health.Status}}" mongodb_instance 2>$null
    if ($status -eq "healthy") {
        ok "MongoDB is healthy ($($i * 3)s)."
        $ready = $true
        break
    }
    Start-Sleep -Seconds 3
}
if (-not $ready) {
    Write-Host "`n[ERROR] MongoDB did not become healthy in time." -ForegroundColor Red
    podman logs mongodb_instance 2>&1 | Select-Object -Last 20
    exit 1
}

# =============================================================================
# STEP 4 — Grab Cloudflare public URL (retry up to 30s)
# =============================================================================
log "Waiting for Cloudflare Tunnel public URL..."
$publicUrl = ""
for ($i = 1; $i -le 15; $i++) {
    $logs = podman logs cloudflare_tunnel 2>&1
    $match = [regex]::Match($logs -join "`n", 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($match.Success) {
        $publicUrl = $match.Value
        ok "Public URL found."
        break
    }
    Start-Sleep -Seconds 2
}

# =============================================================================
# Done — show running containers
# =============================================================================
log "All services are up."
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
podman ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Admin UI       →  http://localhost:3000" -ForegroundColor White
Write-Host "  RecruitIQ Pro  →  http://localhost:3001" -ForegroundColor White
Write-Host "  API docs       →  http://localhost:3000/api/docs"  -ForegroundColor White
Write-Host "  Recruiter API  →  http://localhost:3001/api/docs"  -ForegroundColor White
if ($publicUrl) {
    Write-Host ""
    Write-Host "  ★ Public URL   →  $publicUrl   (share this with anyone)" -ForegroundColor Yellow
}
Write-Host ""
