import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function StatCard({ label, value, sub, icon, className }: StatCardProps) {
  return (
    <Card glass className={cn('animate-fade-in', className)}>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
          {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
        </div>
        {icon ? (
          <div className="rounded-xl bg-primary/12 p-2.5 text-primary" aria-hidden>
            {icon}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
