import Link from 'next/link';

import { PRODUCT_NAME } from '@schemaiq/shared';

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-20">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-400">
        {PRODUCT_NAME}
      </p>
      <h1 className="mt-4 text-4xl font-semibold">Login</h1>
      <p className="mt-4 text-zinc-400">
        Authentication is intentionally not implemented in Milestone 0.
      </p>
      <Link href="/" className="mt-8 text-cyan-400 hover:text-cyan-300">
        Return home
      </Link>
    </main>
  );
}
