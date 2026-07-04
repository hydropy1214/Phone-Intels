import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Terminal } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api';

export function Gate({ children }: { children: React.ReactNode }) {
  const { isAuth, login } = useAuth();
  const [inputVal, setInputVal] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(false);

  if (isAuth) return <>{children}</>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const secret = inputVal.trim();
    if (!secret) return;
    setChecking(true);
    setError(false);
    try {
      const res = await fetch(`${getApiBaseUrl()}/admin/keys`, {
        headers: { 'X-Admin-Secret': secret },
      });
      if (res.ok) {
        login(secret);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4 relative z-10">
      <div className="w-full max-w-sm space-y-6 bg-card p-8 border border-border shadow-2xl rounded-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-primary" />
        <div className="space-y-2 text-center">
          <Terminal className="w-7 h-7 text-primary mx-auto" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground font-mono">PHONE_INTEL</h1>
          <p className="text-sm text-muted-foreground font-mono">ENTER ADMIN SECRET</p>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded p-2">
            <p className="font-mono text-[10px] text-destructive text-center">
              Invalid secret — check your ADMIN_API_SECRET and try again.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="secret" className="sr-only">Secret</Label>
            <Input
              id="secret"
              type="password"
              value={inputVal}
              onChange={e => { setInputVal(e.target.value); setError(false); }}
              placeholder="••••••••••••"
              className="font-mono bg-background text-center text-lg border-primary/30 focus-visible:ring-primary/50"
              autoFocus
            />
          </div>
          <Button type="submit" disabled={checking} className="w-full font-mono font-bold tracking-wider">
            {checking ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />VERIFYING...</> : 'AUTHENTICATE'}
          </Button>
        </form>
      </div>
    </div>
  );
}
