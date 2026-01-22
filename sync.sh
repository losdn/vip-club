#!/bin/bash
echo "=========================================="
echo "SINCRONIZANDO COM O VPS..."
echo "=========================================="

echo "[1/3] Adicionando arquivos..."
git add .

echo "[2/3] Salvando alteracoes (Commit)..."
# Check if there are changes to commit
if git diff-index --quiet HEAD --; then
    echo "Nenhuma alteracao para salvar."
else
    git commit -m "Atualizacao automatica via sync script"
fi

echo "[3/3] Enviando para o GitHub (Push)..."
git push origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "[SUCESSO] Codigo enviado! O VPS deve atualizar em 1-2 minutos."
else
    echo ""
    echo "[ERRO] Falha ao enviar. Verifique sua conexao ou conflitos."
fi
