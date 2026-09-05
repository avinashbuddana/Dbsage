import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { PRODUCT_NAME } from '@schemaiq/shared';

import { OrganizationProvider } from '../lib/organization-context';
import { QueryProvider } from '../lib/query-provider';

import './globals.css';

export const metadata: Metadata = {
  description: 'AI Database Intelligence Platform',
  title: PRODUCT_NAME,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <OrganizationProvider>{children}</OrganizationProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
