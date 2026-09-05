export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} aria-hidden="true" />;
}
