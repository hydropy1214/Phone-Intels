import { Link, useLocation } from 'wouter';
import { useAuth } from '@/components/auth-provider';
import { Key, Search, Lock, Terminal, UploadCloud, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { logout } = useAuth();

  const nav = [
    { href: '/',     label: 'LOOKUP',     icon: Search,      desc: 'Single number' },
    { href: '/bulk', label: 'BULK CHECK', icon: UploadCloud, desc: 'File / paste list' },
    { href: '/keys', label: 'API KEYS',   icon: Key,         desc: 'Manage access keys' },
    { href: '/docs', label: 'API DOCS',   icon: BookOpen,    desc: 'Usage guide & fields' },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background text-foreground relative z-10">
      <aside className="w-full md:w-56 border-b md:border-b-0 md:border-r border-border bg-card/50 flex flex-col backdrop-blur-sm shrink-0">
        <div className="p-4 md:p-5 border-b border-border flex items-center gap-3 text-primary">
          <Terminal className="w-5 h-5" />
          <span className="font-mono font-bold tracking-widest text-sm">PHONE_INTEL</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map(item => {
            const active = location === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-start gap-3 px-3 py-2.5 rounded-md transition-colors ${
                  active
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <item.icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-mono text-xs font-medium">{item.label}</p>
                  <p className="font-mono text-[10px] opacity-50 mt-px">{item.desc}</p>
                </div>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border mt-auto">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-3 font-mono text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30"
            onClick={logout}
          >
            <Lock className="w-3.5 h-3.5" />
            LOCK SESSION
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-6 md:p-8 overflow-y-auto min-h-0">
        <div className="max-w-[1400px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
