'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'schemaiq.organizationId';
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidOrganizationId(value: string): boolean {
  return UUID_V4_PATTERN.test(value.trim());
}

interface OrganizationContextValue {
  organizationId: string | null;
  setOrganizationId: (id: string | null) => void;
}

const OrganizationContext = createContext<OrganizationContextValue | undefined>(undefined);

function readStoredOrganizationId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? process.env.NEXT_PUBLIC_DEV_ORGANIZATION_ID ?? null;
  } catch {
    return null;
  }
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [organizationId, setOrganizationIdState] = useState<string | null>(readStoredOrganizationId);

  const setOrganizationId = (id: string | null): void => {
    setOrganizationIdState(id);
    try {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // localStorage unavailable (e.g. private browsing) — in-memory state still works for this session.
    }
  };

  return <OrganizationContext.Provider value={{ organizationId, setOrganizationId }}>{children}</OrganizationContext.Provider>;
}

export function useOrganization(): OrganizationContextValue {
  const context = useContext(OrganizationContext);
  if (!context) throw new Error('useOrganization must be used within an OrganizationProvider');
  return context;
}
