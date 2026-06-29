#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-guild-board}"
APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
PORT="${PORT:-3000}"
SERVICE_USER="${SERVICE_USER:-$USER}"
NODE_MAJOR="${NODE_MAJOR:-22}"

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required for package installation and systemd setup." >&2
  exit 1
fi

echo "Installing system packages..."
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

if ! command -v node >/dev/null 2>&1 || ! node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)"; then
  echo "Installing Node.js ${NODE_MAJOR}.x..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "Installing dependencies and building app..."
cd "$APP_DIR"
npm ci
npm run build

SERVICE_FILE="/etc/systemd/system/${APP_NAME}.service"
echo "Writing ${SERVICE_FILE}..."
sudo tee "$SERVICE_FILE" >/dev/null <<SERVICE
[Unit]
Description=Guild Board Next.js app
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=NEXT_TELEMETRY_DISABLED=1
Environment=PORT=${PORT}
EnvironmentFile=-${APP_DIR}/.env.local
ExecStart=/usr/bin/npm run start -- -H 0.0.0.0 -p ${PORT}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

echo "Starting ${APP_NAME}..."
sudo systemctl daemon-reload
sudo systemctl enable "$APP_NAME"
sudo systemctl restart "$APP_NAME"
sudo systemctl --no-pager status "$APP_NAME"

echo "Done. Open http://SERVER_IP:${PORT}"
