import { useState } from 'react';
import { useListApiKeys, useCreateApiKey, useRevokeApiKey, getListApiKeysQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Key, Plus, Trash2, Copy, Check } from 'lucide-react';
import { format } from 'date-fns';

export function Keys() {
  const { data: keys, isLoading } = useListApiKeys();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createMutation = useCreateApiKey();
  const revokeMutation = useRevokeApiKey();
  
  const [createOpen, setCreateOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel) return;
    createMutation.mutate({ data: { label: newLabel } }, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListApiKeysQueryKey() });
        setGeneratedKey(data.key);
        setNewLabel('');
        toast({ title: 'API Key created successfully' });
      },
      onError: (err: any) => {
        toast({ title: 'Failed to create key', description: err?.data?.error || err.message, variant: 'destructive' });
      }
    });
  };

  const handleRevoke = (id: number) => {
    if (!confirm('Are you sure you want to revoke this key?')) return;
    revokeMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListApiKeysQueryKey() });
        toast({ title: 'Key revoked' });
      },
      onError: (err: any) => {
        toast({ title: 'Failed to revoke key', description: err?.data?.error || err.message, variant: 'destructive' });
      }
    });
  };

  const copyToClipboard = () => {
    if (generatedKey) {
      navigator.clipboard.writeText(generatedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const closeDialog = () => {
    setCreateOpen(false);
    setGeneratedKey(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-mono font-bold tracking-tight flex items-center gap-3">
          <Key className="w-8 h-8 text-primary" />
          ACCESS_KEYS
        </h1>
        <Button onClick={() => setCreateOpen(true)} className="font-mono gap-2">
          <Plus className="w-4 h-4" />
          GENERATE_KEY
        </Button>
      </div>

      <Card className="border-border">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-mono text-xs">ID</TableHead>
                <TableHead className="font-mono text-xs">LABEL</TableHead>
                <TableHead className="font-mono text-xs">KEY_MASK</TableHead>
                <TableHead className="font-mono text-xs">STATUS</TableHead>
                <TableHead className="font-mono text-xs text-right">REQS</TableHead>
                <TableHead className="font-mono text-xs">CREATED</TableHead>
                <TableHead className="font-mono text-xs">LAST_USED</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground font-mono">LOADING_DATA...</TableCell>
                </TableRow>
              ) : keys?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground font-mono">NO_KEYS_FOUND</TableCell>
                </TableRow>
              ) : (
                keys?.map(k => (
                  <TableRow key={k.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{k.id}</TableCell>
                    <TableCell className="font-medium">{k.label}</TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                       {k.key ? `${k.key.substring(0, 8)}...` : '••••••••'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={k.active ? 'default' : 'secondary'} className={k.active ? 'bg-primary/20 text-primary hover:bg-primary/30 border-primary/30' : 'bg-muted text-muted-foreground'}>
                        {k.active ? 'ACTIVE' : 'REVOKED'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-right">{k.requestCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(k.createdAt), 'MMM d, yyyy HH:mm')}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {k.lastUsedAt ? format(new Date(k.lastUsedAt), 'MMM d, yyyy HH:mm') : 'NEVER'}
                    </TableCell>
                    <TableCell className="text-right">
                      {k.active && (
                        <Button variant="ghost" size="sm" onClick={() => handleRevoke(k.id)} className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={createOpen || !!generatedKey} onOpenChange={closeDialog}>
        <DialogContent className="border-primary/50 shadow-[0_0_50px_-12px_rgba(var(--primary),0.3)] bg-card sm:max-w-md">
          {generatedKey ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-mono text-primary flex items-center gap-2">
                  <Key className="w-5 h-5" />
                  KEY_GENERATED
                </DialogTitle>
                <DialogDescription className="font-mono text-xs">
                  Copy this key now. It will not be shown again.
                </DialogDescription>
              </DialogHeader>
              <div className="bg-black/50 p-4 rounded-md border border-border/50 flex items-center justify-between gap-4 mt-4">
                <code className="text-sm text-primary break-all">{generatedKey}</code>
                <Button size="icon" variant="ghost" onClick={copyToClipboard} className="shrink-0 hover:bg-primary/20 hover:text-primary">
                  {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <DialogFooter className="mt-6">
                <Button onClick={closeDialog} className="w-full font-mono">ACKNOWLEDGE</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="font-mono">NEW_API_KEY</DialogTitle>
                <DialogDescription>Create a new key to authenticate API requests.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Input 
                    placeholder="e.g. Production App, Dev Script" 
                    value={newLabel} 
                    onChange={e => setNewLabel(e.target.value)} 
                    className="font-mono bg-background"
                    autoFocus
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={closeDialog}>CANCEL</Button>
                  <Button type="submit" disabled={!newLabel || createMutation.isPending} className="font-mono">
                    {createMutation.isPending ? 'GENERATING...' : 'GENERATE'}
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
