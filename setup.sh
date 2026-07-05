#!/usr/bin/env bash
# =============================================================================
#  Phone Intelligence Platform — Ubuntu Production Setup
#  Fully automatic. Run once on a fresh Ubuntu 20.04 / 22.04 / 24.04 server.
#
#  USAGE:
#    chmod +x setup.sh
#    sudo ./setup.sh
#
#  OPTIONAL — to get free HTTPS (Let's Encrypt):
#    sudo ./setup.sh --domain yourdomain.com --email admin@yourdomain.com
#
#  WHAT THIS DOES:
#    1.  Installs Node.js 20, pnpm, Python 3 + deps, PostgreSQL, Nginx
#    2.  Creates a PostgreSQL database + user automatically
#    3.  Installs all Node.js workspace dependencies
#    4.  Applies the database schema (Drizzle push)
#    5.  Builds the API server (esbuild bundle)
#    6.  Builds the dashboard (React → static files)
#    7.  Configures Nginx to serve dashboard + proxy API
#    8.  Creates a systemd service → runs FOREVER, restarts on crash, starts on boot
#    9.  (Optional) Installs Certbot and enables free HTTPS via Let's Encrypt
#   10.  Opens firewall ports 22, 80, 443 (ufw)
#   11.  Prints access URLs and admin credentials
#
#  ACCESS AFTER SETUP:
#    Dashboard : http://<server-ip>/          (or https://yourdomain.com/)
#    API       : http://<server-ip>/api/
#    Password  : Brokenlove121@
#
#  RE-RUNNING: Safe to run again at any time (fully idempotent).
# =============================================================================

set -euo pipefail
IFS=$'\n\t'

# ── Parse optional CLI flags ──────────────────────────────────────────────────
DOMAIN=""
EMAIL=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --domain) DOMAIN="$2"; shift 2 ;;
    --email)  EMAIL="$2";  shift 2 ;;
    *) echo "Unknown arg: $1"; shift ;;
  esac
done

# ── Terminal colors ───────────────────────────────────────────────────────────
RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'
CYN='\033[0;36m'; BLD='\033[1m'; NC='\033[0m'
info()   { echo -e "${CYN}[INFO]${NC}  $*"; }
ok()     { echo -e "${GRN}[ OK ]${NC}  $*"; }
warn()   { echo -e "${YLW}[WARN]${NC}  $*"; }
die()    { echo -e "${RED}[FAIL]${NC}  $*" >&2; exit 1; }
banner() { echo -e "\n${BLD}${CYN}━━━  $*  ━━━${NC}"; }

# ── Must run as root ──────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || die "Run as root:  sudo ./setup.sh"

# ── Detect the real non-root user who invoked sudo ────────────────────────────
if [[ -n "${SUDO_USER:-}" && "$SUDO_USER" != "root" ]]; then
  SVCUSER="$SUDO_USER"
elif id ubuntu &>/dev/null; then
  SVCUSER="ubuntu"
elif id deploy &>/dev/null; then
  SVCUSER="deploy"
else
  SVCUSER="root"
fi

# ── Project paths ─────────────────────────────────────────────────────────────
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIST="$PROJECT_DIR/artifacts/api-server/dist/index.mjs"
DASH_DIST="$PROJECT_DIR/artifacts/dashboard/dist/public"

# ── Fixed configuration ───────────────────────────────────────────────────────
ADMIN_SECRET="Brokenlove121@"
DB_NAME="phone_intelligence"
DB_USER="phone_user"
API_PORT=8080
# Stable DB password derived from admin secret (same across re-runs)
DB_PASS="$(printf '%s' "${ADMIN_SECRET}__phonedb" | sha256sum | cut -c1-32)"
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}"

echo ""
echo -e "${BLD}Phone Intelligence Platform — Ubuntu Setup${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
info "Project   : $PROJECT_DIR"
info "Service   : running as user '$SVCUSER'"
info "API port  : $API_PORT"
[[ -n "$DOMAIN" ]] && info "Domain    : $DOMAIN (HTTPS will be configured)" \
                   || info "Domain    : none (HTTP only — use --domain to enable HTTPS)"
echo ""

# =============================================================================
banner "STEP 1 · System packages"
# =============================================================================
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  curl wget ca-certificates gnupg lsb-release \
  openssl build-essential git \
  python3 python3-pip python3-venv \
  postgresql postgresql-contrib \
  nginx \
  certbot python3-certbot-nginx \
  ufw \
  jq \
  logrotate
ok "System packages installed."

# =============================================================================
banner "STEP 2 · Node.js 20 (LTS)"
# =============================================================================
INSTALLED_NODE="$(node --version 2>/dev/null | grep -oP '(?<=v)\d+' || echo 0)"
if [[ "$INSTALLED_NODE" -lt 20 ]]; then
  info "Installing Node.js 20 via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs
fi
ok "Node.js $(node --version)"

# =============================================================================
banner "STEP 3 · pnpm"
# =============================================================================
if ! command -v pnpm &>/dev/null; then
  npm install -g pnpm@latest --quiet
fi
PNPM_BIN="$(which pnpm)"
ok "pnpm $($PNPM_BIN --version)"

# =============================================================================
banner "STEP 4 · Python dependencies"
# =============================================================================
# python3 -m pip works on all Ubuntu versions (pip3 alias may not exist)
python3 -m pip install --quiet --break-system-packages phonenumbers requests 2>/dev/null || \
  python3 -m pip install --quiet phonenumbers requests
ok "phonenumbers + requests installed."

# =============================================================================
banner "STEP 5 · PostgreSQL"
# =============================================================================
systemctl enable postgresql --quiet
systemctl start postgresql
sleep 1

# Create DB user (idempotent)
sudo -u postgres psql -v ON_ERROR_STOP=0 >/dev/null 2>&1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE USER "${DB_USER}" WITH PASSWORD '${DB_PASS}';
  ELSE
    ALTER USER "${DB_USER}" WITH PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;
SQL

# Create database if missing
DB_EXISTS="$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'")"
[[ "$DB_EXISTS" == "1" ]] || sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"

# Full privileges
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE \"${DB_NAME}\" TO \"${DB_USER}\";" >/dev/null 2>&1
sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO \"${DB_USER}\";" >/dev/null 2>&1
ok "PostgreSQL: database '${DB_NAME}' ready."

# =============================================================================
banner "STEP 6 · Secrets and environment"
# =============================================================================
cat > "$PROJECT_DIR/.env.production" <<ENVEOF
DATABASE_URL=${DATABASE_URL}
ADMIN_API_SECRET=${ADMIN_SECRET}
NODE_ENV=production
PORT=${API_PORT}
ENVEOF
chmod 600 "$PROJECT_DIR/.env.production"

printf '%s' "$ADMIN_SECRET" > "$PROJECT_DIR/.admin_secret"
chmod 600 "$PROJECT_DIR/.admin_secret"

chown -R "$SVCUSER:$SVCUSER" "$PROJECT_DIR" 2>/dev/null || true
ok "Secrets saved (.env.production + .admin_secret)."

# =============================================================================
banner "STEP 7 · Node.js workspace dependencies"
# =============================================================================
info "Running pnpm install (may take a minute on first run)..."
sudo -u "$SVCUSER" bash -c "
  export HOME=\"$(getent passwd $SVCUSER | cut -d: -f6)\"
  cd '$PROJECT_DIR'
  '$PNPM_BIN' install --frozen-lockfile 2>&1 || '$PNPM_BIN' install 2>&1
"
ok "Node dependencies installed."

# =============================================================================
banner "STEP 8 · Database schema"
# =============================================================================
info "Applying schema with drizzle-kit push..."
sudo -u "$SVCUSER" env \
  HOME="$(getent passwd $SVCUSER | cut -d: -f6)" \
  DATABASE_URL="$DATABASE_URL" \
  bash -c "cd '$PROJECT_DIR' && '$PNPM_BIN' --filter @workspace/db run push-force 2>&1"
ok "Database schema applied."

# =============================================================================
banner "STEP 9 · Build API server"
# =============================================================================
info "Bundling API server with esbuild..."
sudo -u "$SVCUSER" env \
  HOME="$(getent passwd $SVCUSER | cut -d: -f6)" \
  NODE_ENV=production \
  DATABASE_URL="$DATABASE_URL" \
  bash -c "cd '$PROJECT_DIR' && '$PNPM_BIN' --filter @workspace/api-server run build 2>&1"
[[ -f "$API_DIST" ]] || die "API build failed — $API_DIST not found."
ok "API server built → $API_DIST"

# =============================================================================
banner "STEP 10 · Build dashboard (React → static files)"
# =============================================================================
info "Building React dashboard..."
sudo -u "$SVCUSER" env \
  HOME="$(getent passwd $SVCUSER | cut -d: -f6)" \
  PORT="$API_PORT" \
  BASE_PATH="/" \
  NODE_ENV=production \
  bash -c "cd '$PROJECT_DIR' && '$PNPM_BIN' --filter @workspace/dashboard run build 2>&1"
[[ -d "$DASH_DIST" ]] || die "Dashboard build failed — $DASH_DIST not found."

# Ensure nginx (www-data) can traverse the path to the static files.
# If the project lives under /root, the directory has 700 by default which
# blocks the nginx worker process.  Grant execute (traverse) on every parent
# directory up to (but not including) /.
_dir="$PROJECT_DIR"
while [[ "$_dir" != "/" && "$_dir" != "" ]]; do
  chmod o+x "$_dir" 2>/dev/null || true
  _dir="$(dirname "$_dir")"
done
# Make all built static files world-readable.
chmod -R o+rX "$DASH_DIST"

ok "Dashboard built → $DASH_DIST"

# =============================================================================
banner "STEP 11 · Nginx (HTTP)"
# =============================================================================
NGINX_SITE="/etc/nginx/sites-available/phone-intelligence"

write_nginx_http() {
  local server_name="${1:-_}"
  cat > "$NGINX_SITE" <<NGINX
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${server_name};

    # ── Dashboard (React SPA) ───────────────────────────────────────────────
    root ${DASH_DIST};
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
        expires 1h;
        add_header Cache-Control "public, max-age=3600";
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)\$ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
    }

    # ── API (reverse proxy → Node.js) ───────────────────────────────────────
    location /api/ {
        proxy_pass         http://127.0.0.1:${API_PORT}/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   Connection        "";
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
        client_max_body_size 1m;
    }

    # ── Gzip ─────────────────────────────────────────────────────────────────
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json
               application/javascript application/xml+rss image/svg+xml;

    # ── Security headers ─────────────────────────────────────────────────────
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
NGINX
}

write_nginx_http "${DOMAIN:-_}"
ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/phone-intelligence
rm -f /etc/nginx/sites-enabled/default
nginx -t 2>&1 || die "Nginx config test failed."
systemctl enable nginx --quiet
systemctl restart nginx
ok "Nginx (HTTP) configured and running."

# =============================================================================
banner "STEP 12 · HTTPS with Let's Encrypt (Certbot)"
# =============================================================================
if [[ -n "$DOMAIN" && -n "$EMAIL" ]]; then
  info "Obtaining SSL certificate for $DOMAIN via Let's Encrypt..."

  # Certbot will modify the nginx config and add HTTPS server block
  certbot --nginx \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    --domains "$DOMAIN" \
    --redirect \
    2>&1

  # Enable auto-renewal (certbot installs a systemd timer by default on Ubuntu 20.04+)
  systemctl enable certbot.timer --quiet 2>/dev/null || true
  systemctl start  certbot.timer          2>/dev/null || true

  # Add a cron fallback for older Ubuntu versions
  CRON_JOB="0 3 * * * certbot renew --quiet --nginx --post-hook 'systemctl reload nginx'"
  (crontab -l 2>/dev/null | grep -qF "certbot renew") || \
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

  nginx -t && systemctl reload nginx
  ok "HTTPS enabled for https://$DOMAIN — certificate auto-renews every 60 days."

elif [[ -n "$DOMAIN" && -z "$EMAIL" ]]; then
  warn "DOMAIN set but --email missing — skipping HTTPS."
  warn "Re-run with:  sudo ./setup.sh --domain $DOMAIN --email you@example.com"

else
  info "No --domain provided — running HTTP only."
  info "To add HTTPS later:  sudo ./setup.sh --domain yourdomain.com --email you@example.com"
fi

# =============================================================================
banner "STEP 13 · systemd service (runs forever, restarts on crash)"
# =============================================================================
SYSTEMD_UNIT="/etc/systemd/system/phone-api.service"
cat > "$SYSTEMD_UNIT" <<UNIT
[Unit]
Description=Phone Intelligence API Server
Documentation=file://${PROJECT_DIR}/README.md
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=${SVCUSER}
Group=${SVCUSER}
WorkingDirectory=${PROJECT_DIR}
ExecStart=node --enable-source-maps ${API_DIST}

# ── Environment ───────────────────────────────────────────────────────────────
Environment=NODE_ENV=production
Environment=PORT=${API_PORT}
Environment=DATABASE_URL=${DATABASE_URL}
Environment=ADMIN_API_SECRET=${ADMIN_SECRET}

# ── Crash recovery — restarts within 3 seconds ───────────────────────────────
Restart=always
RestartSec=3s
StartLimitBurst=10
StartLimitIntervalSec=60s

# ── Resource limits ───────────────────────────────────────────────────────────
LimitNOFILE=65536
TimeoutStartSec=30s
TimeoutStopSec=15s
KillMode=mixed
KillSignal=SIGTERM

# ── Logging → journald (journalctl -u phone-api -f) ──────────────────────────
StandardOutput=journal
StandardError=journal
SyslogIdentifier=phone-api

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable phone-api
systemctl restart phone-api
sleep 3

systemctl is-active --quiet phone-api || {
  warn "Service may have failed. Showing journal:"
  journalctl -u phone-api -n 30 --no-pager || true
  die "phone-api service did not start — check logs above."
}
ok "phone-api systemd service running and enabled on boot."

# =============================================================================
banner "STEP 14 · Firewall (ufw)"
# =============================================================================
if command -v ufw &>/dev/null; then
  ufw allow 22/tcp  >/dev/null 2>&1 || true   # SSH — never block this
  ufw allow 80/tcp  >/dev/null 2>&1 || true   # HTTP
  ufw allow 443/tcp >/dev/null 2>&1 || true   # HTTPS
  ufw --force enable >/dev/null 2>&1 || true
  ok "Firewall: SSH (22), HTTP (80), HTTPS (443) open."
else
  info "ufw not found — skipping firewall."
fi

# =============================================================================
banner "STEP 15 · Log rotation"
# =============================================================================
cat > /etc/logrotate.d/phone-intelligence <<'LOGROTATE'
/var/log/nginx/access.log
/var/log/nginx/error.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    sharedscripts
    postrotate
        systemctl reload nginx > /dev/null 2>&1 || true
    endscript
}
LOGROTATE
ok "Log rotation configured (14-day retention)."

# =============================================================================
banner "STEP 16 · Helper scripts"
# =============================================================================
PNPM_PATH="$PNPM_BIN"
SVC_HOME="$(getent passwd $SVCUSER | cut -d: -f6)"

# status.sh
cat > "$PROJECT_DIR/status.sh" <<'STATUS'
#!/usr/bin/env bash
echo "━━━ API Service ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
systemctl status phone-api --no-pager -l 2>/dev/null || echo "phone-api: not found"
echo ""
echo "━━━ Nginx ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
systemctl status nginx --no-pager -l 2>/dev/null | head -12
echo ""
echo "━━━ PostgreSQL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
systemctl is-active postgresql && echo "postgresql: running" || echo "postgresql: stopped"
echo ""
echo "━━━ Health check ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
curl -sf http://localhost:8080/api/healthz && echo " ← API healthy" || echo "API not responding on :8080"
STATUS

# logs.sh
cat > "$PROJECT_DIR/logs.sh" <<'LOGS'
#!/usr/bin/env bash
echo "Streaming API server logs (Ctrl+C to stop)..."
journalctl -u phone-api -f --no-pager
LOGS

# rebuild.sh — rebuild everything after pulling code changes
cat > "$PROJECT_DIR/rebuild.sh" <<REBUILD
#!/usr/bin/env bash
# Rebuild API server + dashboard then restart all services.
set -euo pipefail
cd "${PROJECT_DIR}"
source .env.production
export HOME="${SVC_HOME}"

echo "[1/4] Installing dependencies..."
"${PNPM_PATH}" install

echo "[2/4] Applying DB schema..."
DATABASE_URL="\$DATABASE_URL" "${PNPM_PATH}" --filter @workspace/db run push-force

echo "[3/4] Building API server..."
NODE_ENV=production DATABASE_URL="\$DATABASE_URL" "${PNPM_PATH}" --filter @workspace/api-server run build

echo "[4/4] Building dashboard..."
PORT="${API_PORT}" BASE_PATH="/" NODE_ENV=production "${PNPM_PATH}" --filter @workspace/dashboard run build

echo "Restarting services..."
systemctl restart phone-api
systemctl reload  nginx
echo ""
echo "All done! Services restarted."
REBUILD

# update.sh — pull latest code from git and rebuild
cat > "$PROJECT_DIR/update.sh" <<UPDATE
#!/usr/bin/env bash
# Pull latest changes from git and rebuild everything.
set -euo pipefail
cd "${PROJECT_DIR}"
echo "Pulling latest code from git..."
sudo -u "${SVCUSER}" git pull
echo "Rebuilding..."
sudo bash ./rebuild.sh
UPDATE

chmod +x "$PROJECT_DIR/status.sh" "$PROJECT_DIR/logs.sh" \
         "$PROJECT_DIR/rebuild.sh" "$PROJECT_DIR/update.sh"
chown "$SVCUSER:$SVCUSER" \
  "$PROJECT_DIR/status.sh" "$PROJECT_DIR/logs.sh" \
  "$PROJECT_DIR/rebuild.sh" "$PROJECT_DIR/update.sh" 2>/dev/null || true
ok "Helper scripts created (status / logs / rebuild / update)."

# =============================================================================
banner "STEP 17 · Final health check"
# =============================================================================
sleep 3
SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")"
PROTO="http"
HOST="${SERVER_IP}"
[[ -n "$DOMAIN" ]] && { PROTO="https"; HOST="$DOMAIN"; }

API_OK=false
DASH_OK=false
curl -sf "http://localhost:${API_PORT}/api/healthz" >/dev/null 2>&1 && API_OK=true
curl -sf "http://localhost/" >/dev/null 2>&1 && DASH_OK=true

# =============================================================================
# ALL DONE
# =============================================================================
echo ""
echo -e "${GRN}${BLD}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GRN}${BLD}║         Phone Intelligence Platform — Setup Complete!               ║${NC}"
echo -e "${GRN}${BLD}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BLD}Dashboard:${NC}      ${PROTO}://${HOST}/"
echo -e "  ${BLD}API:${NC}            ${PROTO}://${HOST}/api/"
echo -e "  ${BLD}Health check:${NC}   ${PROTO}://${HOST}/api/healthz"
echo ""
echo -e "  ${BLD}Admin password:${NC} ${YLW}${ADMIN_SECRET}${NC}  ← enter this in the dashboard login"
echo ""
echo -e "  ${BLD}Database URL:${NC}   ${DATABASE_URL}"
echo ""
echo -e "  ${BLD}Manage services:${NC}"
echo -e "    sudo systemctl status  phone-api    — service status"
echo -e "    sudo systemctl restart phone-api    — restart API"
echo -e "    sudo journalctl -u phone-api -f     — live logs"
echo -e "    sudo systemctl reload  nginx        — reload Nginx"
echo ""
echo -e "  ${BLD}Helper scripts (run with sudo from project dir):${NC}"
echo -e "    sudo ./status.sh    — status of all services"
echo -e "    sudo ./logs.sh      — stream live API logs"
echo -e "    sudo ./rebuild.sh   — rebuild + restart after code changes"
echo -e "    sudo ./update.sh    — git pull + rebuild + restart"
echo ""
if [[ -n "$DOMAIN" ]]; then
  echo -e "  ${BLD}SSL Certificate:${NC}"
  echo -e "    certbot renew --dry-run       — test auto-renewal"
  echo -e "    certbot certificates          — view certificate info"
  echo ""
fi
echo -e "  ${BLD}Auto-start:${NC} Services start automatically on every reboot."
echo -e "  ${BLD}Crash-safe:${NC} API restarts within 3 seconds if it crashes."
echo ""

[[ "$API_OK" == "true" ]]  && ok  "API server responding at http://localhost:${API_PORT}/api/healthz" \
                            || warn "API not responding yet — run: sudo journalctl -u phone-api -n 50"
[[ "$DASH_OK" == "true" ]] && ok  "Dashboard live at http://${SERVER_IP}/" \
                            || warn "Nginx not responding — run: sudo systemctl status nginx"
echo ""
