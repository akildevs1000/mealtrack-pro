# Server setup runbook (customer on-prem deployment)

How to stand up MyMeals on a fresh Ubuntu server — written during the Innovo
(DHHO-CMS-APP) deployment of 2026-06-11 and kept generic enough to repeat.
For the original cloud droplet flow, see `deploy.sh` (same layout).

## Architecture on one box

```
nginx :80  ──►  mymeals-web :8044 (web-server.mjs, SSR + static)
                    │  /api/* reverse-proxied internally (MEALOPS_API_PROXY)
                    ▼
                mymeals-api :5044 (Express + Prisma)
                    ├──► PostgreSQL (local — the app's own data)
                    └──► Oracle :1521 (customer HRMS, read-only roster sync; optional)
```

Single-port mode: users open `http://<server-ip>/`. Ports 8044/5044 stay internal.

## 0. Remote-desktop quirks (Guacamole / brokered sessions)

- **GNOME Terminal and snap apps (e.g. Firefox) fail** with "transient scope"
  / "not a snap cgroup" errors — there is no systemd *user* session. Use
  `xfce4-terminal`; for a browser install a non-snap one
  (`sudo apt install epiphany-browser`).
- Clipboard into the session: press `Ctrl+Alt+Shift`, paste into the Guacamole
  clipboard box, close, then `Ctrl+Shift+V` in the terminal.
- `sudo` password = the remote account's own password.

## 1. Prerequisites

```bash
sudo apt update && sudo apt install -y git curl postgresql postgresql-contrib nginx
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# NOTE: if the desktop sets XDG_CONFIG_HOME, nvm lands in ~/.config/nvm (not ~/.nvm):
export NVM_DIR="$HOME/.config/nvm"; [ -s "$NVM_DIR/nvm.sh" ] || export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh" && nvm install 22 && nvm alias default 22
npm install -g pm2
```

## 2. Code

```bash
sudo mkdir -p /var/www && sudo chown $USER:$USER /var/www
git clone https://github.com/akildevs1000/mealtrack-pro.git /var/www/mealtrack-pro
```

## 3. Database

Pick a DB password (letters+digits only — `@ : / #` break the URL):

```bash
sudo -u postgres psql -c "CREATE USER mymeals WITH PASSWORD 'XXXX';"
sudo -u postgres psql -c 'CREATE DATABASE "mealtrack-pro" OWNER mymeals;'
```

## 4. `server/.env` (gitignored — survives every deploy)

```bash
cd /var/www/mealtrack-pro/server && cat > .env <<EOF
DATABASE_URL="postgresql://mymeals:XXXX@127.0.0.1:5432/mealtrack-pro?schema=public"
PORT=5044
JWT_SECRET="$(openssl rand -hex 32)"
JWT_EXPIRES_IN="7d"
CORS_ORIGIN="*"
EOF
```

## 5. Build, migrate, seed

```bash
cd /var/www/mealtrack-pro && npm ci && npm run build
cd server && npm ci && npx prisma migrate deploy && npm run build && npm run seed && cd ..
```

`npm run seed` creates demo data + logins (`admin` / `password123`). Before
customer handover: change the admin password in the UI, then wipe the demo
data with `cd server && npx tsx scripts/cleanup-demo-data.ts --confirm`
(keeps admin + permissions).

## 6. PM2 (single-port proxy mode)

`ecosystem.customer.config.cjs` (untracked) extends the stock config with the
internal `/api` proxy so everything is served on :8044:

```bash
cd /var/www/mealtrack-pro && cat > ecosystem.customer.config.cjs <<'EOF'
const base = require("./ecosystem.config.cjs");
const web = base.apps.find((a) => a.name === "mymeals-web");
web.env = {
  ...web.env,
  MEALOPS_API_PROXY: "http://127.0.0.1:5044",
  MEALOPS_API_BASE: "http://127.0.0.1:5044/api",
};
module.exports = base;
EOF
echo 'export PM2_HOME=/var/www/mealtrack-pro/.pm2' >> ~/.bashrc
export PM2_HOME=/var/www/mealtrack-pro/.pm2
pm2 start ecosystem.customer.config.cjs && pm2 save
```

**`PM2_HOME` must be `/var/www/mealtrack-pro/.pm2` for every pm2 command**
(matches `deploy.sh`). Boot persistence — run `pm2 startup`, then run the
printed sudo command **but replace `--hp /home/<user>` with
`--hp /var/www/mealtrack-pro`** so the systemd unit gets the right PM2_HOME.

## 7. nginx

```bash
sudo tee /etc/nginx/sites-available/mymeals >/dev/null <<'EOF'
server {
    listen 80 default_server;
    server_name _;
    client_max_body_size 10m;
    location / {
        proxy_pass http://127.0.0.1:8044;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF
sudo ln -sf /etc/nginx/sites-available/mymeals /etc/nginx/sites-enabled/mymeals
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

## 8. Verify

```bash
curl -s http://localhost:5044/api/health           # {"ok":true,...}
curl -s -o /dev/null -w "%{http_code}\n" http://localhost/   # 200
curl -s -X POST http://localhost/api/auth/login -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password123"}' | head -c 120   # token
hostname -I    # the URL users open: http://<first-ip>/
```

## 9. Oracle CMS roster sync (optional, per-customer)

Append to `server/.env` (values from the customer's access document):

```
CMS_SYNC_ENABLED=0
ORACLE_CMS_HOST=<db-ip>
ORACLE_CMS_PORT=1521
ORACLE_CMS_SERVICE=<service-name>   # or ORACLE_CMS_SID=<sid>
ORACLE_CMS_USER=<user>
ORACLE_CMS_PASSWORD="<secret>"
ORACLE_CMS_TABLE=CMS_EMPLOYEE_MASTER
```

Validation sequence (all read-only):

1. `npx tsx scripts/probe-oracle.ts` — find what the listener actually registers
   (doc said SID `hrms`; reality was service `CMSDB`).
2. `npx tsx scripts/analyze-cms.ts` — connect + profile the data. Review before
   any write. **Limit failed logins — Oracle locks accounts (ORA-28000).**
3. First write: `npx tsx scripts/test-cms-sync.ts --write` (upsert, never wipes).
4. Enable hourly sync: set `CMS_SYNC_ENABLED=1`, `pm2 restart mymeals-api`.

## 10. Updating a live server

```bash
bash /var/www/mealtrack-pro/deploy.sh
# or manually:
cd /var/www/mealtrack-pro && git pull && npm ci && npm run build
cd server && npm ci && npx prisma migrate deploy && npm run build && cd ..
export PM2_HOME=/var/www/mealtrack-pro/.pm2 && pm2 restart all
```

`server/.env`, `ecosystem.customer.config.cjs`, and the DB are untouched by
updates (gitignored / untracked).
