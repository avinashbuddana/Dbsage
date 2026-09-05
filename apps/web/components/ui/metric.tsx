interface MetricProps {
  label: string;
  value: string;
}

export function Metric({ label, value }: MetricProps) {
  return (
    <div>
      <p className="text-2xl font-semibold text-slate-900 sm:text-3xl">{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}
