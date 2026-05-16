import { ReactNode } from 'react';

interface PageShellProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function PageShell({ children, title, subtitle, actions }: PageShellProps) {
  return (
    <div className="ml-16 lg:ml-56 min-h-screen p-4 lg:p-6">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-xl lg:text-2xl font-bold text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
