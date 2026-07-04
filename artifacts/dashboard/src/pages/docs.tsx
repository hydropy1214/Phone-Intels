import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, BookOpen, Shield, Zap, Code2 } from 'lucide-react';

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button onClick={copy}
      className="absolute top-3 right-3 p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      title="Copy">
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function CodeBlock({ code, lang = 'bash' }: { code: string; lang?: string }) {
  return (
    <div className="relative">
      <pre className="bg-black/40 border border-border rounded-lg p-4 text-xs font-mono text-foreground/90 overflow-x-auto">
        <code>{code.trim()}</code>
      </pre>
      <CopyBtn text={code.trim()} />
    </div>
  );
}

function Section({ title, children, icon: Icon }: { title: string; children: React.ReactNode; icon?: React.ComponentType<any> }) {
  return (
    <section className="space-y-4">
      <h2 className="font-mono text-base font-semibold text-foreground flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-primary" />}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({ name, type, desc, badge }: { name: string; type: string; desc: string; badge?: string }) {
  return (
    <tr className="border-b border-border/30 hover:bg-muted/5 transition-colors">
      <td className="px-4 py-2.5 font-mono text-xs text-primary whitespace-nowrap">{name}</td>
      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">{type}</td>
      <td className="px-4 py-2.5 text-xs text-foreground/80">
        {badge && <Badge variant="outline" className="font-mono text-[9px] mr-2 text-cyan-400 border-cyan-400/30">{badge}</Badge>}
        {desc}
      </td>
    </tr>
  );
}

export function Docs() {
  const baseUrl = window.location.origin + (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const apiBase = baseUrl + '/api';

  return (
    <div className="space-y-10 max-w-4xl">

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <BookOpen className="w-5 h-5 text-primary" />
          <h1 className="font-mono text-xl font-bold tracking-wide">API Reference</h1>
        </div>
        <p className="text-sm text-muted-foreground font-mono">
          Phone Number Intelligence API — offline carrier, OCN, line type, state, and risk analysis.
          No live carrier APIs required.
        </p>
      </div>

      {/* Auth */}
      <Section title="Authentication" icon={Shield}>
        <p className="text-sm text-muted-foreground">
          Every lookup endpoint requires an <span className="font-mono text-foreground bg-muted px-1 rounded">X-API-Key</span> header.
          Create keys on the <a href="/keys" className="text-primary underline">API Keys</a> page.
        </p>
        <CodeBlock code={`curl -H "X-API-Key: pk_your_key_here" \\
  "${apiBase}/phone/lookup?number=+14155552671"`} />
      </Section>

      {/* Single lookup */}
      <Section title="GET /phone/lookup" icon={Zap}>
        <p className="text-sm text-muted-foreground">Look up a single phone number. Returns the full intelligence report.</p>
        <CodeBlock code={`GET ${apiBase}/phone/lookup?number=+14155552671
X-API-Key: pk_your_key_here`} />

        <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest mt-4 mb-2">Parameters</p>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="px-4 py-2 text-left font-mono text-[10px] text-muted-foreground uppercase tracking-widest">Param</th>
                <th className="px-4 py-2 text-left font-mono text-[10px] text-muted-foreground uppercase tracking-widest">Type</th>
                <th className="px-4 py-2 text-left font-mono text-[10px] text-muted-foreground uppercase tracking-widest">Description</th>
              </tr>
            </thead>
            <tbody>
              <Field name="number" type="string (required)" desc='Phone number — E.164 preferred (+14155552671) but any common format works. Non-E.164 is normalized to US/Canada.' />
            </tbody>
          </table>
        </div>

        <p className="font-mono text-xs text-muted-foreground uppercase tracking-widest mt-4 mb-2">Example response</p>
        <CodeBlock lang="json" code={`{
  "valid": true,
  "e164": "+14155552671",
  "national_format": "(415) 555-2671",
  "line_type": "Wireless",
  "line_type_source": "lcg_npa_nxx",
  "carrier": "AT&T Mobility",
  "ocn": "6529",
  "ocn_name": "New Cingular Wireless PCS - GA",
  "ocn_type": "WIRELESS",
  "state": "CA",
  "rate_center": "SAN FRANCISCO",
  "country": "US",
  "region": "California",
  "risk_score": 15,
  "risky": false,
  "spam": false,
  "dnc": false,
  "voip": false,
  "prepaid": false,
  "active": true,
  "carrier_type": {
    "type": "MNO",
    "confidence": "heuristic",
    "description": "Major mobile network operator — AT&T Mobility"
  },
  "hlr_status": { "reachable_estimate": true, "confidence": "low", ... },
  "rnd_risk": { "risk_level": "low", "risk_score": 35, ... }
}`} />
      </Section>

      {/* Batch */}
      <Section title="POST /phone/batch" icon={Code2}>
        <p className="text-sm text-muted-foreground">Look up up to 100 numbers in one request. Results are returned in the same order as the input.</p>
        <CodeBlock code={`POST ${apiBase}/phone/batch
X-API-Key: pk_your_key_here
Content-Type: application/json

{
  "numbers": ["+14155552671", "+12125551234", "+447911123456"]
}`} />
        <CodeBlock lang="json" code={`{
  "total": 3,
  "succeeded": 3,
  "failed": 0,
  "results": [
    { "number": "+14155552671", "result": { ... } },
    { "number": "+12125551234", "result": { ... } },
    { "number": "+447911123456", "result": { ... } }
  ]
}`} />
      </Section>

      {/* Response fields */}
      <Section title="Response Fields">
        <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="px-4 py-2.5 text-left font-mono text-[10px] text-muted-foreground uppercase tracking-widest">Field</th>
                <th className="px-4 py-2.5 text-left font-mono text-[10px] text-muted-foreground uppercase tracking-widest">Type</th>
                <th className="px-4 py-2.5 text-left font-mono text-[10px] text-muted-foreground uppercase tracking-widest">Description</th>
              </tr>
            </thead>
            <tbody>
              <Field name="valid" type="boolean" desc="Passes ITU E.164 validity check" badge="authoritative" />
              <Field name="e164" type="string" desc="E.164 formatted number (e.g. +14155552671)" badge="authoritative" />
              <Field name="national_format" type="string" desc='National format (e.g. "(415) 555-2671" for US)' badge="authoritative" />
              <Field name="line_type" type="string" desc="Wireless · Landline · VOIP · Toll Free · Premium Rate · Paging · Unknown" badge="authoritative" />
              <Field name="line_type_source" type="string" desc="Source of line type: phonenumbers · lcg_npa_nxx · npa_nxx_carrier_db · heuristic" />
              <Field name="carrier" type="string" desc="Carrier name. Often empty for US mobile (number portability prevents offline ID post-port)" badge="authoritative" />
              <Field name="ocn" type="string" desc="Operating Company Number — NANPA block holder assignment (US NANP only)" badge="NANPA/LCG" />
              <Field name="ocn_name" type="string" desc="Operating company name from LocalCallingGuide / NANPA data" badge="NANPA/LCG" />
              <Field name="ocn_type" type="string" desc="CLEC · ILEC · RBOC · WIRELESS · CABLE · PAGING (US NANP only)" badge="NANPA/LCG" />
              <Field name="state" type="string" desc='US state/territory abbreviation from NPA-NXX block (e.g. "CA", "TX")' badge="NANPA/LCG" />
              <Field name="rate_center" type="string" desc="NANPA rate center name (e.g. SAN FRANCISCO). US NANP only." badge="NANPA/LCG" />
              <Field name="country" type="string" desc="ISO 3166-1 alpha-2 country code (e.g. US, GB)" badge="authoritative" />
              <Field name="region" type="string" desc="State/province from phonenumbers geocoder" badge="authoritative" />
              <Field name="risk_score" type="number 0–100" desc="Composite risk score: spam hits, VoIP, premium rate, pattern flags, area code risk" badge="heuristic" />
              <Field name="risky" type="boolean" desc="True if risk_score ≥ 75, in abuse lists, or premium rate number" badge="heuristic" />
              <Field name="spam" type="boolean" desc="Found in community abuse/spam datasets" badge="community" />
              <Field name="dnc" type="boolean" desc="Community-proxy DNC flag (NOT the official FTC Do Not Call Registry)" badge="community" />
              <Field name="voip" type="boolean" desc="VoIP/OTT line (authoritative from phonenumbers or carrier heuristic)" badge="heuristic" />
              <Field name="prepaid" type="boolean" desc="Carrier name matches known prepaid / MVNO brands" badge="heuristic" />
              <Field name="carrier_type.type" type="string" desc="MNO · MVNO · CLEC · ILEC · VoIP/OTT · Toll-Free · Premium Rate · Wireline · Mobile · Unknown" badge="heuristic" />
              <Field name="hlr_status" type="object" desc="Heuristic reachability estimate. NOT a live SS7/HLR query — requires paid telecom gateway for real HLR." badge="heuristic" />
              <Field name="rnd_risk" type="object" desc="Heuristic reassignment risk. Real RND requires FCC paid subscription (reassigned.us)." badge="heuristic" />
              <Field name="ported_estimate" type="object" desc="Heuristic LNP porting estimate. Real porting status needs live NPAC query." badge="heuristic" />
              <Field name="name" type="null" desc="CNAM subscriber name — always null (requires live CNAM carrier lookup)" />
              <Field name="reassigned" type="null" desc="Reassigned status — always null (FCC RND paid subscription required)" />
            </tbody>
          </table>
        </div>
      </Section>

      {/* OCN types */}
      <Section title="OCN Type Reference">
        <p className="text-sm text-muted-foreground">
          The <span className="font-mono text-foreground bg-muted px-1 rounded">ocn_type</span> field
          comes directly from LocalCallingGuide / NANPA block assignment data.
        </p>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="px-4 py-2.5 text-left font-mono text-[10px] text-muted-foreground uppercase tracking-widest">OCN Type</th>
                <th className="px-4 py-2.5 text-left font-mono text-[10px] text-muted-foreground uppercase tracking-widest">Meaning</th>
                <th className="px-4 py-2.5 text-left font-mono text-[10px] text-muted-foreground uppercase tracking-widest">Examples</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['RBOC', 'Regional Bell Operating Company', 'AT&T, Verizon (wireline), CenturyLink/Lumen'],
                ['ILEC', 'Incumbent Local Exchange Carrier', 'Frontier, Windstream, Consolidated'],
                ['CLEC', 'Competitive Local Exchange Carrier', 'Bandwidth, Twilio, Telnyx, Lumen CLECs'],
                ['WIRELESS', 'Wireless / mobile carrier', 'T-Mobile, US Cellular, regional carriers'],
                ['CABLE', 'Cable company offering voice', 'Comcast Business, Charter/Spectrum, Cox'],
                ['PAGING', 'Paging / messaging carrier', 'Spok, USA Mobility'],
              ].map(([type, meaning, examples]) => (
                <tr key={type} className="border-b border-border/30 hover:bg-muted/5 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs text-cyan-400">{type}</td>
                  <td className="px-4 py-2.5 text-xs text-foreground/80">{meaning}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{examples}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Admin */}
      <Section title="Admin Endpoints (X-Admin-Secret)">
        <p className="text-sm text-muted-foreground">
          These endpoints require the <span className="font-mono text-foreground bg-muted px-1 rounded">X-Admin-Secret</span> header.
          Set the value via the <span className="font-mono text-foreground bg-muted px-1 rounded">ADMIN_API_SECRET</span> environment variable.
        </p>
        <div className="space-y-3">
          <CodeBlock code={`# Create a new API key
POST ${apiBase}/admin/keys
X-Admin-Secret: your_admin_secret
Content-Type: application/json
{ "label": "Customer name or use case" }

# List all keys
GET ${apiBase}/admin/keys
X-Admin-Secret: your_admin_secret

# Revoke a key
POST ${apiBase}/admin/keys/42/revoke
X-Admin-Secret: your_admin_secret`} />
        </div>
      </Section>

      {/* Rate limits & limits */}
      <Section title="Limits & Notes">
        <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
          <li>Batch endpoint: max 100 numbers per request, processed with concurrency of 10</li>
          <li>OCN / state / rate center data: US NANP numbers only; empty for international numbers</li>
          <li>OCN enrichment uses LocalCallingGuide.com free API; first lookup of each NPA-NXX makes one HTTP request (~100-200 ms), then cached permanently</li>
          <li>Carrier identification: authoritative for most international numbers; often blank for US mobile (number portability prevents offline lookup post-port)</li>
          <li>All heuristic fields are clearly labeled — no field claims carrier-verified accuracy</li>
          <li>DNC field is a community-proxy, NOT the official FTC Do Not Call Registry</li>
          <li>HLR / active status requires live SS7 access — all values shown are heuristic estimates</li>
        </ul>
      </Section>

    </div>
  );
}
