"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CalendarDays, ExternalLink, MapPin, Save, UserRound, X } from "lucide-react";
import type { Activity, ActivityStatus } from "@/types/activity";

const statusLabels: Record<ActivityStatus, string> = {
  not_started: "Non démarrée",
  in_progress: "En cours",
  blocked: "Bloquée",
  completed: "Terminée",
};

export function ActivityDetailsDrawer({
  activity,
  saving,
  onClose,
  onSave,
}: {
  activity: Activity | null;
  saving: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Activity>) => Promise<void>;
}) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<ActivityStatus>("not_started");
  const [responsible, setResponsible] = useState("");

  useEffect(() => {
    if (!activity) return;
    setProgress(Number(activity.progress));
    setStatus(activity.status);
    setResponsible(activity.responsible ?? "");
  }, [activity]);

  if (!activity) return null;

  return (
    <>
      <button type="button" aria-label="Fermer les détails" onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-[1px]" />
      <aside className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-md flex-col border-l border-[var(--opc-border)] bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[var(--opc-border)] p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--opc-blue)]">{activity.code}</p>
            <h2 className="mt-2 text-xl font-black text-[var(--opc-ink)]">{activity.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--opc-border)] text-slate-500 hover:bg-slate-50"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {activity.critical ? (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-[var(--opc-red-soft)] p-4 text-[var(--opc-red)]">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div><p className="text-sm font-black">Activité critique</p><p className="mt-1 text-xs">Tout déplacement peut impacter le planning du projet.</p></div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Detail icon={MapPin} label="Zone" value={activity.zone ?? "—"} />
            <Detail icon={UserRound} label="Responsable" value={activity.responsible ?? "—"} />
            <Detail icon={CalendarDays} label="Début" value={activity.start_date ?? "—"} />
            <Detail icon={CalendarDays} label="Fin" value={activity.finish_date ?? "—"} />
          </div>

          <section className="rounded-2xl border border-[var(--opc-border)] p-4">
            <label className="text-sm font-black">Responsable</label>
            <input value={responsible} onChange={(event) => setResponsible(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--opc-border)] px-3 py-2.5 text-sm outline-none focus:border-[var(--opc-blue)]" />
          </section>

          <section className="rounded-2xl border border-[var(--opc-border)] p-4">
            <div className="flex items-center justify-between"><label className="text-sm font-black">Avancement</label><span className="text-sm font-black text-[var(--opc-blue)]">{progress} %</span></div>
            <input type="range" min={0} max={100} step={5} value={progress} onChange={(event) => setProgress(Number(event.target.value))} className="mt-4 w-full accent-[var(--opc-blue)]" />
          </section>

          <section className="rounded-2xl border border-[var(--opc-border)] p-4">
            <label className="text-sm font-black">Statut</label>
            <select value={status} onChange={(event) => setStatus(event.target.value as ActivityStatus)} className="mt-2 w-full rounded-xl border border-[var(--opc-border)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--opc-blue)]">
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </section>

          <a href={`/activities?activity=${activity.id}`} className="flex items-center justify-between rounded-2xl border border-[var(--opc-border)] p-4 text-sm font-black text-[var(--opc-blue)] hover:bg-blue-50">
            Ouvrir dans Activities <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-[var(--opc-border)] p-5">
          <button type="button" onClick={onClose} className="rounded-xl border border-[var(--opc-border)] px-4 py-3 text-sm font-bold text-slate-600">Fermer</button>
          <button type="button" disabled={saving} onClick={() => void onSave({ progress, status, responsible: responsible.trim() || null })} className="flex items-center justify-center gap-2 rounded-xl bg-[var(--opc-blue)] px-4 py-3 text-sm font-bold text-white disabled:opacity-60"><Save className="h-4 w-4" />{saving ? "Enregistrement..." : "Enregistrer"}</button>
        </div>
      </aside>
    </>
  );
}

function Detail({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><Icon className="h-4 w-4 text-[var(--opc-blue)]" /><p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-black">{value}</p></div>;
}
