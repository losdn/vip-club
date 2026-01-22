#!/bin/bash

# setup_vps.sh - Automated Setup for Vip Club on Linux VPS

set -e # Exit on error

LOG_FILE="setup_log.txt"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting VPS Setup..."

# 1. Update System and Install Basics
log "Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y
sudo apt-get install -y curl git unzip build-essential

# 2. Install Node.js (LTS)
if ! command -v node &> /dev/null; then
    log "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    log "Node.js is already installed."
fi

# 3. Setup Project Directory
PROJECT_DIR="/root/vip-club" # Defaulting to root/vip-club for VPS
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

# 4. Git Clone / Pull
REPO_URL="https://github.com/losdn/vip-club.git"
if [ -d ".git" ]; then
    log "Repository exists. Pulling latest..."
    git pull origin main
else
    log "Cloning repository..."
    git clone "$REPO_URL" .
fi

# 5. Install Dependencies
log "Installing npm dependencies..."
npm install

# 6. Install Xvfb for Electron (Headless support)
log "Installing Xvfb (Virtual Display) for Electron..."
sudo apt-get install -y xvfb libnss3 libatk1.0-0 libatk-bridge2.0-0 libgdk-pixbuf2.0-0 libgtk-3-0 libgbm-dev libnss3-dev libxss-dev

# 7. Create/Update run_app.sh permission
if [ -f "run_app.sh" ]; then
    chmod +x run_app.sh
fi

log "Setup Complete!"
log "Project is located at: $PROJECT_DIR"
log "To run the app: ./run_app.sh"
