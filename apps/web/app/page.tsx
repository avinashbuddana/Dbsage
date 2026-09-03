import Link from 'next/link';

import { PRODUCT_NAME } from '@schemaiq/shared';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-20">
      <p className="mb-4 text-sm font-semibold uppercase tracking-[0.25em] text-cyan-400">
        Foundation · Milestone 0
      </p>
      <h1 className="text-5xl font-semibold tracking-tight sm:text-7xl">{PRODUCT_NAME}</h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-400">
        AI Database Intelligence Platform. The secure application foundation is ready for the next
        milestone.
      </p>
      <nav aria-label="Primary" className="mt-10 flex gap-4">
        <Link
          href="/dashboard"
          className="rounded-md bg-cyan-400 px-5 py-3 font-medium text-zinc-950 hover:bg-cyan-300"
        >
          View dashboard
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-zinc-700 px-5 py-3 font-medium hover:border-zinc-500"
        >
          Login
        </Link>
      </nav>
    </main>
  );
}
