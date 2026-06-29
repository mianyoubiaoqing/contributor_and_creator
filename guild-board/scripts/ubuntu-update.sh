#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-guild-board}"
APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

cd "$APP_DIR"

if command -v git >/dev/null 2>&1 && [ -d .git ]; then
  git pull --ff-only
fi

npm ci
npm run build
sudo systemctl restart "$APP_NAME"
sudo systemctl --no-pager status "$APP_NAME"

