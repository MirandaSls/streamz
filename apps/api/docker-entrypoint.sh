#!/bin/sh
# Entrypoint da imagem da API.
#
# `RUN_MIGRATIONS=1` aplica as migrations pendentes antes de subir. Fica
# **opt-in** de propósito: com várias réplicas, todas rodariam `migrate deploy`
# ao mesmo tempo no boot. O Prisma usa lock advisory e a corrida é segura, mas o
# lugar certo da migração é um job de release — ligue a variável só onde há uma
# instância só (dev, docker compose, Fly `release_command`).
set -e

if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
  echo "[entrypoint] aplicando migrations (prisma migrate deploy)…"
  ./node_modules/.bin/prisma migrate deploy
fi

exec "$@"
