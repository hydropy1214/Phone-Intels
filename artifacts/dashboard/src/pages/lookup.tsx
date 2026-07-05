import { useState, useRef, useEffect } from 'react';
import { useListApiKeys, usePhoneLookup, getPhoneLookupQueryKey } from '@workspace/api-client-react';
import { setApiKey } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import {
  Search, Loader2, X, Download, Trash2, ClipboardList,
  ChevronDown, ChevronRight, Globe, Phone, AlertTriangle,
} from 'lucide-react';

// ── phone helpers ──────────────────────────────────────────────────────────────

function normalizeE164(raw: string): string | null {
  const t = raw.trim();
  const d = t.replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  if (t.startsWith('+') && d.length >= 7 && d.length <= 15) return '+' + d;
  if (d.length >= 11 && d.length <= 15) return '+' + d;
  return null;
}

function extractMultiple(text: string): string[] {
  const hits: string[] = [];
  for (const m of text.matchAll(/\+[1-9]\d{6,14}/g)) hits.push(m[0]);
  for (const m of text.matchAll(/(?<![+\d])(?:1[-.\s]?)?\(?([2-9]\d{2})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})(?!\d)/g))
    hits.push(m[0]);
  const seen = new Set<string>();
  return hits
    .map(r => normalizeE164(r))
    .filter((n): n is string => !!n && !seen.has(n) && !!seen.add(n));
}

function resolveCarrier(data: any): string {
  if (data?.carrier) return data.carrier;
  const ct = data?.carrier_type?.type;
  return ct && ct !== 'Unknown' ? ct : '—';
}

// ── CSV export ─────────────────────────────────────────────────────────────────

function exportCSV(rows: string[], cache: Map<string, any>) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = 'Phone,Country,State,City,Valid,Risk Score,Carrier,Line Type,VoIP,Prepaid,DNC\n';
  const body = rows.map(phone => {
    const d = cache.get(phone);
    if (!d) return [phone, '', '', '', '', '', '', '', '', '', ''].map(esc).join(',');
    return [
      d.e164 ?? phone, d.country ?? '', d.state ?? '', d.city ?? '',
      d.valid ? 'true' : 'false',
      d.risk_score ?? d.fraud_score ?? 0,
      resolveCarrier(d), d.line_type ?? '',
      d.voip ? 'true' : 'false', d.prepaid ? 'true' : 'false',
      d.dnc ? 'true' : 'false',
    ].map(esc).join(',');
  }).join('\n');
  const blob = new Blob([header + body], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `phone_lookup_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

// ── main page ──────────────────────────────────────────────────────────────────

export function Lookup() {
  const { data: keys } = useListApiKeys();
  const activeKey = keys?.find((k: any) => k.active);

  useEffect(() => {
    if (activeKey?.key) setApiKey(activeKey.key);
  }, [activeKey?.key]);

  const [input,     setInput]     = useState('');
  const [rows,      setRows]      = useState<string[]>([]);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const cacheRef = useRef<Map<string, any>>(new Map());

  const addNumbers = (nums: string[]) => {
    const fresh = nums.filter(n => !rows.includes(n));
    if (fresh.length) setRows(prev => [...fresh, ...prev]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !activeKey) return;
    const nums = extractMultiple(text);
    const target = nums.length > 0 ? nums : (normalizeE164(text) ? [normalizeE164(text)!] : []);
    addNumbers(target);
    setInput('');
  };

  const handlePasteImport = () => {
    const nums = extractMultiple(pasteText);
    if (!nums.length) { alert('No phone numbers detected.'); return; }
    addNumbers(nums);
    setPasteText('');
    setShowPaste(false);
  };

  const detectedCount = pasteText.trim() ? extractMultiple(pasteText).length : 0;

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Phone className="w-5 h-5 text-primary" />
            Phone Lookup
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Enter any phone number to get carrier, line type, location, and risk analysis.
          </p>
        </div>
        {rows.length > 0 && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => exportCSV(rows, cacheRef.current)} className="gap-1.5 text-xs h-8">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRows([])}
              className="gap-1.5 text-xs h-8 text-destructive hover:bg-destructive/10 hover:border-destructive/30">
              <Trash2 className="w-3.5 h-3.5" /> Clear All
            </Button>
          </div>
        )}
      </div>

      {/* ── Search bar ── */}
      <div className="flex flex-col sm:flex-row gap-2">
        <form onSubmit={handleSubmit} className="flex gap-2 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="+14155552671  ·  (212) 555-1234  ·  +447911123456"
              className="pl-9 font-mono text-sm bg-background focus-visible:ring-primary h-10"
              autoFocus
            />
          </div>
          <Button type="submit" disabled={!input.trim() || !activeKey} className="gap-2 shrink-0 h-10 px-5">
            <Search className="w-4 h-4" /> Look Up
          </Button>
        </form>
        <Button variant="outline" size="sm"
          onClick={() => setShowPaste(v => !v)}
          className="gap-2 text-xs h-10 shrink-0">
          <ClipboardList className="w-3.5 h-3.5" />
          Paste List
          {detectedCount > 0 && (
            <span className="ml-1 bg-primary text-primary-foreground text-[9px] font-mono px-1.5 py-0.5 rounded-full">
              {detectedCount}
            </span>
          )}
        </Button>
      </div>

      {/* ── No key warning ── */}
      {!activeKey && keys !== undefined && (
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm text-amber-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="font-mono text-xs">
            No active API key — <a href="/keys" className="underline underline-offset-2">create one</a> to start looking up numbers.
          </span>
        </div>
      )}

      {/* ── Paste panel ── */}
      {showPaste && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3 max-w-2xl">
          <p className="text-xs text-muted-foreground">
            Paste any text — phone numbers are auto-detected in any format. For files, use{' '}
            <a href="/bulk" className="text-primary underline underline-offset-2">Bulk Check</a>.
          </p>
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder={`+14155552671\n(212) 555-1234\n+447911123456`}
            className="w-full h-32 bg-background border border-border rounded-lg p-3 font-mono text-xs text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/40"
            autoFocus
          />
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-muted-foreground">
              {pasteText.trim() ? `${detectedCount} number${detectedCount !== 1 ? 's' : ''} detected` : ''}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="text-xs h-8"
                onClick={() => { setShowPaste(false); setPasteText(''); }}>
                Cancel
              </Button>
              <Button size="sm" className="text-xs h-8 gap-1.5"
                disabled={!pasteText.trim() || detectedCount === 0}
                onClick={handlePasteImport}>
                <Search className="w-3.5 h-3.5" /> Add {detectedCount || ''} Numbers
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {rows.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-mono">
            {rows.length} number{rows.length !== 1 ? 's' : ''} · <span className="opacity-60">click a row to expand full details</span>
          </p>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm min-w-[780px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {['', 'Phone', 'Valid', 'Risk', 'Line Type', 'Carrier', 'Location', 'DNC', ''].map((h, i) => (
                    <th key={i} className="px-3 py-2.5 text-left font-mono text-[10px] text-muted-foreground tracking-widest uppercase whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(number => (
                  <LookupRow
                    key={number}
                    number={number}
                    onData={(d: any) => { cacheRef.current.set(number, d); }}
                    onRemove={() => setRows(prev => prev.filter(r => r !== number))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center min-h-[280px] rounded-xl border border-dashed border-border text-muted-foreground gap-3">
          <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center">
            <Globe className="w-6 h-6 opacity-30" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">No numbers looked up yet</p>
            <p className="text-xs opacity-50 mt-1 font-mono">Enter a number above or paste a list</p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center mt-1">
            {['+1 (415) 555-2671', '+44 7911 123456', '+1 800 555 0199'].map(eg => (
              <button
                key={eg}
                onClick={() => setInput(eg)}
                className="px-3 py-1 rounded-full border border-border text-[11px] font-mono text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
              >
                {eg}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="font-mono text-[10px] text-muted-foreground/30">
        US NANP: carrier from NPA-NXX block assignment · International: carrier from libphonenumber
      </p>
    </div>
  );
}

// ── expandable row ─────────────────────────────────────────────────────────────

function LookupRow({ number, onRemove, onData }: {
  number: string;
  onRemove: () => void;
  onData: (d: any) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data, isError, isFetching } = usePhoneLookup(
    { number },
    { query: { queryKey: getPhoneLookupQueryKey({ number }), enabled: true, retry: false } }
  );

  useEffect(() => {
    if (data && !isFetching) onData(data);
  }, [data, isFetching]); // eslint-disable-line react-hooks/exhaustive-deps

  const score = data?.risk_score ?? data?.fraud_score ?? 0;
  const scoreColor =
    score < 30 ? 'text-green-400 bg-green-500/10 border-green-500/20' :
    score < 60 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                 'text-red-400 bg-red-500/10 border-red-500/20';

  const pill = (v: boolean) => (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
      v ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
    }`}>{v ? 'YES' : 'NO'}</span>
  );

  const location = data
    ? [data.city, data.state || data.country].filter(Boolean).join(', ') || data.country || '—'
    : '—';

  return (
    <>
      <tr
        className="border-b border-border/30 hover:bg-muted/10 transition-colors cursor-pointer group"
        onClick={() => !isFetching && data && setExpanded(v => !v)}
      >
        <td className="pl-3 pr-1 py-3 w-6">
          {!isFetching && data && (
            expanded
              ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </td>
        <td className="px-3 py-3 font-mono text-sm font-medium whitespace-nowrap">{number}</td>

        {isFetching ? (
          <td colSpan={6} className="px-3 py-3">
            <span className="flex items-center gap-2 text-muted-foreground font-mono text-xs">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> Analyzing…
            </span>
          </td>
        ) : isError || !data ? (
          <td colSpan={6} className="px-3 py-3">
            <span className="font-mono text-xs text-destructive">
              {isError ? 'Lookup failed — use E.164 format, e.g. +14155552671' : '—'}
            </span>
          </td>
        ) : (
          <>
            <td className="px-3 py-3">{pill(data.valid)}</td>
            <td className="px-3 py-3">
              <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded border font-mono font-bold text-xs ${scoreColor}`}>
                {score}<span className="text-[9px] font-normal opacity-50">/100</span>
              </span>
            </td>
            <td className="px-3 py-3 text-xs font-mono text-foreground/80">{data.line_type || '—'}</td>
            <td className="px-3 py-3 font-mono text-xs text-foreground/70 max-w-[140px]">
              <span className="block truncate" title={resolveCarrier(data)}>{resolveCarrier(data)}</span>
            </td>
            <td className="px-3 py-3 font-mono text-xs text-foreground/70">{location}</td>
            <td className="px-3 py-3">{pill(!data.dnc)}</td>
          </>
        )}

        <td className="px-2 py-3 w-8">
          <button
            onClick={e => { e.stopPropagation(); onRemove(); }}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1 rounded"
            title="Remove"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </td>
      </tr>

      {/* ── Expanded detail panel ── */}
      {expanded && data && (
        <tr className="border-b border-border/30">
          <td colSpan={9} className="bg-muted/20 px-6 py-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-3">
              {([
                ['E.164',         data.e164],
                ['National',      data.national_format],
                ['Country',       data.country],
                ['Region',        data.region || '—'],
                ['City',          data.city || '—'],
                ['State',         data.state || '—'],
                ['Rate Center',   data.rate_center || '—'],
                ['Timezone',      data.timezones?.[0] || '—'],
                ['Line Type',     data.line_type],
                ['Carrier',       data.carrier || '—'],
                ['OCN',           data.ocn || '—'],
                ['OCN Name',      data.ocn_name || '—'],
                ['OCN Type',      data.ocn_type || '—'],
                ['Carrier Type',  data.carrier_type?.type || '—'],
                ['VoIP',          data.voip ? 'Yes' : 'No'],
                ['Prepaid',       data.prepaid ? 'Yes' : 'No'],
                ['Spam',          data.spam ? 'Yes ⚠️' : 'No'],
                ['DNC Flag',      data.dnc ? 'Yes ⚠️' : 'No'],
                ['Risk Score',    `${score}/100`],
                ['Active (est.)', data.active ? 'Yes' : 'No'],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="space-y-0.5">
                  <div className="font-mono text-[9px] text-muted-foreground/50 uppercase tracking-widest">{label}</div>
                  <div className="font-mono text-xs text-foreground/90 truncate" title={String(value)}>{value}</div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
