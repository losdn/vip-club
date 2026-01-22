@echo off
echo ==========================================
echo SINCRONIZANDO COM O VPS...
echo ==========================================

echo [1/3] Adicionando arquivos...
git add .

echo [2/3] Salvando alteracoes (Commit)...
set /p commit_msg="Digite a mensagem do commit (Enter para padrao 'Atualizacao automatica'): "
if "%commit_msg%"=="" set commit_msg=Atualizacao automatica
git commit -m "%commit_msg%"

echo [3/3] Enviando para o GitHub (Push)...
git push origin main

if %errorlevel% equ 0 (
    echo.
    echo [SUCESSO] Codigo enviado! O VPS deve atualizar em 1-2 minutos.
) else (
    echo.
    echo [ERRO] Falha ao enviar. Verifique sua conexao ou conflitos.
)
pause
