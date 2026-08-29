#!/usr/bin/env bash
# Pull the latest code and (re)deploy both apps. Idempotent — safe to re-run.
# Used manually and by the GitHub Actions pipeline on every push to main.
set -euo pipefail

APP_DIR="$HOME/elatetrips"
BRANCH="${DEPLOY_BRANCH:-main}"

# Everything lives inside main(), called on the last line, because this script
# REPLACES ITSELF partway through: the `git reset --hard` below rewrites
# deploy/deploy.sh, and bash reads a script lazily, by byte offset, as it runs.
# Without this wrapper an edit to any command AFTER the pull is read from the
# NEW file at the OLD offset — so it silently does not run, or worse, runs a
# fragment of a line. Wrapping the body in a function makes bash parse all of it
# before the pull can swap the file.
#
# That protects against executing a fragment. It does NOT make an edit apply on
# the run that ships it: main() is parsed from the OLD bytes, because the pull
# happens INSIDE main, which is called on the last line. A change here lands on
# the NEXT deploy — expect to verify it one run later than you shipped it.
main() {
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
  wait_for_http "backend"  "http://127.0.0.1:4000/api/v1/health" "elate-backend"
  wait_for_http "frontend" "http://127.0.0.1:3000"               "elate-frontend"

  echo "Deploy complete: $(git rev-parse --short HEAD)"
}

# Polls until the service answers, instead of sleeping once and hoping.
#
# `sleep 3; curl` was a race the backend now loses regularly: it connects to
# Atlas BEFORE it listens, so a cold connection routinely pushes first-byte past
# three seconds. The deploy then reported FAILED and exited 1 over a service
# that came up healthy a moment later — a red build for a good release, which is
# worse than no check at all, because it trains everyone to ignore the check.
wait_for_http() {
  local name="$1" url="$2" pm2_app="$3"
  local deadline=$((SECONDS + 90))

  until curl -fsS --max-time 5 "$url" >/dev/null 2>&1; do
    if (( SECONDS >= deadline )); then
      echo "$name: FAILED — no answer from $url after 90s"
      pm2 logs "$pm2_app" --lines 30 --nostream
      exit 1
    fi
    sleep 3
  done
  echo "$name: OK"
}

main "$@"
