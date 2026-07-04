import { useState, useRef, useEffect } from 'react';
import { useListApiKeys, usePhoneLookup, getPhoneLookupQueryKey } from '@workspace/api-client-react';
import { setApiKey } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input }  from '@/components/ui/input';
import { Badge }  from '@/components/ui/badge';
import { Search, Loader2, X, Download, Trash2, ClipboardList } from 'lucide-react';

// ── phone extraction ───────────────────────────────────────────────────────

function normalizeE164(raw: string): string | null {
  const trimmed = raw.trim();
  const digits  = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits[0] === '1') return '+' + digits;
  if (trimmed.startsWith('+') && digits.length >= 7 && digits.length <= 15) return '+' + digits;
  if (digits.length >= 11   && digits.length <= 15) return '+' + digits;
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

// ── carrier display helper ─────────────────────────────────────────────────

function resolveCarrier(data: any): string {
  if (data?.carrier) return data.carrier;
  const ct = data?.carrier_type?.type;
  return ct && ct !== 'Unknown' ? ct : '—';
}

// ── export ─────────────────────────────────────────────────────────────────

function exportCSV(rows: string[], cache: Map<string, any>) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = 'Phone,Country,Valid,Risky,Fraud Score,Carrier,Line Type,Do Not Call\n';
  const body = rows.map(phone => {
    const d = cache.get(phone);
    if (!d) return [phone,'','','','','','',''].map(esc).join(',');
    return [
      d.e164 ?? phone, d.country ?? '',
      d.valid  ? 'true' : 'false',
      d.risky  ? 'true' : 'false',
      d.fraud_score ?? 0,
      resolveCarrier(d), d.line_type ?? '',
      d.dnc    ? 'true' : 'false',
    ].map(esc).join(',');
  }).join('\n');
  const blob = new Blob([header + body], { type: 'text/csv' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `phone_lookup_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

// ── main page ─────────────────────────────────────────────────────────────

export function Lookup() {
  const { data: keys } = useListApiKeys();
  const activeKey = keys?.find(k => k.active);

  // Side-effect: sync API key to localStorage when it changes
  useEffect(() => {
    if (activeKey?.key) setApiKey(activeKey.key);
  }, [activeKey?.key]);

  const [input,      setInput]     = useState('');
  const [rows,       setRows]      = useState<string[]>([]);
  const [showPaste,  setShowPaste] = useState(false);
  const [pasteText,  setPasteText] = useState('');
  const cacheRef = useRef<Map<string, any>>(new Map());

  const addNumbers = (nums: string[]) => {
    const fresh = nums.filter(n => !rows.includes(n));
    if (fresh.length) setRows(prev => [...fresh, ...prev]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !activeKey) return;
    addNumbers(extractMultiple(text).length > 0 ? extractMultiple(text) : [text]);
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

  const handleExport = () => exportCSV(rows, cacheRef.current);

  return (
    <div className="space-y-5">

      {/* ── controls ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSubmit} className="flex gap-2 flex-1 max-w-lg">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="+14155552671  ·  +447911123456  ·  (212) 555-1234"
            className="font-mono bg-background focus-visible:ring-primary"
            autoFocus
          />
          <Button type="submit" disabled={!input.trim() || !activeKey} className="gap-2 font-mono shrink-0">
            <Search className="w-4 h-4" /> Look Up
          </Button>
        </form>

        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm"
            onClick={() => setShowPaste(v => !v)}
            className="gap-2 font-mono text-xs" title="Paste a list of numbers at once">
            <ClipboardList className="w-3.5 h-3.5" /> Paste List
          </Button>
          {rows.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={handleExport} className="gap-2 font-mono text-xs">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => setRows([])}
                className="gap-2 font-mono text-xs text-destructive hover:bg-destructive/10 hover:border-destructive/30">
                <Trash2 className="w-3.5 h-3.5" /> Clear
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── paste panel ── */}
      {showPaste && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3 max-w-2xl">
          <p className="font-mono text-xs text-muted-foreground">
            Paste any text — numbers are auto-detected in any format. For large batches use&nbsp;
            <a href="/bulk" className="underline text-primary">Bulk Check</a>.
          </p>
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder={`+14155552671\n(212) 555-1234\n18005551234\n+447911123456`}
            className="w-full h-32 bg-background border border-border rounded p-2 font-mono text-xs text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/40"
            autoFocus
          />
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-muted-foreground">
              {pasteText.trim() ? `${detectedCount} number${detectedCount !== 1 ? 's' : ''} detected` : ''}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="font-mono text-xs"
                onClick={() => { setShowPaste(false); setPasteText(''); }}>
                Cancel
              </Button>
              <Button size="sm" className="font-mono text-xs gap-1"
                disabled={!pasteText.trim() || detectedCount === 0}
                onClick={handlePasteImport}>
                <Search className="w-3.5 h-3.5" /> Add {detectedCount || ''} Numbers
              </Button>
            </div>
          </div>
        </div>
      )}

      {!activeKey && keys !== undefined && (
        <p className="font-mono text-xs text-amber-400">
          No active API key — go to <a href="/keys" className="underline">Keys</a> and create one first.
        </p>
      )}

      {/* ── table ── */}
      {rows.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-muted-foreground">
              {rows.length} number{rows.length !== 1 ? 's' : ''}
            </span>
            <Badge variant="outline" className="font-mono text-[10px]">hover a row to remove it</Badge>
          </div>
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[820px]">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  {['Phone','Country','Valid','Risky','Fraud Score','Carrier','Line Type','Do Not Call',''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left font-mono text-[10px] text-muted-foreground tracking-widest uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(number => (
                  <LookupRow
                    key={number}
                    number={number}
                    onData={d => { cacheRef.current.set(number, d); }}
                    onRemove={() => setRows(prev => prev.filter(r => r !== number))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-48 rounded-lg border border-dashed border-border text-muted-foreground gap-2">
          <Search className="w-8 h-8 opacity-20" />
          <p className="font-mono text-sm">Enter a number above, or use Paste List for multiple</p>
          <p className="font-mono text-xs opacity-50">E.164 (+14155552671) or (212) 555-1234 or any common format</p>
        </div>
      )}

      <p className="font-mono text-[10px] text-muted-foreground/40">
        Carrier: real carrier name for international numbers · NPA-NXX block assignment for US (VOIP / Wireless / Landline)
      </p>
    </div>
  );
}

// ── row component ──────────────────────────────────────────────────────────

function LookupRow({ number, onRemove, onData }: {
  number: string;
  onRemove: () => void;
  onData: (d: any) => void;
}) {
  const { data, isError, isFetching } = usePhoneLookup(
    { number },
    { query: { queryKey: getPhoneLookupQueryKey({ number }), enabled: true, retry: false } }
  );

  // Write to cache ref as a proper side-effect, not during render
  useEffect(() => {
    if (data && !isFetching) onData(data);
  }, [data, isFetching]); // eslint-disable-line react-hooks/exhaustive-deps

  const pill = (v: boolean, invert = false) => {
    const good = invert ? !v : v;
    return (
      <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-mono font-semibold ${
        good ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
      }`}>{v ? 'YES' : 'NO'}</span>
    );
  };

  const scorePill = (s: number) => {
    const cls = s < 30
      ? 'text-green-400 bg-green-500/10 border-green-500/20'
      : s < 60
        ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
        : 'text-red-400 bg-red-500/10 border-red-500/20';
    return (
      <span className={`inline-flex items-baseline gap-0.5 px-2 py-0.5 rounded border font-mono font-bold text-sm ${cls}`}>
        {s}<span className="text-[10px] font-normal opacity-50">/100</span>
      </span>
    );
  };

  return (
    <tr className="border-b border-border/30 hover:bg-muted/10 transition-colors group">
      <td className="px-4 py-3 font-mono text-sm whitespace-nowrap">{number}</td>

      {isFetching ? (
        <td colSpan={8} className="px-4 py-3">
          <span className="flex items-center gap-2 text-muted-foreground font-mono text-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> Analyzing…
          </span>
        </td>
      ) : isError || !data ? (
        <td colSpan={8} className="px-4 py-3">
          <span className="font-mono text-xs text-destructive">
            {isError ? 'Lookup failed — use E.164, e.g. +14155552671' : '—'}
          </span>
        </td>
      ) : (
        <>
          <td className="px-4 py-3 font-mono text-sm">{data.country || '—'}</td>
          <td className="px-4 py-3">{pill(data.valid)}</td>
          <td className="px-4 py-3">{pill(data.risky, true)}</td>
          <td className="px-4 py-3">{scorePill(data.fraud_score ?? 0)}</td>
          <td className="px-4 py-3 font-mono text-sm text-foreground/80">
            <span className="block max-w-[180px] truncate" title={resolveCarrier(data)}>
              {resolveCarrier(data)}
            </span>
          </td>
          <td className="px-4 py-3 font-mono text-sm text-foreground/80">{data.line_type || '—'}</td>
          <td className="px-4 py-3">{pill(data.dnc, true)}</td>
        </>
      )}

      <td className="px-2 py-3">
        <button onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
          title="Remove">
          <X className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}
