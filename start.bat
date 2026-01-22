@echo off
title VIP CLUB LAUNCHER
cd /d "%~dp0"

echo ==========================================
echo VERIFICANDO AMBIENTE...
echo ==========================================
echo.

:: Verifica Node.js
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO CRITICO] Node.js nao encontrado!
    echo Voce precisa instalar o Node.js: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Verifica package.json
if not exist "package.json" (
    echo [ERRO CRITICO] package.json nao encontrado!
    echo Coloque este arquivo na pasta raiz do projeto.
    echo.
    pause
    exit /b 1
)

:: Verifica node_modules
if not exist "node_modules" (
    echo [AVISO] Pasta node_modules nao encontrada.
    echo Instalando dependencias... ISSO PODE DEMORAR.
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo [ERRO] Falha ao instalar dependencias.
        pause
        exit /b 1
    )
)

echo.
echo ==========================================
echo COMPILANDO FRONTEND (BUILD)...
echo ==========================================
call npm run build
if %errorlevel% neq 0 (
    echo [ERRO] Falha na compilacao.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo INICIANDO ELECTRON...
echo ==========================================
set NODE_ENV=production
call npx electron electron/main.cjs

if %errorlevel% neq 0 (
    echo.
    echo [FIM] O programa fechou com codigo %errorlevel%
    pause
)
