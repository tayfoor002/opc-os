import type { LucideIcon } from "lucide-react";

export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: LucideIcon;
}) {
  return (
    <article className="rounded-2xl border border-[var(--opc-border)] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--opc-muted)]">{title}</p>
          <p className="mt-3 text-3xl font-black">{value}</p>
          <p className="mt-2 text-xs text-slate-400">{subtitle}</p>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--opc-blue-soft)] text-[var(--opc-blue)]">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </article>
  );
}
