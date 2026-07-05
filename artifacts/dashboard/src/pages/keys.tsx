import { useState } from 'react';
import {
  useListApiKeys, useCreateApiKey, useRevokeApiKey,
  getListApiKeysQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button }    from '@/components/ui/button';
import { Input }     from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Key, Plus, Trash2, Copy, Check, Activity,
  CheckCircle2, XCircle, Clock, AlertTriangle,
} from 'lucide-react';
import { format } from 'date-fns';

export function Keys() {
  const { data: keys, isLoading } = useListApiKeys();
  const queryClient  = useQueryClient();
  const { toast }    = useToast();
  const createMut    = useCreateApiKey();
  const revokeMut    = useRevokeApiKey();

  const [createOpen, setCreateOpen]    = useState(false);
  const [newLabel,   setNewLabel]      = useState('');
  const [generated,  setGenerated]     = useState<string | null>(null);
  const [copied,     setCopied]        = useState(false);
  const [revoking,   setRevoking]      = useState<number | null>(null);

  const refetch = () => queryClient.invalidateQueries({ queryKey: getListApiKeysQueryKey() });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel) return;
    createMut.mutate({ data: { label: newLabel } }, {
      onSuccess: (data: { key: string }) => {
        refetch();
        setGenerated(data.key);
        setNewLabel('');
        toast({ title: 'API key created' });
      },
      onError: (err: any) => {
        toast({ title: 'Failed to create key', description: err?.data?.error || err.message, variant: 'destructive' });
      },
    });
  };

  const handleRevoke = (id: number) => {
    if (!confirm('Revoke this key? It will stop working immediately.')) return;
    setRevoking(id);
    revokeMut.mutate({ id }, {
      onSuccess: () => { refetch(); toast({ title: 'Key revoked' }); },
      onError: (err: any) => {
        toast({ title: 'Failed to revoke', description: err?.data?.error || err.message, variant: 'destructive' });
      },
      onSettled: () => setRevoking(null),
    });
  };

  const copyKey = () => {
    if (!generated) return;
    navigator.clipboard.writeText(generated);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const closeDialog = () => { setCreateOpen(false); setGenerated(null); };

  const activeCount  = keys?.filter((k: any) =>  k.active).length ?? 0;
  const revokedCount = keys?.filter((k: any) => !k.active).length ?? 0;
  const totalReqs    = keys?.reduce((s: number, k: any) => s + k.requestCount, 0) ?? 0;
  const maxReqs      = Math.max(...(keys?.map((k: any) => k.requestCount) ?? [0]), 1);

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" />
            API Keys
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Create and manage keys that authenticate requests to the phone lookup API.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" /> New Key
        </Button>
      </div>

      {/* ── Summary cards ── */}
      {keys && keys.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Active Keys',    value: activeCount,                icon: CheckCircle2, color: 'text-green-400' },
            { label: 'Revoked Keys',   value: revokedCount,               icon: XCircle,      color: 'text-muted-foreground' },
            { label: 'Total Requests', value: totalReqs.toLocaleString(), icon: Activity,     color: 'text-primary' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <div className={`text-xl font-mono font-bold ${color}`}>{value}</div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Keys table ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground font-mono text-xs gap-2">
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            Loading keys…
          </div>
        ) : keys?.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
            <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center">
              <Key className="w-6 h-6 opacity-20" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">No API keys yet</p>
              <p className="text-xs opacity-50 mt-1">Create your first key to start using the API.</p>
            </div>
            <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-2 mt-1">
              <Plus className="w-3.5 h-3.5" /> Create Key
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {['Label', 'Status', 'Requests', 'Usage', 'Created', 'Last Used', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keys?.map((k: any) => (
                  <tr key={k.id} className="border-b border-border/30 hover:bg-muted/10 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm">{k.label}</div>
                      <div className="font-mono text-[10px] text-muted-foreground/50">id: {k.id}</div>
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
                    <td className="px-4 py-3 font-mono text-sm font-bold">
                      {k.requestCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-[90px]">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${k.active ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                            style={{ width: `${maxReqs > 0 ? Math.round((k.requestCount / maxReqs) * 100) : 0}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {format(new Date(k.createdAt), 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3">
                      {k.lastUsedAt ? (
                        <div className="flex items-center gap-1 text-xs font-mono text-foreground/70">
                          <Clock className="w-3 h-3 text-primary/70" />
                          {format(new Date(k.lastUsedAt), 'MMM d, HH:mm')}
                        </div>
                      ) : (
                        <span className="text-xs font-mono text-muted-foreground/40">never</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right w-10">
                      {k.active && (
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => handleRevoke(k.id)}
                          disabled={revoking === k.id}
                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Revoke key"
                        >
                          {revoking === k.id
                            ? <div className="w-3.5 h-3.5 border border-current rounded-full border-t-transparent animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />
                          }
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Info callout ── */}
      {keys && keys.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 p-3.5">
          <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Revoked keys are permanently deactivated — all requests using them will return 401 immediately.
            Request history is preserved. Create a new key to replace a revoked one.
          </p>
        </div>
      )}

      {/* ── Create / reveal dialog ── */}
      <Dialog open={createOpen || !!generated} onOpenChange={closeDialog}>
        <DialogContent className="border-primary/20 bg-card sm:max-w-md">
          {generated ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-primary font-mono">
                  <Key className="w-5 h-5" /> Key Generated
                </DialogTitle>
                <DialogDescription className="text-xs font-mono">
                  Copy this key now — it will <strong>never be shown again</strong>.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 bg-black/60 rounded-lg border border-border/50 p-4 flex items-start gap-3">
                <code className="text-sm text-primary break-all flex-1 leading-relaxed">{generated}</code>
                <Button size="icon" variant="ghost" onClick={copyKey}
                  className="shrink-0 hover:bg-primary/20 hover:text-primary h-8 w-8">
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[11px] font-mono text-amber-400/80">
                <AlertTriangle className="w-3 h-3" />
                Store this in a password manager or environment variable.
              </div>
              <DialogFooter className="mt-4">
                <Button onClick={closeDialog} className="w-full font-mono">
                  {copied ? <><Check className="w-4 h-4 mr-2 text-green-400" />Copied — Done</> : 'I have saved this key'}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="font-mono">New API Key</DialogTitle>
                <DialogDescription>
                  Give this key a descriptive label so you know what or who it&apos;s for.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 mt-2">
                <Input
                  placeholder="e.g. Production App, Dev Environment, Customer XYZ"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  className="font-mono bg-background"
                  autoFocus
                />
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={closeDialog}>Cancel</Button>
                  <Button type="submit" disabled={!newLabel || createMut.isPending} className="gap-2">
                    {createMut.isPending
                      ? <><div className="w-3.5 h-3.5 border border-current rounded-full border-t-transparent animate-spin" /> Generating…</>
                      : <><Plus className="w-3.5 h-3.5" /> Generate Key</>
                    }
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
