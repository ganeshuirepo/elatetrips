#!/usr/bin/env bash
# One-time EC2 bootstrap (Ubuntu 22.04/24.04). Run as the `ubuntu` user:
#   curl -fsSL https://raw.githubusercontent.com/ganeshuirepo/elatetrips/main/deploy/ec2-setup.sh | bash
set -euo pipefail

REPO_URL="https://github.com/ganeshuirepo/elatetrips.git"
APP_DIR="$HOME/elatetrips"

echo "==> 1/6 System packages"
sudo apt-get update -y
sudo apt-get install -y git nginx curl

echo "==> 2/6 Node.js 20 + PM2"
if ! command -v node >/dev/null || [[ "$(node -v)" != v20* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo npm install -g pm2

echo "==> 3/6 Swap (2G) — Next.js builds need memory on small instances"
if ! swapon --show | grep -q '/swapfile'; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

echo "==> 4/6 Clone repo"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

echo "==> 5/6 Environment files"
# Frontend: same-origin API through nginx (baked in at build time).
if [ ! -f .env.production ]; then
  echo "NEXT_PUBLIC_API_BASE=/api/v1" > .env.production
fi
# Backend: copy the example and STOP so you can fill in real secrets.
if [ ! -f elatetrips-node/.env ]; then
  cp elatetrips-node/.env.example elatetrips-node/.env
  echo ""
  echo "!! elatetrips-node/.env was created from the example."
  echo "!! Edit it now (MONGODB_URI, JWT_SECRET, BREVO_*, CORS_ORIGINS)"
  echo "!! then run:  bash deploy/deploy.sh"
  echo ""
fi

echo "==> 6/6 Nginx + PM2 boot service"
sudo cp deploy/nginx.conf /etc/nginx/sites-available/elatetrips
sudo ln -sf /etc/nginx/sites-available/elatetrips /etc/nginx/sites-enabled/elatetrips
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
pm2 startup systemd -u "$USER" --hp "$HOME" | tail -1 | sudo bash || true

echo "Setup complete. Fill elatetrips-node/.env, then: bash deploy/deploy.sh"
