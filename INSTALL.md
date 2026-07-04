# Phone Intelligence API — Installation Guide

## Ubuntu / Debian Setup (22.04 LTS or later)

This guide gets the full stack running from scratch on a clean Ubuntu system.

---

## 1. System prerequisites

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential ca-certificates python3 python3-pip python3-venv
```

---

## 2. Node.js 20+

Install via NodeSource (LTS):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # should be 20.x or higher
```

---

## 3. pnpm (package manager)

```bash
sudo npm install -g pnpm
pnpm --version   # should be 9.x or higher
```

---

## 4. PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql <<'SQL'
CREATE USER phoneuser WITH PASSWORD 'changeme';
CREATE DATABASE phonedb OWNER phoneuser;
GRANT ALL PRIVILEGES ON DATABASE phonedb TO phoneuser;
SQL
```

Export the connection string (add to `~/.bashrc` or use a `.env` file):

```bash
export DATABASE_URL="postgresql://phoneuser:changeme@localhost:5432/phonedb"
```

---

## 5. Clone & install dependencies

```bash
git clone <your-repo-url> phone-intel
cd phone-intel
pnpm install
```

---

## 6. Python dependencies (phone tool)

```bash
pip3 install phonenumbers requests
# Verify:
python3 phone-tool/phone_tool.py --help
```

---

## 7. Environment variables

Create a `.env` or set these as shell exports:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | **Yes** | PostgreSQL connection string |
| `ADMIN_API_SECRET` | **Yes** | Secret for `X-Admin-Secret` header (choose a strong random value) |
| `PORT` | Set by runner | API server port (default 8080 for api-server) |

Generate a strong admin secret:
```bash
python3 -c "import secrets; print('secret_' + secrets.token_hex(20))"
```

Export it:
```bash
export ADMIN_API_SECRET="secret_<your-generated-value>"
```

---

## 8. Database schema

```bash
pnpm --filter @workspace/db run push
```

---

## 9. Download community spam datasets

```bash
python3 phone-tool/phone_tool.py --update
```

This downloads free community spam/abuse lists into `phone-tool/data/`. Run periodically to refresh.

---

## 10. Run the services

### Development (two terminals)

**Terminal 1 — API server** (port 8080):
```bash
pnpm --filter @workspace/api-server run dev
```

**Terminal 2 — Dashboard** (port 3000 or `$PORT`):
```bash
pnpm --filter @workspace/dashboard run dev
```

### Production

Build and start:
```bash
pnpm run build
PORT=8080 ADMIN_API_SECRET="secret_..." node artifacts/api-server/dist/index.mjs
```

Or use `pm2`:
```bash
sudo npm install -g pm2
pm2 start artifacts/api-server/dist/index.mjs --name "phone-api" \
  --env PORT=8080 \
  --env DATABASE_URL="postgresql://..." \
  --env ADMIN_API_SECRET="secret_..."
pm2 save
pm2 startup
```

---

## 11. First-time login

1. Open the dashboard in your browser
2. Enter your `ADMIN_API_SECRET` value at the login screen
3. Navigate to **API Keys** to create your first API key
4. Use the key as the `X-API-Key` header in your API calls

---

## 12. Verify the API is working

```bash
# Health check
curl http://localhost:8080/api/healthz

# Phone lookup (replace YOUR_API_KEY and phone number)
curl -H "X-API-Key: YOUR_API_KEY" \
  "http://localhost:8080/api/phone/lookup?number=+14155552671"
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `python3: command not found` | `sudo apt install python3` |
| `pip3: command not found` | `sudo apt install python3-pip` |
| `phonenumbers` import error | `pip3 install phonenumbers requests` |
| DB connection refused | Check `DATABASE_URL` and that PostgreSQL is running |
| Port already in use | Change `PORT` env var or kill the conflicting process |
| Blank dashboard | Check that the api-server workflow is running and responding on its port |
| OCN data blank on first lookup | Normal — LCG lookup runs live; result is cached for subsequent calls |
