"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageContainerProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
};

export function PageContainer({ title, subtitle, children, className }: PageContainerProps) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6", className)}>
      <header className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </header>
      {children}
    </div>
  );
}
