import { ReactNode } from 'react';

interface PageShellProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function PageShell({ children, title, subtitle, actions }: PageShellProps) {
  return (
    <div className="ml-0 md:ml-16 lg:ml-56 min-h-screen p-3 sm:p-4 lg:p-6 pb-24 md:pb-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 sm:mb-6">
        <div className="min-w-0">
          <h1 className="font-heading text-lg sm:text-xl lg:text-2xl font-bold text-foreground truncate">{title}</h1>
          {subtitle && <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
