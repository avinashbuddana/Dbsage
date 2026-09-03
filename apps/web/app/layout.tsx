import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { PRODUCT_NAME } from '@schemaiq/shared';

import './globals.css';

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: 'AI Database Intelligence Platform',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
