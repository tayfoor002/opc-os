"use client";

import { useMemo, useState } from "react";
import { ActivityDetailsDrawer, type PlanningActivity } from "@/components/planning/ActivityDetailsDrawer";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Clock3,
  Flag,
  Filter,
  GanttChartSquare,
  ListChecks,
  Search,
  SlidersHorizontal
} from "lucide-react";

type ViewMode = "week" | "month" | "gantt" | "activities";

const activities = [
  { id: "ACT-001", name: "Validation des données d'entrée", zone: "Casa-Port", owner: "Ayoub", start: "13 Jul", end: "14 Jul", progress: 75, status: "En cours", critical: true },
  { id: "ACT-002", name: "Petit génie civil — artère câble", zone: "Triangle", owner: "Avanzit", start: "14 Jul", end: "18 Jul", progress: 35, status: "En cours", critical: false },
  { id: "ACT-003", name: "Pose PEHD et TPC", zone: "Casa-Port", owner: "Avanzit", start: "17 Jul", end: "23 Jul", progress: 10, status: "À venir", critical: true },
  { id: "ACT-004", name: "Réalisation circuit MALT", zone: "Triangle", owner: "Haj", start: "20 Jul", end: "25 Jul", progress: 0, status: "À venir", critical: false },
  { id: "ACT-005", name: "Pose portique et potence", zone: "Casa-Port", owner: "Haj", start: "24 Jul", end: "30 Jul", progress: 0, status: "À venir", critical: true }
];

const days = ["Lun 13", "Mar 14", "Mer 15", "Jeu 16", "Ven 17", "Sam 18", "Dim 19"];

function StatusBadge({ status }: { status: string }) {
  const style =
    status === "En cours"
      ? "bg-blue-50 text-blue-700"
      : status === "Terminé"
        ? "bg-emerald-50 text-emerald-700"
        : "bg-slate-100 text-slate-600";

  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${style}`}>{status}</span>;
}

export function PlanningWorkspace() {
  const [view, setView] = useState<ViewMode>("week");
  const [query, setQuery] = useState("");
  const [selectedActivity, setSelectedActivity] = useState<PlanningActivity | null>(null);

  const filtered = useMemo(
    () =>
      activities.filter((activity) =>
        `${activity.name} ${activity.zone} ${activity.owner}`.toLowerCase().includes(query.toLowerCase())
      ),
    [query]
  );

  return (
    <div className="mx-auto max-w-[1700px]">
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-[var(--opc-ink)]">Project Delivery Dashboard</h1>
          <p className="mt-2 text-base font-bold text-[var(--opc-blue)]">Programme de développement - Génie Civil, Installation & VT</p>
          <p className="mt-2 text-sm text-[var(--opc-muted)]">Vue d’ensemble de l’avancement et des activités du projet.</p>
        </div>

        <button type="button" className="flex items-center justify-center gap-2 rounded-xl bg-[var(--opc-red)] px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-[var(--opc-red-dark)]">
          <CirclePlus className="h-4 w-4" /> Nouvelle activité
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        {[
          ["Activités actives", "12", ListChecks, "text-blue-700 bg-blue-50"],
          ["Jalons à venir", "5", Flag, "text-violet-700 bg-violet-50"],
          ["Activités critiques", "3", AlertTriangle, "text-red-700 bg-red-50"],
          ["Retard cumulé", "4 j", Clock3, "text-orange-700 bg-orange-50"]
        ].map(([label, value, Icon, style]) => (
          <div key={String(label)} className="rounded-2xl border border-[var(--opc-border)] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--opc-muted)]">{String(label)}</p>
                <p className="mt-2 text-3xl font-black">{String(value)}</p>
              </div>
              <div className={`grid h-11 w-11 place-items-center rounded-xl ${String(style)}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-[var(--opc-border)] bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-[var(--opc-border)] p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {[
              ["week", "Semaine", CalendarDays],
              ["month", "Mois", CalendarDays],
              ["gantt", "Gantt", GanttChartSquare],
              ["activities", "Activités", ListChecks]
            ].map(([value, label, Icon]) => (
              <button
                key={String(value)}
                type="button"
                onClick={() => setView(value as ViewMode)}
                className={[
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition",
                  view === value ? "bg-[var(--opc-blue)] text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                ].join(" ")}
              >
                <Icon className="h-4 w-4" /> {String(label)}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex items-center gap-2 rounded-xl border border-[var(--opc-border)] bg-slate-50 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher une activité..."
                className="w-full bg-transparent text-sm outline-none sm:w-64"
              />
            </div>
            <button type="button" className="flex items-center justify-center gap-2 rounded-xl border border-[var(--opc-border)] px-3 py-2 text-sm font-bold text-slate-600">
              <Filter className="h-4 w-4" /> Filtres
            </button>
            <button type="button" className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--opc-border)] text-slate-600">
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>

        {view === "week" && (
          <div className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <button type="button" className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--opc-border)]">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="text-center">
                <p className="font-black">13 — 19 juillet 2026</p>
                <p className="text-xs text-[var(--opc-muted)]">Semaine 29</p>
              </div>
              <button type="button" className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--opc-border)]">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[900px]">
                <div className="grid grid-cols-7 gap-2">
                  {days.map((day, index) => (
                    <div key={day} className={`rounded-xl border p-3 text-center text-sm font-bold ${index === 0 ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-100 bg-slate-50"}`}>
                      {day}
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-7 gap-2">
                  {days.map((day, index) => (
                    <div key={day} className="min-h-[260px] rounded-xl border border-slate-100 bg-white p-2">
                      {index === 0 && (
                        <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-3 text-xs">
                          <p className="font-black text-blue-800">Revue planning S+4</p>
                          <p className="mt-1 text-blue-600">08:30 · Global</p>
                        </div>
                      )}
                      {index === 1 && (
                        <div className="rounded-lg border-l-4 border-orange-500 bg-orange-50 p-3 text-xs">
                          <p className="font-black text-orange-800">Validation données d'entrée</p>
                          <p className="mt-1 text-orange-600">10:00 · Casa-Port</p>
                        </div>
                      )}
                      {index === 4 && (
                        <div className="rounded-lg border-l-4 border-violet-500 bg-violet-50 p-3 text-xs">
                          <p className="font-black text-violet-800">Suivi Avanzit GC</p>
                          <p className="mt-1 text-violet-600">14:30 · Triangle</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {view === "month" && (
          <div className="p-5">
            <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-slate-400">
              {["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"].map((day) => <div key={day}>{day}</div>)}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-2">
              {Array.from({ length: 35 }, (_, index) => (
                <div key={index} className="min-h-[110px] rounded-xl border border-slate-100 bg-slate-50/60 p-2">
                  <span className="text-xs font-bold text-slate-500">{index + 1}</span>
                  {[3, 8, 14, 20, 25].includes(index) && (
                    <div className="mt-2 rounded-md bg-blue-100 px-2 py-1 text-[10px] font-bold text-blue-700">Activité projet</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {view === "gantt" && (
          <div className="overflow-x-auto p-5">
            <div className="min-w-[1050px]">
              <div className="grid grid-cols-[290px_repeat(14,minmax(46px,1fr))] border-b border-[var(--opc-border)] text-xs font-bold text-slate-500">
                <div className="p-3">Activité</div>
                {Array.from({ length: 14 }, (_, index) => <div key={index} className="border-l border-slate-100 p-3 text-center">{13 + index}</div>)}
              </div>
              {filtered.map((activity, rowIndex) => {
                const start = rowIndex * 2 + 1;
                const width = rowIndex % 2 === 0 ? 5 : 4;
                return (
                  <div key={activity.id} className="grid grid-cols-[290px_repeat(14,minmax(46px,1fr))] border-b border-slate-100">
                    <div className="p-3">
                      <p className="text-sm font-bold">{activity.name}</p>
                      <p className="mt-1 text-xs text-slate-400">{activity.zone} · {activity.owner}</p>
                    </div>
                    <div className="relative col-span-14 grid grid-cols-14 border-l border-slate-100">
                      {Array.from({ length: 14 }, (_, index) => <div key={index} className="border-r border-slate-100" />)}
                      <div
                        onClick={() => setSelectedActivity(activity)}
                        className={`absolute top-4 h-7 cursor-pointer rounded-lg shadow-sm transition hover:brightness-95 ${activity.critical ? "bg-[var(--opc-red)]" : "bg-[var(--opc-blue)]"}`}
                        style={{ left: `${(start / 14) * 100}%`, width: `${(width / 14) * 100}%` }}
                      >
                        <div className="h-full rounded-lg bg-white/20" style={{ width: `${activity.progress}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {view === "activities" && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--opc-border)] bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-4">ID</th>
                  <th className="px-5 py-4">Activité</th>
                  <th className="px-5 py-4">Zone</th>
                  <th className="px-5 py-4">Responsable</th>
                  <th className="px-5 py-4">Début</th>
                  <th className="px-5 py-4">Fin</th>
                  <th className="px-5 py-4">Avancement</th>
                  <th className="px-5 py-4">Statut</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((activity) => (
                  <tr key={activity.id} onClick={() => setSelectedActivity(activity)} className="cursor-pointer border-b border-slate-100 text-sm hover:bg-blue-50/50">
                    <td className="px-5 py-4 font-bold text-[var(--opc-blue)]">{activity.id}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        {activity.critical && <AlertTriangle className="h-4 w-4 text-[var(--opc-red)]" />}
                        <span className="font-bold">{activity.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">{activity.zone}</td>
                    <td className="px-5 py-4">{activity.owner}</td>
                    <td className="px-5 py-4">{activity.start}</td>
                    <td className="px-5 py-4">{activity.end}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-[var(--opc-blue)]" style={{ width: `${activity.progress}%` }} />
                        </div>
                        <span className="text-xs font-bold">{activity.progress}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-4"><StatusBadge status={activity.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--opc-border)] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-black">Jalons clés</h2>
            <button className="text-xs font-bold text-[var(--opc-blue)]">Voir tous</button>
          </div>
          <div className="mt-4 space-y-3">
            {[
              ["Données d'entrée figées", "15 Jul", "En cours"],
              ["Démarrage petit GC", "18 Jul", "À venir"],
              ["Pose premier portique", "30 Jul", "À venir"]
            ].map(([name, date, status]) => (
              <div key={name} className="flex items-center justify-between rounded-xl bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <Flag className="h-4 w-4 text-[var(--opc-blue)]" />
                  <div>
                    <p className="text-sm font-bold">{name}</p>
                    <p className="text-xs text-slate-400">{date}</p>
                  </div>
                </div>
                <StatusBadge status={status} />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--opc-border)] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-black">Contraintes planning</h2>
            <button className="text-xs font-bold text-[var(--opc-blue)]">Gérer</button>
          </div>
          <div className="mt-4 space-y-3">
            {[
              ["Révision procédure GC non validée", "Bloquante", "ONCF"],
              ["FO non confirmé pour semaine 30", "Risque", "Logistique"],
              ["Accès zone Triangle à confirmer", "Ouverte", "Avanzit"]
            ].map(([name, status, owner]) => (
              <div key={name} className="flex items-center justify-between rounded-xl border border-slate-100 p-4">
                <div>
                  <p className="text-sm font-bold">{name}</p>
                  <p className="mt-1 text-xs text-slate-400">Pilote : {owner}</p>
                </div>
                <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700">{status}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <ActivityDetailsDrawer
        activity={selectedActivity}
        onClose={() => setSelectedActivity(null)}
      />
    </div>
  );
}
