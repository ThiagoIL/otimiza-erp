#!/bin/sh
# Ordem de subida: migrações -> conta master (se ainda não existir) -> aplicação.
# Se as migrações falharem, o container não sobe (evita rodar código novo com banco antigo).
set -e
echo "[otimiza-erp] aplicando migrações do banco…"
node scripts/migrate.mjs
node scripts/bootstrap.mjs || echo "[otimiza-erp] aviso: bootstrap da conta master não concluído (veja a mensagem acima)."
echo "[otimiza-erp] iniciando a aplicação na porta ${PORT:-3000}…"
exec node server.js
