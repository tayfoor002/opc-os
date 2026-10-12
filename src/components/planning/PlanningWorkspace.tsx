"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  GanttChartSquare,
  GripVertical,
  ListChecks,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { ActivityDetailsDrawer } from "@/components/planning/ActivityDetailsDrawer";
import { EditableGantt } from "@/components/planning/EditableGantt";
import { saveScheduleChanges } from "@/app/planning/actions";
import { dayDistance, shiftDate } from "@/lib/planning/schedule";
import { createClient } from "@/lib/supabase/client";
import { addDays, differenceInDays, formatDateOnly, formatLongDate, formatShortDate, parseDateOnly, startOfWeek } from "@/lib/date-utils";
import type { Activity, ActivityStatus } from "@/types/activity";
import type { Task } from "@/types/task";

type ViewMode = "week" | "gantt" | "activities";
type GanttScale = "day" | "week" | "month" | "year";

const statusLabels: Record<ActivityStatus, string> = {
  not_started: "Non démarrée",
  in_progress: "En cours",
  blocked: "Bloquée",
  completed: "Terminée",
};

export function PlanningWorkspace() {
  const supabase = useMemo(() => createClient(), []);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [scheduleHistory,setScheduleHistory] = useState<{id:string;source_name:string;created_at:string;changes:unknown[]}[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("gantt");
  const [timelineScale, setTimelineScale] = useState<GanttScale>("week");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [timelineAnchor, setTimelineAnchor] = useState(() => {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    return value;
  });
  const [draggedId, setDraggedId] = useState<string | null>(null);

  async function loadActivities(showLoader = true) {
    if (showLoader) setLoading(true);
    setError("");
    const project = await supabase.from("projects").select("id").eq("code", "PDD").single();
    if (project.error) {
      setError(project.error.message);
      setLoading(false);
      return;
    }
    setProjectId(project.data.id);
    const [activityResult, taskResult, historyResult] = await Promise.all([
      supabase.from("activities").select("*").eq("project_id", project.data.id).order("start_date", { ascending: true }),
      supabase.from("tasks").select("*").eq("project_id", project.data.id).order("start_date", { ascending: true }),
      supabase.from("schedule_changes").select("id,source_name,created_at,changes").eq("project_id",project.data.id).order("created_at",{ascending:false}).limit(5),
    ]);
    if (activityResult.error) setError(activityResult.error.message);
    else setActivities((activityResult.data ?? []) as Activity[]);
    if (taskResult.error) setError(taskResult.error.message);
    else setTasks((taskResult.data ?? []) as Task[]);
    if (!historyResult.error) setScheduleHistory(historyResult.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial remote data synchronization
    void loadActivities();
    // loadActivities intentionally remains local to preserve realtime refresh behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`planning-activities-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "activities", filter: `project_id=eq.${projectId}` }, () => void loadActivities(false))
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${projectId}` }, () => void loadActivities(false))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
    // loadActivities intentionally remains local to preserve realtime refresh behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, supabase]);

  const filtered = useMemo(() => activities.filter((activity) =>
    `${activity.code} ${activity.name} ${activity.zone ?? ""} ${activity.responsible ?? ""}`.toLowerCase().includes(query.toLowerCase())
    || tasks.some(task => task.activity_id === activity.id && task.title.toLowerCase().includes(query.toLowerCase()))
  ), [activities, tasks, query]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue = activities.filter((activity) => activity.finish_date && parseDateOnly(activity.finish_date) < today && activity.status !== "completed");
  const stats = {
    active: activities.filter((item) => item.status === "in_progress").length,
    critical: activities.filter((item) => item.critical && item.status !== "completed").length,
    blocked: activities.filter((item) => item.status === "blocked").length,
    overdue: overdue.length,
  };

  async function updateActivity(activityId: string, updates: Partial<Activity>) {
    setSaving(true);
    setError("");
    const activity = activities.find(item => item.id === activityId);
    const children = tasks.filter(task => task.activity_id === activityId);
    if (activity && children.length && (updates.start_date !== undefined || updates.finish_date !== undefined)) {
      const dated = children.filter(task => task.start_date && task.due_date);
      if (!activity.start_date || !updates.start_date || !dated.length || !projectId) {
        setError("Modifie les dates des tâches dans le Gantt : l’activité récapitule leurs dates.");setSaving(false);return;
      }
      const delta = dayDistance(activity.start_date, updates.start_date);
      if (updates.finish_date && activity.finish_date && updates.finish_date !== shiftDate(activity.finish_date, delta)) {
        setError("Une activité avec tâches conserve sa durée lors d’un déplacement. Pour changer sa durée, modifie les tâches dans le Gantt.");setSaving(false);return;
      }
      const applied = await saveScheduleChanges({projectId,source:"Déplacement d’activité",rows:dated.map(task => ({task_id:task.id,activity_id:activityId,title:task.title,start:shiftDate(task.start_date!,delta),finish:shiftDate(task.due_date!,delta),expected_start:task.start_date,expected_finish:task.due_date}))});
      if (!applied.success) {setError(applied.error);setSaving(false);return;}
      updates = Object.fromEntries(Object.entries(updates).filter(([key]) => !["start_date","finish_date"].includes(key)));
      await loadActivities(false);
      setSelectedActivity(null);
      if (!Object.keys(updates).length) {setSaving(false);return;}
    }
    const result = await supabase.from("activities").update(updates).eq("id", activityId);
    if (result.error) setError(result.error.message);
    else {
      setActivities((current) => current.map((item) => item.id === activityId ? { ...item, ...updates } : item));
      setSelectedActivity((current) => current?.id === activityId ? { ...current, ...updates } : current);
    }
    setSaving(false);
  }

  async function moveActivity(activityId: string, targetDate: Date) {
    const activity = activities.find((item) => item.id === activityId);
    if (!activity) return;
    const duration = activity.start_date && activity.finish_date
      ? Math.max(0, differenceInDays(parseDateOnly(activity.start_date), parseDateOnly(activity.finish_date)))
      : 0;
    await updateActivity(activityId, {
      start_date: formatDateOnly(targetDate),
      finish_date: formatDateOnly(addDays(targetDate, duration)),
    });
    setDraggedId(null);
  }

  return (
    <div className="mx-auto max-w-[1700px]">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--opc-red)]">OPC OS · Pilotage du planning</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-[var(--opc-ink)]">Planning connecté</h1>
          <p className="mt-2 text-base font-bold text-[var(--opc-blue)]">Un planning relié aux activités, aux tâches et à l’avancement terrain.</p>
          <p className="mt-2 text-sm text-[var(--opc-muted)]">Importe, vérifie et ajuste les dates. Le Gantt et les activités restent synchronisés avec les tâches.</p>
        </div>
        <button type="button" onClick={() => void loadActivities()} className="flex items-center justify-center gap-2 rounded-xl border border-[var(--opc-border)] bg-white px-4 py-3 text-sm font-black text-slate-600 shadow-sm"><RefreshCw className="h-4 w-4" /> Actualiser</button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="En cours" value={stats.active} icon={ListChecks} />
        <Stat label="Critiques" value={stats.critical} icon={AlertTriangle} red />
        <Stat label="Bloquées" value={stats.blocked} icon={Clock3} orange />
        <Stat label="En retard" value={stats.overdue} icon={CalendarDays} red={stats.overdue > 0} />
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--opc-border)] bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-[var(--opc-border)] p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {([
              ["week", "Semaine", CalendarDays],
              ["gantt", "Gantt", GanttChartSquare],
              ["activities", "Activités", ListChecks],
            ] as const).map(([value, label, Icon]) => (
              <button key={value} type="button" onClick={() => setView(value)} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition ${view === value ? "bg-[var(--opc-blue)] text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"}`}><Icon className="h-4 w-4" />{label}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-[var(--opc-border)] bg-slate-50 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une activité ou une tâche..." className="w-full bg-transparent text-sm outline-none sm:w-72" />
          </div>
        </div>

        {error ? <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}
        {loading ? <div className="grid min-h-80 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[var(--opc-blue)]" /></div> : null}

        {!loading && view === "week" ? (
          <DraggableTimeline
            activities={filtered}
            draggedId={draggedId}
            scale={timelineScale}
            anchorDate={timelineAnchor}
            onScaleChange={setTimelineScale}
            onAnchorChange={setTimelineAnchor}
            onMove={moveActivity}
            onOpen={setSelectedActivity}
            onDragStart={(activityId, event) => {
              setDraggedId(activityId);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/activity-id", activityId);
            }}
            onDragEnd={() => setDraggedId(null)}
          />
        ) : null}

        {!loading && view === "gantt" && projectId ? <EditableGantt activities={filtered} tasks={tasks.filter(task => !task.activity_id || filtered.some(activity => activity.id === task.activity_id))} projectId={projectId} onSaved={() => loadActivities(false)} onOpenActivity={setSelectedActivity} /> : null}
        {!loading && view === "activities" ? <ActivitiesTable activities={filtered} onOpen={setSelectedActivity} /> : null}
      </section>

      {scheduleHistory.length > 0 && <section className="mt-5 rounded-xl border bg-white p-5"><h2 className="font-black text-slate-800">Dernières synchronisations</h2><div className="mt-3 divide-y">{scheduleHistory.map(item=><div key={item.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span className="font-semibold">{item.source_name} · {item.changes.length} tâches</span><time className="text-xs text-slate-500">{new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium",timeStyle:"short"}).format(new Date(item.created_at))}</time></div>)}</div></section>}

      <ActivityDetailsDrawer activity={selectedActivity} saving={saving} onClose={() => setSelectedActivity(null)} onSave={async (updates) => { if (!selectedActivity) return; await updateActivity(selectedActivity.id, updates); }} />
    </div>
  );
}

function DraggableTimeline({
  activities,
  draggedId,
  scale,
  anchorDate,
  onScaleChange,
  onAnchorChange,
  onMove,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  activities: Activity[];
  draggedId: string | null;
  scale: GanttScale;
  anchorDate: Date;
  onScaleChange: (scale: GanttScale) => void;
  onAnchorChange: (date: Date) => void;
  onMove: (activityId: string, targetDate: Date) => Promise<void>;
  onOpen: (activity: Activity) => void;
  onDragStart: (activityId: string, event: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { rangeStart, rangeEnd, ticks, cellWidth, stepDays } = buildTimelineRange(anchorDate, scale);
  const totalDays = Math.max(1, differenceInDays(rangeStart, rangeEnd) + 1);
  const timelineWidth = Math.max(980, ticks.length * cellWidth);
  const dayWidth = timelineWidth / totalDays;
  const todayOffset = differenceInDays(rangeStart, today);
  const todayVisible = todayOffset >= 0 && todayOffset < totalDays;
  const visibleActivities = activities.filter((activity) => {
    if (!activity.start_date || !activity.finish_date) return false;
    const start = parseDateOnly(activity.start_date);
    const finish = parseDateOnly(activity.finish_date);
    return start <= rangeEnd && finish >= rangeStart;
  });

  function shift(direction: -1 | 1) {
    onAnchorChange(addDays(anchorDate, stepDays * direction));
  }

  return (
    <div className="p-5">
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="font-black text-slate-800">Timeline glisser-déposer</p>
          <p className="text-xs font-semibold text-[var(--opc-muted)]">Déplace une activité : sa durée est conservée et les dates sont synchronisées.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {([["day", "Jour"], ["week", "Semaine"], ["month", "Mois"], ["year", "Année"]] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => onScaleChange(value)} className={`rounded-lg px-3 py-2 text-sm font-black transition ${scale === value ? "bg-[var(--opc-blue)] text-white" : "border border-[var(--opc-border)] bg-white text-slate-600 hover:bg-slate-50"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => shift(-1)} className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--opc-border)] bg-white"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => onAnchorChange(new Date())} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700">Aujourd’hui · J+0</button>
          <button type="button" onClick={() => shift(1)} className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--opc-border)] bg-white"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <p className="text-xs font-bold text-slate-500">{formatLongDate(rangeStart)} — {formatLongDate(rangeEnd)}</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--opc-border)]">
        <div className="relative min-w-max" style={{ width: `${timelineWidth}px` }}>
          <div className="relative flex h-16 border-b border-[var(--opc-border)] bg-slate-50">
            {ticks.map((tick) => (
              <div key={tick.key} className="flex shrink-0 flex-col items-center justify-center border-r border-slate-200 px-1 text-center" style={{ width: `${cellWidth}px` }} title={formatLongDate(tick.date)}>
                <span className="text-[11px] font-black text-slate-700">{tick.label}</span>
                {tick.subLabel ? <span className="mt-0.5 text-[9px] font-bold text-slate-400">{tick.subLabel}</span> : null}
              </div>
            ))}
            {todayVisible ? <div className="pointer-events-none absolute inset-y-0 z-20 border-l-2 border-red-500" style={{ left: `${todayOffset * dayWidth}px` }}><span className="absolute left-1 top-1 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-black text-white">J+0</span></div> : null}
          </div>

          <div className="relative min-h-[360px] bg-white">
            <div className="absolute inset-0 flex">
              {ticks.map((tick) => (
                <div
                  key={tick.key}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const id = event.dataTransfer.getData("text/activity-id") || draggedId;
                    if (id) void onMove(id, tick.date);
                  }}
                  className={`h-full shrink-0 border-r border-slate-100 transition ${draggedId ? "bg-blue-50/30 hover:bg-blue-100/60" : ""}`}
                  style={{ width: `${cellWidth}px` }}
                  title={`Déposer au ${formatLongDate(tick.date)}`}
                />
              ))}
            </div>
            {todayVisible ? <div className="pointer-events-none absolute inset-y-0 z-10 border-l-2 border-red-500/80" style={{ left: `${todayOffset * dayWidth}px` }} /> : null}

            <div className="pointer-events-none relative space-y-2 p-3">
              {visibleActivities.length === 0 ? (
                <div className="grid min-h-[310px] place-items-center text-sm font-semibold text-slate-400">Aucune activité sur cette période.</div>
              ) : visibleActivities.map((activity) => {
                const actualStart = parseDateOnly(activity.start_date!);
                const actualFinish = parseDateOnly(activity.finish_date!);
                const clippedStart = actualStart < rangeStart ? rangeStart : actualStart;
                const clippedFinish = actualFinish > rangeEnd ? rangeEnd : actualFinish;
                const offset = differenceInDays(rangeStart, clippedStart);
                const duration = Math.max(1, differenceInDays(clippedStart, clippedFinish) + 1);
                const style = activity.status === "completed"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                  : activity.status === "blocked"
                    ? "border-red-500 bg-red-50 text-red-900"
                    : activity.critical
                      ? "border-orange-500 bg-orange-50 text-orange-900"
                      : "border-blue-500 bg-blue-50 text-blue-900";
                return (
                  <div key={activity.id} className="relative h-12">
                    <button
                      type="button"
                      draggable
                      onDragStart={(event) => onDragStart(activity.id, event)}
                      onDragEnd={onDragEnd}
                      onClick={() => onOpen(activity)}
                      className={`pointer-events-auto absolute top-0 h-11 min-w-[44px] cursor-grab overflow-hidden rounded-lg border-l-4 px-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing ${style}`}
                      style={{ left: `${offset * dayWidth}px`, width: `${Math.max(44, duration * dayWidth)}px` }}
                      title={`${activity.name} · ${formatShortDate(activity.start_date)} → ${formatShortDate(activity.finish_date)}`}
                    >
                      <div className="flex h-full items-center gap-2">
                        <GripVertical className="h-4 w-4 shrink-0 opacity-50" />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black">{activity.code} · {activity.name}</p>
                          <p className="truncate text-[10px] font-bold opacity-70">{formatShortDate(activity.start_date)} → {formatShortDate(activity.finish_date)} · {activity.progress}%</p>
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs font-semibold text-slate-500">En vue Semaine, Mois ou Année, le dépôt aligne l’activité sur le début de la période sélectionnée.</p>
    </div>
  );
}

function buildTimelineRange(anchor: Date, scale: GanttScale) {
  const normalized = new Date(anchor);
  normalized.setHours(0, 0, 0, 0);

  if (scale === "day") {
    const rangeStart = addDays(normalized, -7);
    const ticks = Array.from({ length: 21 }, (_, index) => {
      const date = addDays(rangeStart, index);
      return { key: formatDateOnly(date), date, label: new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(date), subLabel: new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(date) };
    });
    return { rangeStart, rangeEnd: addDays(rangeStart, 20), ticks, cellWidth: 72, stepDays: 7 };
  }

  if (scale === "week") {
    const rangeStart = startOfWeek(addDays(normalized, -21));
    const ticks = Array.from({ length: 10 }, (_, index) => {
      const date = addDays(rangeStart, index * 7);
      return { key: formatDateOnly(date), date, label: `S${getIsoWeek(date)}`, subLabel: new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(date) };
    });
    return { rangeStart, rangeEnd: addDays(rangeStart, 69), ticks, cellWidth: 112, stepDays: 28 };
  }

  if (scale === "month") {
    const rangeStart = new Date(normalized.getFullYear(), normalized.getMonth() - 5, 1);
    const ticks = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + index, 1);
      return { key: formatDateOnly(date), date, label: new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(date), subLabel: String(date.getFullYear()) };
    });
    return { rangeStart, rangeEnd: new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 12, 0), ticks, cellWidth: 118, stepDays: 90 };
  }

  const rangeStart = new Date(normalized.getFullYear() - 2, 0, 1);
  const ticks = Array.from({ length: 5 }, (_, index) => {
    const date = new Date(rangeStart.getFullYear() + index, 0, 1);
    return { key: formatDateOnly(date), date, label: String(date.getFullYear()), subLabel: "01 jan." };
  });
  return { rangeStart, rangeEnd: new Date(rangeStart.getFullYear() + 5, 0, 0), ticks, cellWidth: 230, stepDays: 365 };
}

function ActivityCard({ activity, onOpen, onDragStart, onDragEnd }: { activity: Activity; onOpen: () => void; onDragStart: (event: React.DragEvent<HTMLDivElement>) => void; onDragEnd: () => void }) {
  const style = activity.status === "blocked" ? "border-red-400 bg-red-50" : activity.critical ? "border-orange-400 bg-orange-50" : "border-blue-400 bg-blue-50";
  return (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onOpen} className={`cursor-grab rounded-lg border-l-4 p-3 text-xs shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing ${style}`}>
      <div className="flex items-start gap-2"><GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><div className="min-w-0"><p className="truncate font-black text-slate-800">{activity.code}</p><p className="mt-1 line-clamp-2 font-bold text-slate-700">{activity.name}</p><p className="mt-2 text-slate-500">{activity.zone ?? "Sans zone"} · {activity.progress}%</p></div></div>
    </div>
  );
}

function getIsoWeek(date: Date) {
  const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  return Math.ceil((((value.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function ActivitiesTable({ activities, onOpen }: { activities: Activity[]; onOpen: (activity: Activity) => void }) {
  if (activities.length === 0) return <EmptyState />;
  return <div className="overflow-x-auto"><table className="w-full min-w-[950px]"><thead><tr className="border-b border-[var(--opc-border)] bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><th className="px-5 py-4">Code</th><th className="px-5 py-4">Activité</th><th className="px-5 py-4">Zone</th><th className="px-5 py-4">Responsable</th><th className="px-5 py-4">Dates</th><th className="px-5 py-4">Avancement</th><th className="px-5 py-4">Statut</th></tr></thead><tbody>{activities.map((activity) => <tr key={activity.id} onClick={() => onOpen(activity)} className="cursor-pointer border-b border-slate-100 text-sm hover:bg-blue-50/30"><td className="px-5 py-4 font-black text-[var(--opc-blue)]">{activity.code}</td><td className="px-5 py-4 font-bold">{activity.name}</td><td className="px-5 py-4">{activity.zone ?? "—"}</td><td className="px-5 py-4">{activity.responsible ?? "—"}</td><td className="px-5 py-4 text-xs text-slate-500">{formatShortDate(activity.start_date)} → {formatShortDate(activity.finish_date)}</td><td className="px-5 py-4 font-black">{activity.progress}%</td><td className="px-5 py-4"><StatusBadge status={activity.status} /></td></tr>)}</tbody></table></div>;
}

function StatusBadge({ status }: { status: ActivityStatus }) {
  const className = status === "completed" ? "bg-emerald-50 text-emerald-700" : status === "in_progress" ? "bg-blue-50 text-blue-700" : status === "blocked" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black ${className}`}>{statusLabels[status]}</span>;
}

function Stat({ label, value, icon: Icon, red = false, orange = false }: { label: string; value: number; icon: typeof ListChecks; red?: boolean; orange?: boolean }) {
  const iconClass = red ? "bg-red-50 text-red-700" : orange ? "bg-orange-50 text-orange-700" : "bg-blue-50 text-blue-700";
  return <article className="rounded-2xl border border-[var(--opc-border)] bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-[var(--opc-muted)]">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div><div className={`grid h-11 w-11 place-items-center rounded-xl ${iconClass}`}><Icon className="h-5 w-5" /></div></div></article>;
}

function EmptyState() { return <div className="grid min-h-72 place-items-center p-8 text-center text-sm font-semibold text-slate-400">Aucune activité planifiée pour cette vue.</div>; }
