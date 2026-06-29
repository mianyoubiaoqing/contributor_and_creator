#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"
HOST="${HOST:-0.0.0.0}"

cd "$(dirname "$0")/.."

if [ ! -d node_modules ]; then
  npm ci
fi

npm run build
npm run start -- -H "$HOST" -p "$PORT"

