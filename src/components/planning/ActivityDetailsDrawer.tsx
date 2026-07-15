"use client";

import {
  AlertTriangle,
  CalendarDays,
  FileText,
  MapPin,
  Package,
  UserRound,
  X
} from "lucide-react";

export type PlanningActivity = {
  id: string;
  name: string;
  zone: string;
  owner: string;
  start: string;
  end: string;
  progress: number;
  status: string;
  critical: boolean;
};

export function ActivityDetailsDrawer({
  activity,
  onClose
}: {
  activity: PlanningActivity | null;
  onClose: () => void;
}) {
  if (!activity) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Fermer les détails"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-[1px]"
      />
      <aside className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-md flex-col border-l border-[var(--opc-border)] bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[var(--opc-border)] p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--opc-blue)]">
              {activity.id}
            </p>
            <h2 className="mt-2 text-xl font-black text-[var(--opc-ink)]">
              {activity.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--opc-border)] text-slate-500 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {activity.critical && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-[var(--opc-red-soft)] p-4 text-[var(--opc-red)]">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-black">Activité critique</p>
                <p className="mt-1 text-xs">
                  Tout retard peut impacter les activités successeures.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Detail icon={MapPin} label="Zone" value={activity.zone} />
            <Detail icon={UserRound} label="Responsable" value={activity.owner} />
            <Detail icon={CalendarDays} label="Début" value={activity.start} />
            <Detail icon={CalendarDays} label="Fin" value={activity.end} />
          </div>

          <section className="rounded-2xl border border-[var(--opc-border)] p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black">Avancement</h3>
              <span className="text-sm font-black text-[var(--opc-blue)]">
                {activity.progress} %
              </span>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[var(--opc-blue)]"
                style={{ width: `${activity.progress}%` }}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--opc-border)] p-4">
            <h3 className="text-sm font-black">Éléments liés</h3>
            <div className="mt-3 space-y-2">
              <LinkedItem icon={FileText} label="3 documents liés" />
              <LinkedItem icon={Package} label="2 besoins matériel" />
              <LinkedItem icon={AlertTriangle} label="1 contrainte ouverte" red />
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--opc-border)] p-4">
            <h3 className="text-sm font-black">Commentaire OPC</h3>
            <textarea
              placeholder="Ajouter une observation, une décision ou un point de vigilance..."
              className="mt-3 min-h-28 w-full resize-none rounded-xl border border-[var(--opc-border)] bg-slate-50 p-3 text-sm outline-none focus:border-[var(--opc-blue)]"
            />
          </section>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-[var(--opc-border)] p-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--opc-border)] px-4 py-3 text-sm font-bold text-slate-600"
          >
            Fermer
          </button>
          <button
            type="button"
            className="rounded-xl bg-[var(--opc-blue)] px-4 py-3 text-sm font-bold text-white"
          >
            Modifier l'activité
          </button>
        </div>
      </aside>
    </>
  );
}

function Detail({
  icon: Icon,
  label,
  value
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <Icon className="h-4 w-4 text-[var(--opc-blue)]" />
      <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-black">{value}</p>
    </div>
  );
}

function LinkedItem({
  icon: Icon,
  label,
  red = false
}: {
  icon: typeof FileText;
  label: string;
  red?: boolean;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-3 text-left text-sm font-bold"
    >
      <span className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${red ? "text-[var(--opc-red)]" : "text-[var(--opc-blue)]"}`} />
        {label}
      </span>
      <span className="text-slate-300">→</span>
    </button>
  );
}
