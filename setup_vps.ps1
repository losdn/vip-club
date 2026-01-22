<#
.SYNOPSIS
    Automated Setup Script for Vip Club VPS (Windows)
.DESCRIPTION
    This script installs necessary dependencies (Chocolatey, Node.js, Git) 
    and prepares the environment for the Vip Club application.
.NOTES
    Run this script as Administrator.
#>

$ErrorActionPreference = "Stop"

function Write-Log {
    param ([string]$Message)
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message" -ForegroundColor Cyan
}

# Check for Administrator privileges
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Warning "Please run this script as Administrator!"
    Start-Sleep -Seconds 5
    Exit
}

Write-Log "Starting VPS Setup..."

# 1. Install Chocolatey if not installed
if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
    Write-Log "Installing Chocolatey..."
    Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    
    # Refresh env vars
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
} else {
    Write-Log "Chocolatey already installed."
}

# 2. Install Node.js and Git
Write-Log "Installing Node.js and Git..."
choco install nodejs git -y

# Refresh env vars again
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# 3. Setup Project Directory
$ProjectDir = "C:\Apps\vip-club"
if (-not (Test-Path $ProjectDir)) {
    Write-Log "Creating project directory at $ProjectDir..."
    New-Item -ItemType Directory -Force -Path $ProjectDir | Out-Null
}

Set-Location $ProjectDir

# 4. Git Clone / Pull
Write-Log "Setting up Git repository..."
$RepoUrl = Read-Host "Please enter your GitHub Repository URL (e.g., https://github.com/user/vip-club.git)"

if (-not [string]::IsNullOrWhiteSpace($RepoUrl)) {
    if (Test-Path ".git") {
        Write-Log "Repository already initialized. Pulling latest..."
        git pull origin main
    } else {
        Write-Log "Cloning repository..."
        git clone $RepoUrl .
    }
} else {
    Write-Warning "No Repository URL provided. Skipping Git setup."
}

# 5. Install Dependencies
if (Test-Path "package.json") {
    Write-Log "Installing npm dependencies..."
    npm install
} else {
    Write-Warning "package.json not found. Skipping npm install."
}

# 6. OpenSSH Setup (Optional hint)
Write-Log "Checking OpenSSH Server..."
$sshService = Get-Service -Name sshd -ErrorAction SilentlyContinue
if ($sshService) {
    if ($sshService.Status -ne 'Running') {
        Write-Log "Starting OpenSSH Server..."
        Start-Service sshd
        Set-Service -Name sshd -StartupType Automatic
    } else {
        Write-Log "OpenSSH Server is running."
    }
} else {
    Write-Warning "OpenSSH Server not found. Please install it via Windows Settings > Apps > Optional Features."
}

Write-Log "Setup Complete!"
Write-Log "---------------------------------------------------"
Write-Log "GitHub Secrets Information:"
Write-Log "PROJECT_PATH: $ProjectDir"
Write-Log "VPS_USERNAME: $env:USERNAME"
Write-Log "---------------------------------------------------"
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
