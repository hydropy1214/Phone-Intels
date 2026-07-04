#!/usr/bin/env bash
# =============================================================================
# Phone Intelligence Platform — Ubuntu One-Click Setup
# =============================================================================
# Installs all system dependencies, sets up PostgreSQL, builds the API server
# and dashboard, configures Nginx + Supervisor, then starts everything.
#
# Run:  chmod +x setup.sh && sudo ./setup.sh
#
# Admin password (dashboard login):  Brokenlove121@
# Dashboard:  http://<your-server-ip>          (port 80 via Nginx)
# API:        http://<your-server-ip>/api/     (proxied by Nginx)
# =============================================================================

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[ OK ]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
step()    { echo -e "\n${BOLD}${CYAN}══ $* ══${NC}"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── Root check ────────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || error "Please run as root:  sudo ./setup.sh"

# ── Config ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"

ADMIN_SECRET="Brokenlove121@"
DB_NAME="phone_intelligence"
DB_USER="phone_user"
API_PORT=8080

# Run Node/Python services as the user who invoked sudo (not root)
if [[ -n "${SUDO_USER:-}" ]]; then
  SERVICE_USER="$SUDO_USER"
elif command -v logname &>/dev/null && logname 2>/dev/null; then
  SERVICE_USER="$(logname)"
else
  SERVICE_USER="root"
fi

info "Project : $PROJECT_DIR"
info "User    : $SERVICE_USER"
info "API port: $API_PORT (Nginx exposes /api/)"

# =============================================================================
step "1 · System packages"
# =============================================================================
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  curl wget ca-certificates gnupg lsb-release \
  openssl build-essential \
  python3 python3-pip \
  postgresql postgresql-contrib \
  nginx \
  supervisor \
  jq
success "System packages ready."

# =============================================================================
step "2 · Node.js 20"
# =============================================================================
NODE_MAJOR=20
INSTALLED_MAJOR="$(node --version 2>/dev/null | grep -oP '(?<=v)\d+' || echo 0)"
if [[ "$INSTALLED_MAJOR" -lt "$NODE_MAJOR" ]]; then
  info "Installing Node.js ${NODE_MAJOR}..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs
fi
success "Node.js $(node --version)"

# =============================================================================
step "3 · pnpm"
# =============================================================================
if ! command -v pnpm &>/dev/null; then
  npm install -g pnpm --quiet
fi
success "pnpm $(pnpm --version)"

# =============================================================================
step "4 · Python dependencies"
# =============================================================================
pip3 install --quiet phonenumbers requests
success "phonenumbers + requests installed."

# =============================================================================
step "5 · PostgreSQL"
# =============================================================================
systemctl enable postgresql --quiet
systemctl start postgresql

# Generate a stable DB password (deterministic from secret so re-runs match)
DB_PASS="$(echo -n "${ADMIN_SECRET}__db_salt" | sha256sum | cut -c1-32)"
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"

sudo -u postgres psql -v ON_ERROR_STOP=0 >/dev/null 2>&1 <<-SQL
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
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" \
  | grep -q 1 || sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE \"${DB_NAME}\" TO \"${DB_USER}\";" >/dev/null 2>&1
success "PostgreSQL: database '${DB_NAME}' ready."

# =============================================================================
step "6 · Environment files"
# =============================================================================
ENV_FILE="$PROJECT_DIR/.env.production"
cat > "$ENV_FILE" <<ENVEOF
DATABASE_URL=${DATABASE_URL}
ADMIN_API_SECRET=${ADMIN_SECRET}
NODE_ENV=production
PORT=${API_PORT}
ENVEOF
chmod 600 "$ENV_FILE"
chown "$SERVICE_USER:$SERVICE_USER" "$ENV_FILE" 2>/dev/null || true

# Write the .admin_secret file (server reads this as fallback)
echo -n "$ADMIN_SECRET" > "$PROJECT_DIR/.admin_secret"
chmod 600 "$PROJECT_DIR/.admin_secret"
chown "$SERVICE_USER:$SERVICE_USER" "$PROJECT_DIR/.admin_secret" 2>/dev/null || true

success "Admin secret saved.  Password = ${ADMIN_SECRET}"

# =============================================================================
step "7 · pnpm install"
# =============================================================================
info "Installing workspace dependencies..."
sudo -u "$SERVICE_USER" bash -c "
  cd '$PROJECT_DIR'
  pnpm install --frozen-lockfile 2>&1 || pnpm install 2>&1
"
success "Node dependencies installed."

# =============================================================================
step "8 · Database schema"
# =============================================================================
info "Applying Drizzle schema (push)..."
sudo -u "$SERVICE_USER" env \
  DATABASE_URL="$DATABASE_URL" \
  bash -c "cd '$PROJECT_DIR' && pnpm --filter @workspace/db run push-force 2>&1"
success "Schema applied."

# =============================================================================
step "9 · Build API server"
# =============================================================================
sudo -u "$SERVICE_USER" env \
  DATABASE_URL="$DATABASE_URL" \
  NODE_ENV=production \
  bash -c "cd '$PROJECT_DIR' && pnpm --filter @workspace/api-server run build 2>&1"
success "API server built → artifacts/api-server/dist/"

# =============================================================================
step "10 · Build dashboard"
# =============================================================================
# BASE_PATH=/ means the dashboard is served at the root
sudo -u "$SERVICE_USER" env \
  PORT="${API_PORT}" \
  BASE_PATH="/" \
  NODE_ENV=production \
  bash -c "cd '$PROJECT_DIR' && pnpm --filter @workspace/dashboard run build 2>&1"
DASH_DIST="$PROJECT_DIR/artifacts/dashboard/dist/public"
success "Dashboard built → $DASH_DIST"

# =============================================================================
step "11 · Nginx (static dashboard + API proxy)"
# =============================================================================
# Nginx serves the built React dashboard as static files and proxies /api/
NGINX_CONF="/etc/nginx/sites-available/phone-intelligence"
cat > "$NGINX_CONF" <<NGINXEOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    # ── Static dashboard ────────────────────────────────────────────────────
    root ${DASH_DIST};
    index index.html;

    # All unknown routes → index.html (React client-side routing)
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # ── API reverse proxy ────────────────────────────────────────────────────
    location /api/ {
        proxy_pass         http://127.0.0.1:${API_PORT}/;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    # ── Gzip ─────────────────────────────────────────────────────────────────
    gzip on;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml text/javascript;
}
NGINXEOF

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/phone-intelligence
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx --quiet
systemctl restart nginx
success "Nginx configured."

# =============================================================================
step "12 · Supervisor (API server process manager)"
# =============================================================================
SUP_CONF="/etc/supervisor/conf.d/phone-api.conf"
cat > "$SUP_CONF" <<SUPEOF
[program:phone-api]
command=node --enable-source-maps ${PROJECT_DIR}/artifacts/api-server/dist/index.mjs
directory=${PROJECT_DIR}
user=${SERVICE_USER}
autostart=true
autorestart=true
startretries=5
startsecs=3
stopwaitsecs=15
stdout_logfile=/var/log/phone-api.log
stderr_logfile=/var/log/phone-api-err.log
stdout_logfile_maxbytes=20MB
stderr_logfile_maxbytes=10MB
redirect_stderr=false
environment=
  PORT="${API_PORT}",
  NODE_ENV="production",
  DATABASE_URL="${DATABASE_URL}",
  ADMIN_API_SECRET="${ADMIN_SECRET}"
SUPEOF

systemctl enable supervisor --quiet
systemctl start supervisor 2>/dev/null || systemctl restart supervisor
supervisorctl reread  >/dev/null
supervisorctl update  >/dev/null
supervisorctl start phone-api 2>/dev/null || supervisorctl restart phone-api 2>/dev/null || true
success "Supervisor configured."

# =============================================================================
step "13 · Helper scripts"
# =============================================================================
cat > "$PROJECT_DIR/start.sh" <<'EOF'
#!/usr/bin/env bash
echo "Starting Phone Intelligence API..."
supervisorctl start phone-api 2>/dev/null || supervisorctl restart phone-api
echo "Done. Dashboard: http://localhost   API: http://localhost/api/"
EOF

cat > "$PROJECT_DIR/stop.sh" <<'EOF'
#!/usr/bin/env bash
supervisorctl stop phone-api
echo "API server stopped."
EOF

cat > "$PROJECT_DIR/status.sh" <<'EOF'
#!/usr/bin/env bash
echo "=== Service Status ==="
supervisorctl status phone-api
echo ""
echo "=== Nginx Status ==="
systemctl is-active nginx && echo "nginx: running" || echo "nginx: stopped"
EOF

cat > "$PROJECT_DIR/logs.sh" <<'EOF'
#!/usr/bin/env bash
echo "=== API Server (last 80 lines) ==="
tail -80 /var/log/phone-api.log 2>/dev/null || echo "(no log yet)"
echo ""
echo "=== API Server Errors ==="
tail -30 /var/log/phone-api-err.log 2>/dev/null || echo "(none)"
EOF

cat > "$PROJECT_DIR/rebuild.sh" <<REBUILD
#!/usr/bin/env bash
# Re-build and restart after code changes
set -euo pipefail
cd "$PROJECT_DIR"
echo "Building API server..."
DATABASE_URL="$DATABASE_URL" NODE_ENV=production \\
  pnpm --filter @workspace/api-server run build
echo "Building dashboard..."
PORT="${API_PORT}" BASE_PATH="/" NODE_ENV=production \\
  pnpm --filter @workspace/dashboard run build
echo "Restarting API server..."
supervisorctl restart phone-api
echo "Reloading Nginx (dashboard static files updated)..."
systemctl reload nginx
echo "Done."
REBUILD

chmod +x "$PROJECT_DIR/start.sh" "$PROJECT_DIR/stop.sh" \
         "$PROJECT_DIR/status.sh" "$PROJECT_DIR/logs.sh" \
         "$PROJECT_DIR/rebuild.sh"
chown "$SERVICE_USER:$SERVICE_USER" \
  "$PROJECT_DIR/start.sh" "$PROJECT_DIR/stop.sh" \
  "$PROJECT_DIR/status.sh" "$PROJECT_DIR/logs.sh" \
  "$PROJECT_DIR/rebuild.sh" 2>/dev/null || true

success "Helper scripts created."

# =============================================================================
step "14 · Health check"
# =============================================================================
sleep 4
API_OK=false
if curl -sf "http://localhost:${API_PORT}/" >/dev/null 2>&1 || \
   curl -sf "http://localhost:${API_PORT}/health" >/dev/null 2>&1; then
  API_OK=true
fi

NGINX_OK=false
curl -sf "http://localhost/" >/dev/null 2>&1 && NGINX_OK=true

# =============================================================================
# DONE
# =============================================================================
echo ""
echo -e "${GREEN}${BOLD}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║       Phone Intelligence Platform — Ready!                   ║${NC}"
echo -e "${GREEN}${BOLD}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Dashboard:${NC}      http://$(hostname -I | awk '{print $1}')  (port 80)"
echo -e "  ${BOLD}API Server:${NC}     http://$(hostname -I | awk '{print $1}')/api/"
echo -e "  ${BOLD}Admin login:${NC}    ${YELLOW}${ADMIN_SECRET}${NC}"
echo ""
echo -e "  ${BOLD}Database:${NC}       $DATABASE_URL"
echo ""
echo -e "  ${BOLD}Commands:${NC}"
echo -e "    sudo ./start.sh     — start services"
echo -e "    sudo ./stop.sh      — stop services"
echo -e "    sudo ./status.sh    — check status"
echo -e "    sudo ./logs.sh      — view logs"
echo -e "    sudo ./rebuild.sh   — rebuild + restart after code changes"
echo ""
if [[ "$API_OK" == "true" ]]; then
  success "API server is up on port ${API_PORT}"
else
  warn "API server is still starting up. Run: sudo ./logs.sh"
fi
if [[ "$NGINX_OK" == "true" ]]; then
  success "Nginx / dashboard is serving on port 80"
else
  warn "Nginx may still be starting. Check: systemctl status nginx"
fi
echo ""
