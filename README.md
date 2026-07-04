# Phone Intelligence Platform

A self-hosted phone number intelligence API with admin dashboard. Fully offline — no paid third-party carrier APIs required.

**What it tells you about any phone number:**
line type · carrier · geolocation · fraud score · spam/DNC check · VoIP detection · prepaid flag · carrier type · heuristic HLR status · reassignment risk

---

## Quick Start (Ubuntu Server)

```bash
git clone https://github.com/your-username/phone-intelligence.git
cd phone-intelligence
chmod +x setup.sh
sudo ./setup.sh
```

**With HTTPS (recommended for production):**
```bash
sudo ./setup.sh --domain yourdomain.com --email admin@yourdomain.com
```

That's it. The script installs everything automatically and starts all services. Takes ~3–5 minutes on a fresh server.

**Admin password:** `Brokenlove121@`

---

## What the Setup Script Does

| Step | Action |
|------|--------|
| 1 | Installs Node.js 20, Python 3, PostgreSQL, Nginx |
| 2 | Creates PostgreSQL database + user automatically |
| 3 | Installs all Node.js workspace dependencies (`pnpm`) |
| 4 | Applies database schema (Drizzle push) |
| 5 | Builds API server (esbuild bundle) |
| 6 | Builds dashboard (React → static files) |
| 7 | Configures Nginx: serves dashboard + proxies `/api/` |
| 8 | Creates systemd service — runs forever, restarts on crash, starts on boot |
| 9 | (Optional) Installs Let's Encrypt SSL via Certbot |
| 10 | Opens firewall ports 22, 80, 443 via ufw |

**Re-running is safe** — the script is fully idempotent.

---

## Access

| URL | Description |
|-----|-------------|
| `http://your-server/` | Admin dashboard |
| `http://your-server/api/` | REST API |
| `http://your-server/api/healthz` | Health check |

---

## API Reference

### Authentication

Every lookup request needs an `X-API-Key` header. Create keys in the dashboard → **API Keys** tab.

```bash
curl "http://your-server/api/phone/lookup?number=+14155552671" \
  -H "X-API-Key: pk_your_key_here"
```

### Endpoints

#### `GET /api/phone/lookup` — Single number lookup

```bash
curl "http://your-server/api/phone/lookup?number=%2B14155552671" \
  -H "X-API-Key: pk_your_key_here"
```

**Response:**
```json
{
  "valid": true,
  "e164": "+14155552671",
  "national_format": "(415) 555-2671",
  "line_type": "Wireless",
  "carrier": "AT&T Mobility",
  "ocn": "6529",
  "ocn_name": "New Cingular Wireless PCS - GA",
  "ocn_type": "WIRELESS",
  "state": "CA",
  "rate_center": "SAN FRANCISCO",
  "country": "US",
  "city": "San Francisco",
  "region": "California",
  "timezones": ["America/Los_Angeles"],
  "risk_score": 5,
  "risky": false,
  "spam": false,
  "dnc": false,
  "voip": false,
  "prepaid": false,
  "active": true,
  "carrier_type": { "type": "MNO", "confidence": "heuristic" },
  "hlr_status": { "reachable_estimate": true, "confidence": "low" },
  "rnd_risk": { "risk_level": "low", "risk_score": 10 },
  "name": null,
  "reassigned": null
}
```

#### `POST /api/phone/batch` — Batch lookup (up to 100 numbers)

```bash
curl -X POST "http://your-server/api/phone/batch" \
  -H "X-API-Key: pk_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"numbers":["+14155552671","+12125551234"]}'
```

**Response:**
```json
{
  "total": 2,
  "succeeded": 2,
  "failed": 0,
  "results": [
    { "number": "+14155552671", "result": { ... } },
    { "number": "+12125551234", "result": { ... } }
  ]
}
```

#### `GET /api/healthz` — Health check (no auth)

```bash
curl "http://your-server/api/healthz"
# → {"status":"ok"}
```

### Admin Endpoints (require `X-Admin-Secret` header)

```bash
# Create API key
curl -X POST "http://your-server/api/admin/keys" \
  -H "X-Admin-Secret: Brokenlove121@" \
  -H "Content-Type: application/json" \
  -d '{"label":"Customer name"}'

# List all keys
curl "http://your-server/api/admin/keys" \
  -H "X-Admin-Secret: Brokenlove121@"

# Revoke a key
curl -X POST "http://your-server/api/admin/keys/1/revoke" \
  -H "X-Admin-Secret: Brokenlove121@"
```

### Response Field Reference

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `valid` | boolean | authoritative | Passes ITU E.164 validity check |
| `e164` | string | authoritative | Normalized E.164 format |
| `line_type` | string | authoritative | Wireless · Landline · VOIP · Toll Free · etc. |
| `carrier` | string | authoritative | Carrier name (may be empty for US mobile post-port) |
| `ocn` | string | NANPA/LCG | Operating Company Number (US NANP only) |
| `ocn_type` | string | NANPA/LCG | CLEC · ILEC · RBOC · WIRELESS · CABLE · PAGING |
| `state` | string | NANPA/LCG | US state abbreviation from NPA-NXX block |
| `rate_center` | string | NANPA/LCG | NANPA rate center name |
| `country` | string | authoritative | ISO 3166-1 alpha-2 |
| `city` | string | authoritative | City from libphonenumber geocoder |
| `risk_score` | 0–100 | heuristic | Composite fraud/risk score |
| `spam` | boolean | community | In community abuse/spam datasets |
| `dnc` | boolean | community | Community-proxy DNC flag (not official FTC registry) |
| `voip` | boolean | heuristic | VoIP/OTT line detected |
| `prepaid` | boolean | heuristic | Known prepaid/MVNO carrier |
| `hlr_status` | object | heuristic | Reachability estimate (not live SS7) |
| `rnd_risk` | object | heuristic | Reassignment risk (not FCC RND) |
| `name` | null | — | CNAM name — always null (requires paid live lookup) |

### Data Sources

| Label | Meaning |
|-------|---------|
| **authoritative** | Google `libphonenumber` (ITU/NANPA standard library) |
| **NANPA/LCG** | LocalCallingGuide.com NPA-NXX block assignment data |
| **heuristic** | Derived logic — clearly labeled, not carrier-verified |
| **community** | Crowd-sourced abuse/spam lists (jwoertink, Oros42) |

---

## Code Examples

**Python:**
```python
import requests

def lookup(number: str, api_key: str, base_url: str) -> dict:
    resp = requests.get(
        f"{base_url}/api/phone/lookup",
        params={"number": number},
        headers={"X-API-Key": api_key},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()

result = lookup("+14155552671", "pk_your_key", "http://your-server")
print(result["line_type"], result["risk_score"])
```

**JavaScript / Node.js:**
```javascript
async function lookup(number, apiKey, baseUrl) {
  const url = new URL(`${baseUrl}/api/phone/lookup`);
  url.searchParams.set("number", number);
  const res = await fetch(url, { headers: { "X-API-Key": apiKey } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const data = await lookup("+14155552671", "pk_your_key", "http://your-server");
console.log(data.line_type, data.risk_score);
```

**PHP:**
```php
function lookup(string $number, string $apiKey, string $baseUrl): array {
    $ch = curl_init("$baseUrl/api/phone/lookup?number=" . urlencode($number));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ["X-API-Key: $apiKey"],
        CURLOPT_TIMEOUT        => 30,
    ]);
    $body = curl_exec($ch);
    curl_close($ch);
    return json_decode($body, true);
}
```

---

## Managing Services

```bash
# Check status of all services
sudo ./status.sh

# Stream live API logs
sudo ./logs.sh

# Rebuild + restart after code changes
sudo ./rebuild.sh

# Pull latest git changes + rebuild + restart
sudo ./update.sh

# Direct systemd commands
sudo systemctl status  phone-api
sudo systemctl restart phone-api
sudo journalctl -u phone-api -f     # live logs
sudo systemctl reload  nginx
```

---

## Architecture

```
User Browser
     │
     ▼
  Nginx :80/:443
  ├── / ──────────────► Static files  (artifacts/dashboard/dist/public/)
  └── /api/ ──────────► Node.js :8080 (artifacts/api-server/dist/index.mjs)
                              │
                              ├── PostgreSQL  (api_keys table)
                              └── Python CLI  (phone-tool/phone_tool.py)
```

### Stack

| Layer | Technology |
|-------|-----------|
| API server | Express 5, Node.js 20, TypeScript |
| Dashboard | React 19, Vite, Tailwind CSS, shadcn/ui |
| Database | PostgreSQL + Drizzle ORM |
| Phone engine | Python 3 + `phonenumbers` (Google libphonenumber) |
| Build | esbuild (API), Vite (dashboard) |
| Package manager | pnpm workspaces |
| Process manager | systemd |
| Web server | Nginx |
| HTTPS | Let's Encrypt (Certbot) |

### Workspace Layout

```
├── artifacts/
│   ├── api-server/          Express API server
│   └── dashboard/           React admin dashboard
├── lib/
│   ├── api-spec/            OpenAPI spec (openapi.yaml)
│   ├── api-zod/             Generated Zod schemas
│   ├── api-client-react/    Generated React hooks
│   └── db/                  Drizzle schema + migrations
├── phone-tool/
│   ├── phone_tool.py        Phone intelligence engine
│   ├── requirements.txt     Python dependencies
│   └── data/                Offline spam/DNC/carrier datasets
├── setup.sh                 Ubuntu one-click setup
└── README.md                This file
```

---

## Design Decisions

- **100% offline / free** — no Twilio, Bandwidth, or other paid lookup APIs. All data comes from `libphonenumber`, NANPA public block data, and community datasets.
- **Honest about limitations** — every heuristic field is labeled as such. No field claims live-data accuracy.
- **No billing** — the platform provides the working API + key management. Payment collection (if monetizing) is handled outside this app.
- **Soft deletes** — revoked API keys are never hard-deleted, preserving usage history.

---

## Requirements

- Ubuntu 20.04, 22.04, or 24.04 (x86-64)
- Root / sudo access
- 1 GB RAM minimum (2 GB recommended)
- 2 GB free disk space
- Internet access during setup (for package installation)
- A domain name (optional, for HTTPS)

---

## License

MIT
