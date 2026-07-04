import {
  useState, useRef, useCallback, useEffect,
  DragEvent, ChangeEvent,
} from 'react';
import { useListApiKeys } from '@workspace/api-client-react';
import { setApiKey, getApiBaseUrl } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge }  from '@/components/ui/badge';
import {
  Upload, FileText, Download, Loader2,
  CheckCircle2, AlertTriangle, RotateCcw, Ban, X,
} from 'lucide-react';

// ── types ──────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'processing' | 'done' | 'cancelled';
type RowStatus = 'pending' | 'loading' | 'done' | 'error' | 'duplicate';
type FilterKey = 'all' | 'valid' | 'invalid' | 'risky' | 'voip' |
                 'wireless' | 'landline' | 'duplicates' | 'errors';

interface ResultRow {
  id: string;           // stable per-occurrence id  (e164 + "#" + occurrence index)
  e164: string;
  original: string;     // raw text as found in file
  status: RowStatus;
  data?: any;
  error?: string;
  duplicateOf?: string; // e164 of the first canonical occurrence
}

// ── phone helpers ──────────────────────────────────────────────────────────

function normalizeE164(raw: string): string | null {
  const trimmed = raw.trim();
  const digits  = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits[0] === '1') return '+' + digits;
  if (trimmed.startsWith('+') && digits.length >= 7 && digits.length <= 15) return '+' + digits;
  if (digits.length >= 11   && digits.length <= 15) return '+' + digits;
  return null;
}

/**
 * Extract every phone-number-looking string from text, preserving duplicates.
 * Two separate regexes are used so they don't overlap:
 *   - E.164:  must start with literal +
 *   - NANP:   must NOT be preceded by + or a digit (avoids re-capturing E.164 tails)
 */
function extractRaw(text: string): string[] {
  const hits: string[] = [];

  // E.164: +1xxx, +44xxx, etc.
  for (const m of text.matchAll(/\+[1-9]\d{6,14}/g)) {
    hits.push(m[0]);
  }

  // NANP formats without leading +   ←  (?<![+\d]) prevents overlap with E.164
  // Word boundary after ensures we don't consume part of a longer number
  const nanpRe = /(?<![+\d])(?:1[-.\s]?)?\(?([2-9]\d{2})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})(?!\d)/g;
  for (const m of text.matchAll(nanpRe)) {
    hits.push(m[0]);
  }

  return hits;
}

/**
 * Build a ResultRow list from raw text.
 * Every occurrence is preserved; duplicates (same E.164) are marked.
 */
function buildRows(text: string): ResultRow[] {
  const raw = extractRaw(text);
  const firstSeen = new Map<string, string>(); // e164 → id of first row
  const rows: ResultRow[] = [];
  const occurrenceCount = new Map<string, number>();

  for (const r of raw) {
    const e164 = normalizeE164(r);
    if (!e164) continue;

    const count = (occurrenceCount.get(e164) ?? 0) + 1;
    occurrenceCount.set(e164, count);
    const id = `${e164}#${count}`;

    if (firstSeen.has(e164)) {
      rows.push({ id, e164, original: r, status: 'duplicate', duplicateOf: firstSeen.get(e164) });
    } else {
      firstSeen.set(e164, id);
      rows.push({ id, e164, original: r, status: 'pending' });
    }
  }
  return rows;
}

// ── stats ──────────────────────────────────────────────────────────────────

interface Stats {
  total: number; unique: number; duplicates: number;
  processed: number; valid: number; invalid: number;
  risky: number; voip: number; wireless: number; landline: number;
  tollFree: number; errors: number; fraudSum: number; fraudCount: number;
}

function computeStats(rows: ResultRow[]): Stats {
  const s: Stats = {
    total: rows.length,
    unique: rows.filter(r => r.status !== 'duplicate').length,
    duplicates: rows.filter(r => r.status === 'duplicate').length,
    processed: 0, valid: 0, invalid: 0, risky: 0,
    voip: 0, wireless: 0, landline: 0, tollFree: 0, errors: 0,
    fraudSum: 0, fraudCount: 0,
  };
  for (const r of rows) {
    if (r.status === 'done' && r.data) {
      s.processed++;
      if (r.data.valid) s.valid++; else s.invalid++;
      if (r.data.risky) s.risky++;
      const lt = String(r.data.line_type ?? '').toUpperCase();
      if (lt === 'VOIP')     s.voip++;
      else if (lt === 'WIRELESS')  s.wireless++;
      else if (lt === 'LANDLINE')  s.landline++;
      else if (lt === 'TOLL FREE') s.tollFree++;
      s.fraudSum  += r.data.fraud_score ?? 0;
      s.fraudCount++;
    } else if (r.status === 'error') {
      s.errors++;
    }
  }
  return s;
}

// ── export CSV ─────────────────────────────────────────────────────────────

function exportCSV(rows: ResultRow[]) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = 'Phone,Original,Country,Valid,Risky,Fraud Score,Carrier,Line Type,Do Not Call,Duplicate,Error\n';
  const body = rows.map(r => {
    if (r.status === 'duplicate')
      return [r.e164, r.original, '', '', '', '', '', '', '', 'true',  ''].map(esc).join(',');
    if (r.status === 'error')
      return [r.e164, r.original, '', '', '', '', '', '', '', 'false', r.error ?? ''].map(esc).join(',');
    if (!r.data)
      return [r.e164, r.original, '', '', '', '', '', '', '', 'false', 'not processed'].map(esc).join(',');
    const d = r.data;
    return [
      d.e164 ?? r.e164, r.original, d.country ?? '',
      d.valid  ? 'true' : 'false',
      d.risky  ? 'true' : 'false',
      d.fraud_score ?? 0, d.carrier ?? '', d.line_type ?? '',
      d.dnc    ? 'true' : 'false', 'false', '',
    ].map(esc).join(',');
  }).join('\n');
  const blob = new Blob([header + body], { type: 'text/csv' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `phone_check_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

// ── small presentational pieces ────────────────────────────────────────────

const YN = ({ v, invert = false }: { v: boolean; invert?: boolean }) => {
  const ok = invert ? !v : v;
  return (
    <span className={`inline-flex px-1.5 py-px rounded text-[10px] font-mono font-semibold
      ${ok ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
      {v ? 'YES' : 'NO'}
    </span>
  );
};

const FraudScore = ({ s }: { s: number }) => (
  <span className={`font-mono font-bold text-xs
    ${s < 30 ? 'text-green-400' : s < 60 ? 'text-yellow-400' : 'text-red-400'}`}>
    {s}
  </span>
);

const StatCard = ({ label, value, sub }: { label: string; value: number | string; sub?: string }) => (
  <div className="bg-card border border-border rounded-lg px-4 py-3 flex flex-col gap-0.5 min-w-[90px]">
    <span className="font-mono text-[9px] text-muted-foreground tracking-widest uppercase">{label}</span>
    <span className="font-mono font-bold text-lg text-foreground leading-tight">
      {typeof value === 'number' ? value.toLocaleString() : value}
    </span>
    {sub && <span className="font-mono text-[9px] text-muted-foreground">{sub}</span>}
  </div>
);

// ── main component ─────────────────────────────────────────────────────────

const CONCURRENCY = 10;

export function Bulk() {
  const { data: keys } = useListApiKeys();
  const activeKey = keys?.find(k => k.active);

  // Keep API key in sync without side-effecting during render
  useEffect(() => {
    if (activeKey?.key) setApiKey(activeKey.key);
  }, [activeKey?.key]);

  const [phase,     setPhase]     = useState<Phase>('idle');
  const [pasteText, setPaste]     = useState('');
  const [isDragging, setDrag]     = useState(false);
  const [rows,      setRows]      = useState<ResultRow[]>([]);
  const [doneCount, setDoneCount] = useState(0);   // actual completed (done|error)
  const [filter,    setFilter]    = useState<FilterKey>('all');

  const abortRef    = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── start processing ─────────────────────────────────────────────────────

  const startFromText = useCallback((text: string) => {
    const built = buildRows(text);
    if (!built.length) { alert('No valid phone numbers found.'); return; }
    setRows(built);
    setDoneCount(0);
    setFilter('all');
    setPhase('processing');
    runProcessing(built);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function runProcessing(initial: ResultRow[]) {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const apiBase = getApiBaseUrl();
    const toProcess = initial.filter(r => r.status === 'pending');

    for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
      if (ctrl.signal.aborted) break;
      const batch = toProcess.slice(i, i + CONCURRENCY);

      // Mark batch loading
      setRows(prev => {
        const m = new Map(prev.map(r => [r.id, r]));
        batch.forEach(b => {
          const r = m.get(b.id);
          if (r?.status === 'pending') m.set(b.id, { ...r, status: 'loading' });
        });
        return [...m.values()];
      });

      await Promise.allSettled(batch.map(async row => {
        try {
          const res  = await fetch(
            `${apiBase}/phone/lookup?number=${encodeURIComponent(row.e164)}`,
            { signal: ctrl.signal },
          );
          const data = res.ok ? await res.json() : null;
          setRows(prev => {
            const m = new Map(prev.map(r => [r.id, r]));
            const r = m.get(row.id);
            if (r) m.set(row.id, { ...r, status: data ? 'done' : 'error', data: data ?? undefined, error: data ? undefined : `HTTP ${res.status}` });
            return [...m.values()];
          });
          setDoneCount(n => n + 1);
        } catch (e: any) {
          if (e.name === 'AbortError') return;   // don't count aborted
          setRows(prev => {
            const m = new Map(prev.map(r => [r.id, r]));
            const r = m.get(row.id);
            if (r) m.set(row.id, { ...r, status: 'error', error: e.message });
            return [...m.values()];
          });
          setDoneCount(n => n + 1);
        }
      }));
    }

    setPhase(ctrl.signal.aborted ? 'cancelled' : 'done');
  }

  // ── file handling ─────────────────────────────────────────────────────────

  async function readFile(file: File): Promise<string> {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload  = () => res(fr.result as string);
      fr.onerror = () => rej(fr.error);
      fr.readAsText(file);
    });
  }

  async function handleFile(file: File) {
    const text = await readFile(file);
    // Show a preview in the paste box (truncated)
    setPaste(text.length > 3000 ? text.slice(0, 3000) + '\n…' : text);
    startFromText(text);
  }

  const onDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDrag(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };
  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  // ── cancel / reset ────────────────────────────────────────────────────────

  const cancel = () => {
    abortRef.current?.abort();
    // phase will flip to 'cancelled' inside runProcessing
  };

  const reset = () => {
    abortRef.current?.abort();
    setRows([]);
    setPaste('');
    setDoneCount(0);
    setPhase('idle');
    setFilter('all');
  };

  // ── derived data ──────────────────────────────────────────────────────────

  const stats      = computeStats(rows);
  const uniqueRows = rows.filter(r => r.status !== 'duplicate');
  const pct        = uniqueRows.length > 0 ? Math.round(100 * doneCount / uniqueRows.length) : 0;

  const filtered = rows.filter(r => {
    if (filter === 'duplicates') return r.status === 'duplicate';
    if (filter === 'errors')     return r.status === 'error';
    if (r.status === 'duplicate') return false;
    const d  = r.data;
    const lt = String(d?.line_type ?? '').toUpperCase();
    if (filter === 'all')      return true;
    if (filter === 'valid')    return d?.valid === true;
    if (filter === 'invalid')  return d?.valid === false || r.status === 'error';
    if (filter === 'risky')    return d?.risky === true;
    if (filter === 'voip')     return lt === 'VOIP';
    if (filter === 'wireless') return lt === 'WIRELESS';
    if (filter === 'landline') return lt === 'LANDLINE';
    return true;
  });

  const filterTabsAll: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all',        label: 'All',        count: uniqueRows.length },
    { key: 'valid',      label: 'Valid',      count: stats.valid },
    { key: 'invalid',    label: 'Invalid',    count: stats.invalid + stats.errors },
    { key: 'risky',      label: 'Risky',      count: stats.risky },
    { key: 'voip',       label: 'VOIP',       count: stats.voip },
    { key: 'wireless',   label: 'Wireless',   count: stats.wireless },
    { key: 'landline',   label: 'Landline',   count: stats.landline },
    { key: 'duplicates', label: 'Duplicates', count: stats.duplicates },
    { key: 'errors',     label: 'Errors',     count: stats.errors },
  ];
  const filterTabs = filterTabsAll.filter(t => t.count > 0 || t.key === 'all');

  const detectedCount = pasteText.trim() ? buildRows(pasteText).filter(r => r.status !== 'duplicate').length : 0;

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-mono font-bold text-lg tracking-wide">BULK NUMBER CHECK</h1>
          <p className="font-mono text-xs text-muted-foreground mt-0.5">
            Upload CSV / TXT / any file, or paste numbers — handles duplicates &amp; exports results
          </p>
        </div>
        {phase !== 'idle' && (
          <div className="flex gap-2">
            {phase === 'processing' && (
              <Button variant="outline" size="sm" onClick={cancel}
                className="gap-2 font-mono text-xs text-destructive border-destructive/30 hover:bg-destructive/10">
                <Ban className="w-3.5 h-3.5" /> Cancel
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={reset} className="gap-2 font-mono text-xs">
              <RotateCcw className="w-3.5 h-3.5" /> New Check
            </Button>
          </div>
        )}
      </div>

      {/* ── IDLE ── */}
      {phase === 'idle' && (
        <div className="space-y-4 max-w-2xl">
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors select-none ${
              isDragging
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-border hover:border-primary/40 hover:bg-muted/10 text-muted-foreground'
            }`}
          >
            <input ref={fileInputRef} type="file"
              accept=".csv,.txt,.tsv,.text,.json,.xlsx,.xls"
              onChange={onFileChange} className="hidden" />
            <Upload className="w-8 h-8" />
            <div className="text-center">
              <p className="font-mono text-sm font-medium">Drop a file or click to browse</p>
              <p className="font-mono text-xs mt-1 opacity-60">CSV · TXT · TSV · JSON · Excel — any file containing phone numbers</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">or paste numbers below</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <textarea
            value={pasteText}
            onChange={e => setPaste(e.target.value)}
            placeholder={`Paste numbers in any format:\n+14155552671\n(212) 555-1234\n+447911123456\n18005551234\n\nDuplicates are detected and flagged automatically.`}
            className="w-full h-44 bg-background border border-border rounded-lg p-3 font-mono text-xs text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/40"
          />

          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] text-muted-foreground">
              {pasteText.trim()
                ? `${detectedCount.toLocaleString()} unique numbers detected`
                : 'Numbers auto-detected from any text — E.164, NANP, or bare 10-digit'}
            </p>
            <Button onClick={() => startFromText(pasteText)}
              disabled={!pasteText.trim() || !activeKey}
              className="gap-2 font-mono">
              <FileText className="w-4 h-4" /> Start Check
            </Button>
          </div>

          {!activeKey && keys !== undefined && (
            <p className="font-mono text-xs text-amber-400">
              No active API key — go to <a href="/keys" className="underline">Keys</a> and create one.
            </p>
          )}
        </div>
      )}

      {/* ── PROCESSING / DONE / CANCELLED ── */}
      {phase !== 'idle' && (
        <div className="space-y-4">

          {/* Progress bar (processing only) */}
          {phase === 'processing' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  Processing {uniqueRows.length.toLocaleString()} numbers…
                </span>
                <span>{doneCount.toLocaleString()} / {uniqueRows.length.toLocaleString()} ({pct}%)</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-200"
                  style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          {/* Completion notice */}
          {(phase === 'done' || phase === 'cancelled') && (
            <div className={`flex items-center gap-2 font-mono text-sm ${
              phase === 'done' ? 'text-green-400' : 'text-amber-400'
            }`}>
              {phase === 'done'
                ? <CheckCircle2 className="w-4 h-4" />
                : <Ban className="w-4 h-4" />}
              {phase === 'done' ? 'Complete' : 'Cancelled'} — {doneCount.toLocaleString()} of {uniqueRows.length.toLocaleString()} numbers checked
              {stats.duplicates > 0 && (
                <span className="text-muted-foreground ml-1">
                  · {stats.duplicates.toLocaleString()} duplicate{stats.duplicates !== 1 ? 's' : ''} skipped
                </span>
              )}
            </div>
          )}

          {/* Stat cards */}
          <div className="flex flex-wrap gap-2">
            <StatCard label="Total Found"  value={stats.total} />
            <StatCard label="Unique"       value={stats.unique} />
            <StatCard label="Duplicates"   value={stats.duplicates} />
            <StatCard label="Processed"    value={stats.processed} />
            <StatCard label="Valid"        value={stats.valid} />
            <StatCard label="Invalid"      value={stats.invalid} />
            <StatCard label="Risky"        value={stats.risky} />
            <StatCard
              label="Avg Fraud"
              value={stats.fraudCount > 0 ? Math.round(stats.fraudSum / stats.fraudCount) : '—'}
              sub="/100"
            />
          </div>

          {/* Line-type breakdown pills */}
          {(stats.voip + stats.wireless + stats.landline + stats.tollFree) > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">Line types:</span>
              {stats.voip     > 0 && <Badge variant="outline" className="font-mono text-[10px]">VOIP {stats.voip.toLocaleString()}</Badge>}
              {stats.wireless > 0 && <Badge variant="outline" className="font-mono text-[10px]">Wireless {stats.wireless.toLocaleString()}</Badge>}
              {stats.landline > 0 && <Badge variant="outline" className="font-mono text-[10px]">Landline {stats.landline.toLocaleString()}</Badge>}
              {stats.tollFree > 0 && <Badge variant="outline" className="font-mono text-[10px]">Toll Free {stats.tollFree.toLocaleString()}</Badge>}
              {stats.errors   > 0 && <Badge variant="destructive" className="font-mono text-[10px]">Errors {stats.errors.toLocaleString()}</Badge>}
            </div>
          )}

          {/* Filter tabs + Export */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1 flex-wrap">
              {filterTabs.map(t => (
                <button key={t.key} onClick={() => setFilter(t.key)}
                  className={`font-mono text-[10px] px-2.5 py-1 rounded-md border transition-colors uppercase tracking-wider ${
                    filter === t.key
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/20'
                  }`}>
                  {t.label} <span className="opacity-60 ml-0.5">{t.count.toLocaleString()}</span>
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => exportCSV(rows)}
              className="gap-2 font-mono text-xs shrink-0">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </Button>
          </div>

          {/* Results table */}
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-xs min-w-[820px]">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  {['Phone','Country','Valid','Risky','Fraud','Carrier','Line Type','DNC',''].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-mono text-[10px] text-muted-foreground tracking-widest uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center font-mono text-xs text-muted-foreground">
                      {phase === 'processing' ? 'Processing…' : 'No results match this filter.'}
                    </td>
                  </tr>
                )}
                {filtered.slice(0, 500).map(row => <BulkRow key={row.id} row={row} />)}
                {filtered.length > 500 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-3 text-center font-mono text-[10px] text-muted-foreground">
                      Showing first 500 of {filtered.length.toLocaleString()} — export CSV to see all.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── individual result row ──────────────────────────────────────────────────

function BulkRow({ row }: { row: ResultRow }) {
  const { status, e164, data, error, duplicateOf } = row;
  const c = 'px-3 py-2 whitespace-nowrap';

  if (status === 'duplicate') {
    return (
      <tr className="border-b border-border/20 bg-muted/5">
        <td className={`${c} font-mono text-muted-foreground/50`}>{e164}</td>
        <td colSpan={7} className={`${c} font-mono text-[10px] text-muted-foreground/40`}>
          duplicate of {duplicateOf?.split('#')[0]}
        </td>
        <td className={c}>
          <span className="font-mono text-[10px] bg-muted/30 border border-border/30 px-1.5 py-px rounded text-muted-foreground">DUP</span>
        </td>
      </tr>
    );
  }

  if (status === 'pending' || status === 'loading') {
    return (
      <tr className="border-b border-border/20">
        <td className={`${c} font-mono text-muted-foreground/60`}>{e164}</td>
        <td colSpan={7} />
        <td className={c}>
          {status === 'loading'
            ? <Loader2 className="w-3 h-3 animate-spin text-primary" />
            : <span className="font-mono text-[10px] text-muted-foreground/40">QUEUED</span>}
        </td>
      </tr>
    );
  }

  if (status === 'error') {
    return (
      <tr className="border-b border-border/20 bg-destructive/5">
        <td className={`${c} font-mono text-destructive/70`}>{e164}</td>
        <td colSpan={7} className={`${c} font-mono text-[10px] text-destructive/60`}>{error}</td>
        <td className={c}><AlertTriangle className="w-3 h-3 text-destructive" /></td>
      </tr>
    );
  }

  if (!data) return null;
  const lt = String(data.line_type ?? '');

  return (
    <tr className="border-b border-border/20 hover:bg-muted/10 transition-colors">
      <td className={`${c} font-mono font-medium`}>{e164}</td>
      <td className={`${c} font-mono`}>{data.country || '—'}</td>
      <td className={c}><YN v={data.valid} /></td>
      <td className={c}><YN v={data.risky} invert /></td>
      <td className={c}><FraudScore s={data.fraud_score ?? 0} /></td>
      <td className={`${c} font-mono max-w-[160px] truncate`} title={data.carrier}>{data.carrier || '—'}</td>
      <td className={`${c} font-mono`}>{lt || '—'}</td>
      <td className={c}><YN v={data.dnc} invert /></td>
      <td className={c}><CheckCircle2 className="w-3 h-3 text-green-500/70" /></td>
    </tr>
  );
}
