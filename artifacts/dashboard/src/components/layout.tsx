import { Link, useLocation } from 'wouter';
import { useAuth } from '@/components/auth-provider';
import { Key, Search, Lock, UploadCloud, BookOpen, Activity, PhoneCall, ChevronRight } from 'lucide-react';

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { logout } = useAuth();

  const nav = [
    { href: '/',          label: 'Lookup',      icon: Search,      desc: 'Single number analysis' },
    { href: '/bulk',      label: 'Bulk Check',  icon: UploadCloud, desc: 'File or paste list' },
    { href: '/keys',      label: 'API Keys',    icon: Key,         desc: 'Manage access keys' },
    { href: '/analytics', label: 'Analytics',   icon: Activity,    desc: 'Usage & request stats' },
    { href: '/docs',      label: 'API Docs',    icon: BookOpen,    desc: 'Reference & examples' },
  ];

  const isActive = (href: string) =>
    href === '/' ? location === '/' : location.startsWith(href);

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background text-foreground">

      {/* ── Sidebar ── */}
      <aside className="w-full md:w-60 flex-shrink-0 border-b md:border-b-0 md:border-r border-border bg-card/40 backdrop-blur-sm flex flex-col">

        {/* Brand */}
        <div className="px-5 py-4 border-b border-border flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
            <PhoneCall className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <div className="font-mono font-bold text-sm tracking-wide text-foreground">PhoneIntel</div>
            <div className="font-mono text-[9px] text-muted-foreground/60 tracking-widest uppercase">Intelligence API</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {nav.map(item => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all relative ${
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r-full" />
                )}
                <item.icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold leading-none ${active ? 'text-primary' : ''}`}>{item.label}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5 leading-none truncate">{item.desc}</p>
                </div>
                {active && <ChevronRight className="w-3 h-3 text-primary/50 flex-shrink-0" />}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-3 border-t border-border space-y-2">
          <div className="px-3 py-2 rounded-lg bg-muted/30 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
            <span className="font-mono text-[10px] text-muted-foreground">API online</span>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors font-mono"
          >
            <Lock className="w-3.5 h-3.5" />
            Lock Session
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-6 md:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
