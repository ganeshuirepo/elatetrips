#!/usr/bin/env bash
# Pull the latest code and (re)deploy both apps. Idempotent — safe to re-run.
# Used manually and by the GitHub Actions pipeline on every push to main.
set -euo pipefail

APP_DIR="$HOME/elatetrips"
BRANCH="${DEPLOY_BRANCH:-main}"

cd "$APP_DIR"

echo "==> Pulling $BRANCH"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "==> Backend: install + build"
pushd elatetrips-node >/dev/null
npm ci
npm run build
popd >/dev/null

echo "==> Frontend: install + build"
npm ci
npm run build

echo "==> Restarting via PM2"
pm2 startOrReload deploy/ecosystem.config.js
pm2 save

echo "==> Health checks"
sleep 3
curl -fsS http://127.0.0.1:4000/api/v1/health >/dev/null \
  && echo "backend: OK" || { echo "backend: FAILED"; pm2 logs elate-backend --lines 30 --nostream; exit 1; }
curl -fsS http://127.0.0.1:3000 >/dev/null \
  && echo "frontend: OK" || { echo "frontend: FAILED"; pm2 logs elate-frontend --lines 30 --nostream; exit 1; }

echo "Deploy complete: $(git rev-parse --short HEAD)"
