import type { ReactNode } from 'react';

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">{children}</p>;
}
