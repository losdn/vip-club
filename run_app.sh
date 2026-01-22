#!/bin/bash

# run_app.sh - Run Vip Club on Linux VPS

LOG_FILE="app_log.txt"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

cd "$(dirname "$0")"

log "Starting update and launch process..."

# Pull latest
log "Pulling latest changes..."
git pull origin main >> "$LOG_FILE" 2>&1

# Install deps
log "Installing dependencies..."
npm install >> "$LOG_FILE" 2>&1

# Kill existing processes
log "Cleaning up ports and processes..."
npx --yes kill-port 3024 >> "$LOG_FILE" 2>&1
pkill -f "electron" || true

# Start App (using xvfb-run for headless electron)
log "Starting application..."
echo "Starting application..."
# We use xvfb-run to simulate a display for Electron
xvfb-run --auto-servernum --server-args="-screen 0 1024x768x24" npm run electron >> "$LOG_FILE" 2>&1 &

log "Application started in background."
