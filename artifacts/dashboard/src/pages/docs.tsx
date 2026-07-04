import { useState } from 'react';
import {
  Copy, Check, BookOpen, Shield, Zap, Code2,
  Globe, AlertCircle, Database, Key,
  Lock, CheckCircle2, XCircle, Info
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// ── Copy button ──────────────────────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
      className="absolute top-2.5 right-2.5 p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ── Code block ───────────────────────────────────────────────────────────────
function Code({ code, lang = 'bash' }: { code: string; lang?: string }) {
  return (
    <div className="relative group">
      <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 pr-10 text-xs font-mono text-zinc-200 overflow-x-auto leading-relaxed">
        <code>{code.trim()}</code>
      </pre>
      <CopyBtn text={code.trim()} />
      <span className="absolute bottom-2 right-2 text-[9px] font-mono text-zinc-600 uppercase tracking-widest hidden group-hover:block">{lang}</span>
    </div>
  );
}

// ── Method badge ─────────────────────────────────────────────────────────────
function Method({ m }: { m: 'GET' | 'POST' }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wide
      ${m === 'GET' ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                    : 'bg-green-500/15 text-green-400 border border-green-500/30'}`}>
      {m}
    </span>
  );
}

// ── Endpoint header ──────────────────────────────────────────────────────────
function Endpoint({ method, path, desc, auth }: { method: 'GET' | 'POST'; path: string; desc: string; auth?: string }) {
  return (
    <div className="flex flex-col gap-1.5 pb-4 border-b border-border/40 mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Method m={method} />
        <code className="font-mono text-sm text-foreground font-semibold">{path}</code>
        {auth && (
          <Badge variant="outline" className="text-[9px] font-mono text-amber-400 border-amber-400/30 gap-1">
            <Lock className="w-2.5 h-2.5" />{auth}
          </Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

// ── Parameter table ──────────────────────────────────────────────────────────
function Param({ name, type, required, desc }: { name: string; type: string; required?: boolean; desc: string }) {
  return (
    <tr className="border-b border-border/20 hover:bg-muted/5">
      <td className="px-3 py-2.5 font-mono text-xs text-cyan-400 whitespace-nowrap">
        {name}
        {required && <span className="ml-1 text-red-400 text-[9px]">*</span>}
      </td>
      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">{type}</td>
      <td className="px-3 py-2.5 text-xs text-foreground/80">{desc}</td>
    </tr>
  );
}

// ── Response field row ───────────────────────────────────────────────────────
const SOURCE_COLORS: Record<string, string> = {
  authoritative: 'text-green-400 border-green-400/30',
  heuristic: 'text-amber-400 border-amber-400/30',
  community: 'text-purple-400 border-purple-400/30',
  'NANPA/LCG': 'text-blue-400 border-blue-400/30',
};
function Field({ name, type, source, desc }: { name: string; type: string; source?: string; desc: string }) {
  const cls = source ? SOURCE_COLORS[source] ?? 'text-zinc-400 border-zinc-400/30' : '';
  return (
    <tr className="border-b border-border/20 hover:bg-muted/5">
      <td className="px-3 py-2.5 font-mono text-xs text-cyan-400 whitespace-nowrap">{name}</td>
      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">{type}</td>
      {source && (
        <td className="px-3 py-2.5">
          <Badge variant="outline" className={`text-[9px] font-mono ${cls}`}>{source}</Badge>
        </td>
      )}
      <td className="px-3 py-2.5 text-xs text-foreground/80">{desc}</td>
    </tr>
  );
}

// ── Info callout ─────────────────────────────────────────────────────────────
function Callout({ type = 'info', children }: { type?: 'info' | 'warn' | 'tip'; children: React.ReactNode }) {
  const styles = {
    info: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
    warn: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    tip:  'bg-green-500/10 border-green-500/30 text-green-300',
  }[type];
  const Icon = type === 'warn' ? AlertCircle : type === 'tip' ? CheckCircle2 : Info;
  return (
    <div className={`flex gap-2.5 border rounded-lg p-3.5 text-xs leading-relaxed ${styles}`}>
      <Icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      <div>{children}</div>
    </div>
  );
}

// ── Section wrapper ──────────────────────────────────────────────────────────
function Section({ id, title, icon: Icon, children }: { id?: string; title: string; icon?: React.ComponentType<any>; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-5 scroll-mt-6">
      <h2 className="font-mono text-sm font-bold text-foreground flex items-center gap-2 uppercase tracking-widest border-b border-border/40 pb-2">
        {Icon && <Icon className="w-4 h-4 text-primary" />}
        {title}
      </h2>
      {children}
    </section>
  );
}

// ── Table wrapper ─────────────────────────────────────────────────────────────
function Table({ cols, children }: { cols: string[]; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/20">
            {cols.map(c => (
              <th key={c} className="px-3 py-2 text-left font-mono text-[10px] text-muted-foreground uppercase tracking-widest">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

// ── Simple tab switcher (no Radix dependency) ─────────────────────────────────
function CodeTabs({ apiBase }: { apiBase: string }) {
  const [active, setActive] = useState('curl');
  const langs = ['curl', 'python', 'javascript', 'php'];
  const examples: Record<string, { lang: string; code: string }> = {
    curl: {
      lang: 'bash',
      code: `curl "${apiBase}/phone/lookup?number=%2B14155552671" \\
  -H "X-API-Key: pk_your_key_here"`,
    },
    python: {
      lang: 'python',
      code: `import requests

API_KEY = "pk_your_key_here"
API_BASE = "${apiBase}"

def lookup(number: str) -> dict:
    resp = requests.get(
        f"{API_BASE}/phone/lookup",
        params={"number": number},
        headers={"X-API-Key": API_KEY},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()

result = lookup("+14155552671")
print(result["line_type"], result["risk_score"])`,
    },
    javascript: {
      lang: 'javascript',
      code: `const API_KEY = "pk_your_key_here";
const API_BASE = "${apiBase}";

async function lookup(number) {
  const url = new URL(\`\${API_BASE}/phone/lookup\`);
  url.searchParams.set("number", number);
  const res = await fetch(url, { headers: { "X-API-Key": API_KEY } });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const data = await lookup("+14155552671");
console.log(data.line_type, data.risk_score);`,
    },
    php: {
      lang: 'php',
      code: `<?php
$apiKey  = "pk_your_key_here";
$apiBase = "${apiBase}";
$number  = "+14155552671";

$ch = curl_init("$apiBase/phone/lookup?number=" . urlencode($number));
curl_setopt_array($ch, [
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER     => ["X-API-Key: $apiKey"],
  CURLOPT_TIMEOUT        => 30,
]);
$body = curl_exec($ch);
curl_close($ch);
$data = json_decode($body, true);
echo $data['line_type'] . ' — risk: ' . $data['risk_score'];`,
    },
  };
  return (
    <div className="space-y-0">
      <div className="flex gap-0.5 bg-zinc-900 rounded-t-lg px-2 pt-2 border border-zinc-800 border-b-0">
        {langs.map(l => (
          <button
            key={l}
            onClick={() => setActive(l)}
            className={`px-3 py-1 rounded-t text-[10px] font-mono transition-colors
              ${active === l
                ? 'bg-zinc-950 text-zinc-200 border border-zinc-800 border-b-0 -mb-px pb-1.5'
                : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {l}
          </button>
        ))}
      </div>
      <Code code={examples[active].code} lang={examples[active].lang} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export function Docs() {
  const apiBase = window.location.origin + '/api';
  const [activeSection, setActiveSection] = useState('quickstart');

  const NAV = [
    { id: 'quickstart', label: 'Quick Start', icon: Zap },
    { id: 'auth',       label: 'Authentication', icon: Key },
    { id: 'lookup',     label: 'Phone Lookup', icon: Globe },
    { id: 'batch',      label: 'Batch Lookup', icon: Database },
    { id: 'admin',      label: 'Admin API', icon: Shield },
    { id: 'fields',     label: 'Response Fields', icon: Code2 },
    { id: 'errors',     label: 'Errors & Limits', icon: AlertCircle },
  ];

  return (
    <div className="max-w-5xl space-y-2">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3 pb-4 border-b border-border/40">
        <BookOpen className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
        <div>
          <h1 className="font-mono text-xl font-bold tracking-wide">API Reference</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Phone Number Intelligence — offline carrier, line type, fraud score, geolocation, spam &amp; DNC analysis.
            No paid third-party APIs required.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="font-mono text-[10px] text-green-400 border-green-400/30">v0.2</Badge>
            <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono text-muted-foreground">{apiBase}</code>
          </div>
        </div>
      </div>

      <div className="flex gap-6 pt-2">
        {/* ── Sticky sidebar nav ───────────────────────────────────────── */}
        <nav className="hidden lg:flex flex-col gap-0.5 w-44 flex-shrink-0 sticky top-4 self-start">
          {NAV.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              onClick={() => setActiveSection(id)}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-xs font-mono transition-colors
                ${activeSection === id
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'}`}
            >
              <Icon className="w-3 h-3 flex-shrink-0" />
              {label}
            </a>
          ))}
          <div className="mt-4 pt-4 border-t border-border/40 space-y-1">
            <p className="px-2.5 text-[9px] font-mono text-muted-foreground/60 uppercase tracking-widest">Data Sources</p>
            {[
              { dot: 'bg-green-400', label: 'Authoritative' },
              { dot: 'bg-blue-400',  label: 'NANPA / LCG' },
              { dot: 'bg-amber-400', label: 'Heuristic' },
              { dot: 'bg-purple-400',label: 'Community' },
            ].map(({ dot, label }) => (
              <div key={label} className="flex items-center gap-2 px-2.5 py-0.5">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                <span className="text-[10px] text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </nav>

        {/* ── Main content ─────────────────────────────────────────────── */}
        <div className="flex-1 space-y-10 min-w-0">

          {/* QUICK START */}
          <Section id="quickstart" title="Quick Start" icon={Zap}>
            <p className="text-sm text-muted-foreground">
              Three steps to your first phone lookup — takes under 2 minutes.
            </p>
            <div className="space-y-3">
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold font-mono flex items-center justify-center">1</span>
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium">Create an API key</p>
                  <p className="text-xs text-muted-foreground">Go to the <a href="/keys" className="text-primary underline underline-offset-2">API Keys</a> page and click <strong>New Key</strong>. Copy the key that appears.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold font-mono flex items-center justify-center">2</span>
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium">Make your first request</p>
                  <Code code={`curl "${apiBase}/phone/lookup?number=%2B14155552671" \\
  -H "X-API-Key: pk_your_key_here"`} />
                </div>
              </div>
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold font-mono flex items-center justify-center">3</span>
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium">Read the result</p>
                  <Code lang="json" code={`{
  "valid": true,
  "e164": "+14155552671",
  "line_type": "Wireless",
  "carrier": "AT&T Mobility",
  "country": "US",
  "state": "CA",
  "city": "San Francisco",
  "risk_score": 5,
  "spam": false,
  "voip": false,
  "active": true
}`} />
                </div>
              </div>
            </div>

            <Callout type="tip">
              The <strong>Lookup</strong> tab in this dashboard lets you test any number instantly without writing code.
            </Callout>

            <p className="text-sm font-medium mt-2">Code examples</p>
            <CodeTabs apiBase={apiBase} />
          </Section>

          {/* AUTH */}
          <Section id="auth" title="Authentication" icon={Key}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-semibold font-mono">X-API-Key</span>
                  <Badge variant="outline" className="text-[9px] font-mono text-green-400 border-green-400/30">Lookup endpoints</Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Required for all phone lookup calls. Create and manage keys on the
                  <a href="/keys" className="text-primary underline ml-1">API Keys page</a>.
                  Keys look like <code className="bg-muted px-1 rounded font-mono">pk_9fac70ab…</code>
                </p>
                <Code code={`X-API-Key: pk_your_key_here`} lang="http" />
              </div>
              <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-semibold font-mono">X-Admin-Secret</span>
                  <Badge variant="outline" className="text-[9px] font-mono text-amber-400 border-amber-400/30">Admin endpoints</Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Required for key management (create/list/revoke). Set via the
                  <code className="bg-muted px-1 rounded font-mono mx-1">ADMIN_API_SECRET</code>
                  environment variable on the server.
                </p>
                <Code code={`X-Admin-Secret: your_admin_secret`} lang="http" />
              </div>
            </div>
            <Callout type="warn">
              Never expose your <code>X-API-Key</code> in client-side code or public repositories.
              Treat it like a password — revoke and replace immediately if compromised.
            </Callout>
          </Section>

          {/* SINGLE LOOKUP */}
          <Section id="lookup" title="Phone Lookup" icon={Globe}>
            <Endpoint
              method="GET"
              path="/api/phone/lookup"
              desc="Look up a single phone number. Returns the full intelligence report including line type, carrier, location, fraud score, spam flags, and more."
              auth="X-API-Key"
            />

            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">Parameters</p>
            <Table cols={['Parameter', 'Type', 'Description']}>
              <Param name="number" type="string" required desc='Phone number in any common format. E.164 strongly recommended: +14155552671. Non-E.164 is assumed US/Canada (+1).' />
            </Table>

            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-2">Number formats accepted</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                ['+14155552671', 'E.164 — preferred'],
                ['4155552671',   'US 10-digit'],
                ['(415) 555-2671','National format'],
                ['+447911123456', 'International'],
              ].map(([ex, label]) => (
                <div key={ex} className="rounded border border-border bg-muted/10 p-2 space-y-1">
                  <code className="font-mono text-xs text-foreground">{ex}</code>
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-2">Full response example</p>
            <Code lang="json" code={`{
  "valid": true,
  "possible": true,
  "e164": "+14155552671",
  "national_format": "(415) 555-2671",
  "international_format": "+1 415-555-2671",
  "line_type": "Wireless",
  "line_type_source": "lcg_npa_nxx",
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
  "fraud_score": 5,
  "risky": false,
  "spam": false,
  "dnc": false,
  "voip": false,
  "prepaid": false,
  "active": true,
  "recent_abuse": false,
  "carrier_type": {
    "type": "MNO",
    "confidence": "heuristic",
    "description": "Major mobile network operator"
  },
  "hlr_status": {
    "method": "heuristic",
    "reachable_estimate": true,
    "confidence": "low",
    "signals": ["Pass: not in spam lists", "Pass: valid US wireless"]
  },
  "rnd_risk": {
    "risk_level": "low",
    "risk_score": 10,
    "reason": "Area code not in high-exhaust set"
  },
  "ported_estimate": {
    "ported_estimate": false,
    "confidence": "low"
  },
  "name": null,
  "reassigned": null
}`} />
          </Section>

          {/* BATCH */}
          <Section id="batch" title="Batch Lookup" icon={Database}>
            <Endpoint
              method="POST"
              path="/api/phone/batch"
              desc="Look up up to 100 numbers in a single request. Results are returned in the same order as input. Each entry contains either the full result or an error for that number."
              auth="X-API-Key"
            />

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">Request body</p>
                <Code lang="json" code={`{
  "numbers": [
    "+14155552671",
    "+12125551234",
    "+447911123456"
  ]
}`} />
              </div>
              <div className="space-y-2">
                <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">Response</p>
                <Code lang="json" code={`{
  "total": 3,
  "succeeded": 3,
  "failed": 0,
  "results": [
    {
      "number": "+14155552671",
      "result": { "valid": true, "line_type": "Wireless", ... }
    },
    {
      "number": "+12125551234",
      "result": { "valid": true, "line_type": "Wireless", ... }
    },
    {
      "number": "+447911123456",
      "result": { "valid": true, "country": "GB", ... }
    }
  ]
}`} />
              </div>
            </div>

            <Table cols={['Limit', 'Value']}>
              <tr className="border-b border-border/20">
                <td className="px-3 py-2.5 font-mono text-xs text-cyan-400">Max numbers per request</td>
                <td className="px-3 py-2.5 text-xs text-foreground/80">100</td>
              </tr>
              <tr className="border-b border-border/20">
                <td className="px-3 py-2.5 font-mono text-xs text-cyan-400">Concurrency</td>
                <td className="px-3 py-2.5 text-xs text-foreground/80">10 parallel lookups</td>
              </tr>
              <tr className="border-b border-border/20">
                <td className="px-3 py-2.5 font-mono text-xs text-cyan-400">Content-Type</td>
                <td className="px-3 py-2.5 font-mono text-xs text-foreground/80">application/json</td>
              </tr>
            </Table>

            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-2">Batch with curl</p>
            <Code code={`curl -X POST "${apiBase}/phone/batch" \\
  -H "X-API-Key: pk_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"numbers":["+14155552671","+12125551234"]}'`} />
          </Section>

          {/* ADMIN API */}
          <Section id="admin" title="Admin API" icon={Shield}>
            <Callout type="warn">
              All admin endpoints require <code className="font-mono bg-black/30 px-1 rounded">X-Admin-Secret</code> header matching
              the server's <code className="font-mono bg-black/30 px-1 rounded">ADMIN_API_SECRET</code> environment variable.
              Never expose this secret to end users.
            </Callout>

            {/* Create key */}
            <div className="space-y-3 pt-2">
              <Endpoint method="POST" path="/api/admin/keys" desc="Create a new API key with a descriptive label." auth="X-Admin-Secret" />
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Request body</p>
                  <Code lang="json" code={`{ "label": "Customer name or use-case" }`} />
                </div>
                <div>
                  <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Response (201 Created)</p>
                  <Code lang="json" code={`{
  "id": 1,
  "key": "pk_9fac70ab1f402498c755b1b4...",
  "label": "Customer name or use-case",
  "active": true,
  "requestCount": 0,
  "createdAt": "2026-07-04T23:37:25.027Z",
  "lastUsedAt": null
}`} />
                </div>
              </div>
              <Code code={`curl -X POST "${apiBase}/admin/keys" \\
  -H "X-Admin-Secret: your_admin_secret" \\
  -H "Content-Type: application/json" \\
  -d '{"label":"My Customer"}'`} />
            </div>

            {/* List keys */}
            <div className="space-y-3 pt-4 border-t border-border/20">
              <Endpoint method="GET" path="/api/admin/keys" desc="List all API keys (active and revoked)." auth="X-Admin-Secret" />
              <Code code={`curl "${apiBase}/admin/keys" \\
  -H "X-Admin-Secret: your_admin_secret"`} />
            </div>

            {/* Revoke */}
            <div className="space-y-3 pt-4 border-t border-border/20">
              <Endpoint method="POST" path="/api/admin/keys/:id/revoke" desc="Revoke an API key by its numeric ID. Revoked keys are kept in the database for usage history but will be rejected on all lookup requests." auth="X-Admin-Secret" />
              <Code code={`# Replace 42 with the actual key ID from the list endpoint
curl -X POST "${apiBase}/admin/keys/42/revoke" \\
  -H "X-Admin-Secret: your_admin_secret"`} />
            </div>

            {/* Health */}
            <div className="space-y-3 pt-4 border-t border-border/20">
              <Endpoint method="GET" path="/api/healthz" desc="Server health check. No authentication required. Returns 200 OK when the server is running." />
              <Code code={`curl "${apiBase}/healthz"
# → {"status":"ok"}`} />
            </div>
          </Section>

          {/* RESPONSE FIELDS */}
          <Section id="fields" title="Response Fields" icon={Code2}>
            <div className="flex flex-wrap gap-3 mb-3 text-xs text-muted-foreground">
              {[
                { dot: 'bg-green-400', label: 'authoritative — from phonenumbers library (ITU/NANPA)' },
                { dot: 'bg-blue-400',  label: 'NANPA/LCG — from LocalCallingGuide block data' },
                { dot: 'bg-amber-400', label: 'heuristic — derived logic (labeled, not carrier-verified)' },
                { dot: 'bg-purple-400',label: 'community — crowd-sourced abuse/spam lists' },
              ].map(({ dot, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${dot}`} />
                  <span>{label}</span>
                </div>
              ))}
            </div>

            <Table cols={['Field', 'Type', 'Source', 'Description']}>
              <Field name="valid"               type="boolean"      source="authoritative" desc="Passes ITU E.164 validity check via libphonenumber" />
              <Field name="possible"            type="boolean"      source="authoritative" desc="Could possibly be a real number (less strict than valid)" />
              <Field name="e164"                type="string"       source="authoritative" desc="E.164 canonical format, e.g. +14155552671" />
              <Field name="national_format"     type="string"       source="authoritative" desc='National format, e.g. "(415) 555-2671" for US numbers' />
              <Field name="international_format"type="string"       source="authoritative" desc='International format, e.g. "+1 415-555-2671"' />
              <Field name="line_type"           type="string"       source="authoritative" desc="Wireless · Landline · VOIP · Toll Free · Premium Rate · Paging · Unknown" />
              <Field name="line_type_source"    type="string"       source="heuristic"     desc="Where line_type came from: phonenumbers · lcg_npa_nxx · npa_nxx_carrier_db · heuristic" />
              <Field name="carrier"             type="string"       source="authoritative" desc="Carrier name. Often empty for US mobile (number portability hides post-port carrier)" />
              <Field name="ocn"                 type="string"       source="NANPA/LCG"     desc="Operating Company Number — NANPA block-holder assignment (US NANP only)" />
              <Field name="ocn_name"            type="string"       source="NANPA/LCG"     desc="Operating company legal name from LocalCallingGuide / NANPA data" />
              <Field name="ocn_type"            type="string"       source="NANPA/LCG"     desc="CLEC · ILEC · RBOC · WIRELESS · CABLE · PAGING (US NANP only)" />
              <Field name="state"               type="string"       source="NANPA/LCG"     desc='US state abbreviation from NPA-NXX block assignment, e.g. "CA"' />
              <Field name="rate_center"         type="string"       source="NANPA/LCG"     desc="NANPA rate center name, e.g. SAN FRANCISCO. US NANP only." />
              <Field name="country"             type="string"       source="authoritative" desc="ISO 3166-1 alpha-2 country code, e.g. US, GB, CA" />
              <Field name="city"                type="string"       source="authoritative" desc="City from libphonenumber geocoder (may be empty for mobile numbers)" />
              <Field name="region"              type="string"       source="authoritative" desc="State/province from libphonenumber geocoder" />
              <Field name="timezones"           type="string[]"     source="authoritative" desc="IANA timezone IDs, e.g. [America/Los_Angeles]" />
              <Field name="risk_score"          type="number 0–100" source="heuristic"     desc="Composite risk score. Higher = more suspicious. Factors: spam hits, VoIP, premium rate, pattern flags, area code risk." />
              <Field name="fraud_score"         type="number 0–100" source="heuristic"     desc="Alias of risk_score. Included for API compatibility." />
              <Field name="risky"               type="boolean"      source="heuristic"     desc="True if risk_score ≥ 75, in abuse lists, or is a premium rate number" />
              <Field name="spam"                type="boolean"      source="community"     desc="Found in community abuse/spam datasets (jwoertink/blocked-numbers, Oros42/phone-blacklist)" />
              <Field name="recent_abuse"        type="boolean"      source="community"     desc="Subset of spam — flagged in more recent community reports" />
              <Field name="dnc"                 type="boolean"      source="community"     desc="Community-proxy DNC flag. NOT the official FTC Do Not Call Registry (that requires paid access)." />
              <Field name="voip"                type="boolean"      source="heuristic"     desc="VoIP/OTT line detected via phonenumbers type, known VoIP NXX blocks, or carrier name matching" />
              <Field name="prepaid"             type="boolean"      source="heuristic"     desc="Carrier name matches known prepaid / MVNO brands (Boost, Cricket, TracFone, etc.)" />
              <Field name="active"              type="boolean"      source="heuristic"     desc="Heuristic reachability estimate. True if not in spam lists and no other unreachable signals." />
              <Field name="carrier_type.type"   type="string"       source="heuristic"     desc="MNO · MVNO · CLEC · ILEC · VoIP/OTT · Toll-Free · Premium Rate · Unknown" />
              <Field name="hlr_status"          type="object"       source="heuristic"     desc="Heuristic reachability estimate. NOT a live SS7/HLR query (requires paid telecom gateway)." />
              <Field name="rnd_risk"            type="object"       source="heuristic"     desc="Heuristic reassignment risk. Real RND requires FCC paid subscription (reassigned.us)." />
              <Field name="ported_estimate"     type="object"       source="heuristic"     desc="Heuristic LNP porting estimate. Real porting status requires live NPAC query." />
              <Field name="name"                type="null"         source={undefined}     desc="CNAM subscriber name — always null (requires live CNAM carrier lookup, paid service)." />
              <Field name="reassigned"          type="null"         source={undefined}     desc="Reassignment status — always null (FCC RND paid subscription required)." />
            </Table>

            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-4">OCN Type Values</p>
            <Table cols={['OCN Type', 'Full Name', 'Examples']}>
              {[
                ['RBOC',     'Regional Bell Operating Company',     'AT&T (wireline), Verizon (wireline), CenturyLink/Lumen'],
                ['ILEC',     'Incumbent Local Exchange Carrier',     'Frontier, Windstream, Consolidated'],
                ['CLEC',     'Competitive Local Exchange Carrier',   'Bandwidth, Twilio, Telnyx, Commio, Flowroute'],
                ['WIRELESS', 'Wireless / Mobile Carrier',           'T-Mobile, US Cellular, C Spire, regional carriers'],
                ['CABLE',    'Cable Company (voice over cable)',     'Comcast Business, Spectrum (Charter), Cox'],
                ['PAGING',   'Paging / Messaging Carrier',          'Spok, USA Mobility'],
              ].map(([t, n, e]) => (
                <tr key={t} className="border-b border-border/20 hover:bg-muted/5">
                  <td className="px-3 py-2.5 font-mono text-xs text-cyan-400">{t}</td>
                  <td className="px-3 py-2.5 text-xs text-foreground/80">{n}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{e}</td>
                </tr>
              ))}
            </Table>
          </Section>

          {/* ERRORS & LIMITS */}
          <Section id="errors" title="Errors & Limits" icon={AlertCircle}>
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">HTTP Status Codes</p>
            <Table cols={['Status', 'Meaning', 'When it happens']}>
              {[
                ['200 OK',               <CheckCircle2 className="w-3.5 h-3.5 text-green-400 inline mr-1" />, 'Lookup completed successfully'],
                ['201 Created',          <CheckCircle2 className="w-3.5 h-3.5 text-green-400 inline mr-1" />, 'API key created successfully'],
                ['400 Bad Request',      <XCircle      className="w-3.5 h-3.5 text-red-400 inline mr-1"   />, 'Missing or invalid parameter (number, body, etc.)'],
                ['401 Unauthorized',     <XCircle      className="w-3.5 h-3.5 text-red-400 inline mr-1"   />, 'Missing X-API-Key, invalid key, or key is revoked'],
                ['404 Not Found',        <XCircle      className="w-3.5 h-3.5 text-amber-400 inline mr-1" />, 'Unknown endpoint or key ID not found'],
                ['500 Internal Error',   <XCircle      className="w-3.5 h-3.5 text-red-400 inline mr-1"   />, 'Server error — contact the operator'],
              ].map(([status, icon, when]) => (
                <tr key={String(status)} className="border-b border-border/20 hover:bg-muted/5">
                  <td className="px-3 py-2.5 font-mono text-xs text-foreground whitespace-nowrap">{status}</td>
                  <td className="px-3 py-2.5 text-xs">{icon}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{when}</td>
                </tr>
              ))}
            </Table>

            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-4">Error response format</p>
            <Code lang="json" code={`{
  "error": "Missing required 'number' query parameter"
}`} />

            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-4">Known limits</p>
            <div className="space-y-2 text-sm text-muted-foreground">
              {[
                ['Batch size',            'Max 100 numbers per POST /phone/batch request'],
                ['Batch concurrency',     '10 numbers processed in parallel within each batch'],
                ['OCN / state data',      'US NANP numbers only — empty strings for international'],
                ['NPA-NXX enrichment',    'First lookup per NPA-NXX hits LocalCallingGuide.com (~100–200 ms), then permanently cached locally'],
                ['CNAM',                  'Always null — requires paid live carrier lookup not provided by this platform'],
                ['HLR / active status',   'Heuristic only — real HLR requires live SS7 access (paid telecom gateway)'],
                ['DNC (Do Not Call)',      'Community proxy only — NOT the official FTC registry (paid telemarketer access required)'],
                ['RND (Reassigned Nums)', 'Heuristic risk only — real data requires FCC subscription at reassigned.us'],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-3 py-1 border-b border-border/20">
                  <span className="font-mono text-xs text-foreground w-44 flex-shrink-0">{k}</span>
                  <span className="text-xs">{v}</span>
                </div>
              ))}
            </div>

            <Callout type="info">
              All heuristic fields are clearly labeled in the response. No field claims carrier-verified or live-data accuracy.
              The platform is designed to be <strong>honest about its data sources</strong>.
            </Callout>
          </Section>

        </div>
      </div>
    </div>
  );
}
