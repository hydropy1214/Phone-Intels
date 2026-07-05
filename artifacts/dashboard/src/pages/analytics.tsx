import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { getStoredSecret } from '@/lib/api';
import {
  Activity, Key, TrendingUp, Zap, RefreshCw,
  Clock, CheckCircle2, XCircle, Award,
} from 'lucide-react';
import { format } from 'date-fns';

// ── types ─────────────────────────────────────────────────────────────────────
interface KeyStat {
  id: number;
  label: string;
  requestCount: number;
  active: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}
interface Stats {
  totalKeys: number;
  activeKeys: number;
  revokedKeys: number;
  totalRequests: number;
  avgRequestsPerKey: number;
  topKey: { id: number; label: string; requestCount: number } | null;
  keys: KeyStat[];
}

// ── fetch stats ───────────────────────────────────────────────────────────────
async function fetchStats(): Promise<Stats> {
  const secret = getStoredSecret();
  const res = await fetch('/api/admin/stats', {
    headers: secret ? { 'X-Admin-Secret': secret } : {},
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// ── stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  icon: Icon, label, value, sub, color = 'text-primary',
}: {
  icon: React.ComponentType<any>;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3 hover:border-primary/30 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">{label}</span>
        <span className={`p-1.5 rounded-lg bg-muted ${color}`}>
          <Icon className="w-4 h-4" />
        </span>
      </div>
      <div>
        <div className={`text-3xl font-mono font-bold ${color}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1 font-mono">{sub}</div>}
      </div>
    </div>
  );
}

// ── custom bar tooltip ────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs font-mono">
      <p className="text-muted-foreground truncate max-w-[180px]">{label}</p>
      <p className="text-primary font-bold">{payload[0].value.toLocaleString()} requests</p>
    </div>
  );
}

// ── usage bar ─────────────────────────────────────────────────────────────────
function UsageBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const color =
    pct >= 70 ? 'bg-primary' :
    pct >= 30 ? 'bg-blue-400' : 'bg-muted-foreground/30';
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────
export function Analytics() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStats();
      setStats(data);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message ?? 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // auto-refresh every 30s
  useEffect(() => {
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  const maxReqs = stats ? Math.max(...stats.keys.map(k => k.requestCount), 1) : 1;
  const chartData = stats?.keys
    .filter(k => k.requestCount > 0 || stats.keys.length <= 8)
    .sort((a, b) => b.requestCount - a.requestCount)
    .slice(0, 12)
    .map(k => ({
      name: k.label.length > 18 ? k.label.slice(0, 16) + '…' : k.label,
      fullName: k.label,
      requests: k.requestCount,
      active: k.active,
    })) ?? [];

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-xl font-bold tracking-wide flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Usage Analytics
          </h1>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            API key usage statistics · auto-refreshes every 30 s
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-muted-foreground/60">
            last updated {format(lastRefresh, 'HH:mm:ss')}
          </span>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-mono text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive font-mono flex items-center gap-2">
          <XCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── Stat cards ── */}
      {loading && !stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 h-28 animate-pulse" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={TrendingUp}
            label="Total Requests"
            value={stats.totalRequests.toLocaleString()}
            sub="all time across all keys"
            color="text-primary"
          />
          <StatCard
            icon={Key}
            label="Active Keys"
            value={stats.activeKeys}
            sub={`${stats.revokedKeys} revoked · ${stats.totalKeys} total`}
            color="text-green-400"
          />
          <StatCard
            icon={Zap}
            label="Avg / Key"
            value={stats.avgRequestsPerKey.toLocaleString()}
            sub="requests per API key"
            color="text-blue-400"
          />
          <StatCard
            icon={Award}
            label="Top Key"
            value={stats.topKey?.requestCount.toLocaleString() ?? '—'}
            sub={stats.topKey?.label ?? 'no requests yet'}
            color="text-amber-400"
          />
        </div>
      ) : null}

      {/* ── Bar chart ── */}
      {stats && chartData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-mono text-sm font-semibold">Requests by API Key</h2>
              <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
                top {Math.min(chartData.length, 12)} keys by usage
              </p>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-primary inline-block" /> Active
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-muted-foreground/40 inline-block" /> Revoked
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barSize={28} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 25% 15%)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontFamily: 'JetBrains Mono', fontSize: 10, fill: 'hsl(220 15% 55%)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontFamily: 'JetBrains Mono', fontSize: 10, fill: 'hsl(220 15% 55%)' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(222 25% 13%)' }} />
              <Bar dataKey="requests" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.active ? 'hsl(180 100% 50%)' : 'hsl(222 25% 25%)'}
                    opacity={entry.active ? 0.85 : 0.4}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Key-by-key table ── */}
      {stats && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-mono text-sm font-semibold">All Keys</h2>
            <span className="font-mono text-xs text-muted-foreground">{stats.keys.length} total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  {['Key', 'Status', 'Requests', 'Usage', 'Created', 'Last Used'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left font-mono text-[10px] text-muted-foreground uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...stats.keys]
                  .sort((a, b) => b.requestCount - a.requestCount)
                  .map(k => (
                    <tr key={k.id} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm text-foreground">{k.label}</div>
                        <div className="font-mono text-[10px] text-muted-foreground/60">id:{k.id}</div>
                      </td>
                      <td className="px-4 py-3">
                        {k.active ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-green-500/15 text-green-400">
                            <CheckCircle2 className="w-3 h-3" /> active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-muted text-muted-foreground">
                            <XCircle className="w-3 h-3" /> revoked
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm font-bold text-foreground">
                        {k.requestCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <UsageBar value={k.requestCount} max={maxReqs} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                        {format(new Date(k.createdAt), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3">
                        {k.lastUsedAt ? (
                          <div className="flex items-center gap-1.5 text-xs font-mono text-foreground/70">
                            <Clock className="w-3 h-3 text-primary" />
                            {format(new Date(k.lastUsedAt), 'MMM d, HH:mm')}
                          </div>
                        ) : (
                          <span className="text-xs font-mono text-muted-foreground/40">never</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {stats.keys.length === 0 && (
            <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
              <Key className="w-8 h-8 opacity-20" />
              <p className="font-mono text-sm">No API keys yet</p>
              <p className="font-mono text-xs opacity-50">
                <a href="/keys" className="text-primary underline">Create a key</a> to start seeing usage data
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
