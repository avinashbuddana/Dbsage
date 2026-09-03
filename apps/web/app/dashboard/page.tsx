import Link from 'next/link';

import { PRODUCT_NAME } from '@schemaiq/shared';

export default function DashboardPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-20">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 shadow-2xl shadow-cyan-950/20 sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">Dashboard</p>
        <h1 className="mt-4 text-5xl font-semibold">{PRODUCT_NAME}</h1>
        <p className="mt-4 text-xl text-zinc-300">AI Database Intelligence Platform</p>
        <p className="mt-8 text-zinc-400">Foundation initialized successfully.</p>
      </div>
      <Link href="/" className="mt-8 text-cyan-400 hover:text-cyan-300">
        Return home
      </Link>
    </main>
  );
}
