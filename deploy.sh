#!/usr/bin/env bash
#
# MyMeal production deploy.
#
# Run on the LIVE server (Ubuntu droplet), from anywhere:
#   bash /var/www/mealtrack-pro/deploy.sh
# or, once it's executable (chmod +x deploy.sh):
#   /var/www/mealtrack-pro/deploy.sh
#
# It pulls latest master, reinstalls deps, applies any pending DB migrations,
# rebuilds the frontend + backend, and restarts both PM2 apps. Safe to re-run.
#
set -euo pipefail

# Always operate from the repo root (the directory this script lives in), so it
# works no matter what your current directory is.
cd "$(dirname "$(readlink -f "$0")")"

# This server's system Node is too old for Vite 7 / TanStack Start, so the build
# uses nvm's Node 22 (same as ecosystem.config.cjs). Load nvm if present.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1090,SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use 22 >/dev/null 2>&1 || nvm use default >/dev/null 2>&1 || true
fi
echo "==> Using Node $(node -v) / npm $(npm -v)"

echo "==> Pulling latest master"
git pull origin master

echo "==> Frontend: install + build"
npm ci
npm run build

echo "==> Backend: install + migrate + build"
cd server
npm ci
npx prisma migrate deploy
npm run build
cd ..

echo "==> Restarting PM2 (mymeals-api + mymeals-web)"
export PM2_HOME=/var/www/mealtrack-pro/.pm2
pm2 restart all
pm2 save || true

echo "==> Health check"
sleep 2
if curl -fsS http://localhost:5044/api/health >/dev/null; then
  echo "    API healthy ✓"
else
  echo "    WARNING: API health check failed — inspect with: PM2_HOME=$PM2_HOME pm2 logs mymeals-api"
fi

echo "==> Done. Now running $(git rev-parse --short HEAD)"
