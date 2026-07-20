"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownAZ,
  CalendarClock,
  CheckCircle2,
  CirclePlus,
  Edit3,
  Filter,
  Link2,
  ListChecks,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Activity } from "@/types/activity";
import type { Task, TaskFormValues, TaskPriority, TaskStatus } from "@/types/task";

const emptyForm: TaskFormValues = {
  title: "",
  description: "",
  owner: "",
  due_date: "",
  priority: "medium",
  status: "todo",
  activity_id: "",
};

const statusLabels: Record<TaskStatus, string> = {
  todo: "À faire",
  in_progress: "En cours",
  blocked: "Bloquée",
  done: "Terminée",
};

const priorityLabels: Record<TaskPriority, string> = {
  low: "Basse",
  medium: "Moyenne",
  high: "Haute",
  critical: "Critique",
};

type SortOption = "due_asc" | "due_desc" | "priority" | "title" | "created_desc";

const priorityRank: Record<TaskPriority, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function TasksWorkspace() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState(() => searchParams.get("activity") || "all");
  const [sortBy, setSortBy] = useState<SortOption>("due_asc");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState<TaskFormValues>(emptyForm);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  async function loadData(silent = false) {
    if (!silent) setLoading(true);
    setError("");

    const projectResult = await supabase.from("projects").select("id").eq("code", "PDD").single();
    if (projectResult.error) {
      setError(projectResult.error.message);
      setLoading(false);
      return;
    }

    const id = projectResult.data.id;
    setProjectId(id);

    const [activitiesResult, tasksResult] = await Promise.all([
      supabase.from("activities").select("*").eq("project_id", id).order("code"),
      supabase
        .from("tasks")
        .select("*, activity:activities(id,code,name)")
        .eq("project_id", id)
        .order("created_at", { ascending: false }),
    ]);

    if (activitiesResult.error) setError(activitiesResult.error.message);
    else setActivities((activitiesResult.data ?? []) as Activity[]);

    if (tasksResult.error) setError(tasksResult.error.message);
    else setTasks((tasksResult.data ?? []) as Task[]);

    setLoading(false);
  }

  useEffect(() => {
    void loadData();

    const channel = supabase
      .channel("tasks-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => void loadData(true))
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase]);

  const owners = useMemo(
    () => Array.from(new Set(tasks.map((task) => task.owner).filter(Boolean) as string[])).sort(),
    [tasks],
  );

  const today = new Date().toISOString().slice(0, 10);

  const visibleTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const result = tasks.filter((task) => {
      const searchable = `${task.title} ${task.description ?? ""} ${task.owner ?? ""} ${task.activity?.code ?? ""} ${task.activity?.name ?? ""}`.toLowerCase();
      const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
      const matchesStatus = statusFilter === "all" || task.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
      const matchesOwner = ownerFilter === "all" || task.owner === ownerFilter;
      const matchesActivity = activityFilter === "all" || task.activity_id === activityFilter;
      return matchesQuery && matchesStatus && matchesPriority && matchesOwner && matchesActivity;
    });

    return [...result].sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title, "fr");
      if (sortBy === "priority") return priorityRank[b.priority] - priorityRank[a.priority];
      if (sortBy === "created_desc") return (b.created_at ?? "").localeCompare(a.created_at ?? "");

      const aDate = a.due_date ?? "9999-12-31";
      const bDate = b.due_date ?? "9999-12-31";
      return sortBy === "due_desc" ? bDate.localeCompare(aDate) : aDate.localeCompare(bDate);
    });
  }, [tasks, query, statusFilter, priorityFilter, ownerFilter, activityFilter, sortBy]);

  const stats = {
    total: tasks.length,
    open: tasks.filter((task) => task.status !== "done").length,
    active: tasks.filter((task) => task.status === "in_progress").length,
    blocked: tasks.filter((task) => task.status === "blocked").length,
    overdue: tasks.filter((task) => task.due_date && task.due_date < today && task.status !== "done").length,
    done: tasks.filter((task) => task.status === "done").length,
  };

  function openCreate(activityId = "") {
    setEditing(null);
    setForm({ ...emptyForm, activity_id: activityId });
    setDrawerOpen(true);
  }

  function openEdit(task: Task) {
    setEditing(task);
    setForm({
      title: task.title,
      description: task.description ?? "",
      owner: task.owner ?? "",
      due_date: task.due_date ?? "",
      priority: task.priority,
      status: task.status,
      activity_id: task.activity_id ?? "",
    });
    setDrawerOpen(true);
  }

  function closeDrawer() {
    if (saving) return;
    setDrawerOpen(false);
    setEditing(null);
    setForm(emptyForm);
  }

  function resetFilters() {
    setQuery("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setOwnerFilter("all");
    setActivityFilter("all");
    setSortBy("due_asc");
  }

  async function saveTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId || !form.title.trim()) return;

    setSaving(true);
    setError("");

    const payload = {
      project_id: projectId,
      activity_id: form.activity_id || null,
      title: form.title.trim(),
      description: form.description.trim() || null,
      owner: form.owner.trim() || null,
      due_date: form.due_date || null,
      priority: form.priority,
      status: form.status,
    };

    const result = editing
      ? await supabase.from("tasks").update(payload).eq("id", editing.id)
      : await supabase.from("tasks").insert(payload);

    if (result.error) {
      setError(result.error.message);
    } else {
      closeDrawer();
      await loadData(true);
    }

    setSaving(false);
  }

  async function confirmDelete() {
    if (!taskToDelete) return;
    setDeleting(true);
    setError("");

    const result = await supabase.from("tasks").delete().eq("id", taskToDelete.id);
    if (result.error) setError(result.error.message);
    else {
      setTaskToDelete(null);
      if (editing?.id === taskToDelete.id) closeDrawer();
      await loadData(true);
    }

    setDeleting(false);
  }

  async function quickStatus(task: Task, status: TaskStatus) {
    const result = await supabase.from("tasks").update({ status }).eq("id", task.id);
    if (result.error) setError(result.error.message);
    else setTasks((current) => current.map((item) => (item.id === task.id ? { ...item, status } : item)));
  }

  return (
    <div className="mx-auto max-w-[1700px]">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-[var(--opc-ink)]">Tasks Control Center</h1>
          <p className="mt-2 text-base font-bold text-[var(--opc-blue)]">Actions opérationnelles connectées aux activités du projet PDD</p>
          <p className="mt-2 text-sm text-[var(--opc-muted)]">Créer, affecter, filtrer, modifier et clôturer les tâches depuis un espace unique.</p>
        </div>

        <button
          type="button"
          onClick={() => openCreate()}
          className="flex items-center justify-center gap-2 rounded-xl bg-[var(--opc-red)] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[var(--opc-red-dark)]"
        >
          <CirclePlus className="h-4 w-4" /> Nouvelle tâche
        </button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat icon={<ListChecks className="h-5 w-5" />} label="Ouvertes" value={String(stats.open)} />
        <Stat icon={<CalendarClock className="h-5 w-5" />} label="En cours" value={String(stats.active)} />
        <Stat icon={<AlertTriangle className="h-5 w-5" />} label="Bloquées" value={String(stats.blocked)} amber />
        <Stat icon={<AlertTriangle className="h-5 w-5" />} label="En retard" value={String(stats.overdue)} red />
        <Stat icon={<CheckCircle2 className="h-5 w-5" />} label="Terminées" value={String(stats.done)} green />
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--opc-border)] bg-white shadow-sm">
        <div className="border-b border-[var(--opc-border)] p-4">
          <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-[var(--opc-border)] bg-slate-50 px-4 py-2.5">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher une tâche, activité ou responsable..."
                className="w-full bg-transparent text-sm outline-none"
              />
              {query ? (
                <button type="button" onClick={() => setQuery("")} className="text-slate-400 hover:text-slate-700" aria-label="Effacer la recherche">
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <FilterSelect value={statusFilter} onChange={(value) => setStatusFilter(value as TaskStatus | "all")}>
                <option value="all">Tous les statuts</option>
                {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </FilterSelect>

              <FilterSelect value={priorityFilter} onChange={(value) => setPriorityFilter(value as TaskPriority | "all")}>
                <option value="all">Toutes les priorités</option>
                {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </FilterSelect>

              <FilterSelect value={ownerFilter} onChange={setOwnerFilter}>
                <option value="all">Tous les responsables</option>
                {owners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
              </FilterSelect>

              <FilterSelect value={activityFilter} onChange={setActivityFilter}>
                <option value="all">Toutes les activités</option>
                {activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.code}</option>)}
              </FilterSelect>

              <div className="flex items-center gap-2 rounded-xl border border-[var(--opc-border)] bg-white px-3">
                <ArrowDownAZ className="h-4 w-4 text-slate-400" />
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)} className="bg-transparent py-2.5 text-sm font-bold text-slate-600 outline-none">
                  <option value="due_asc">Échéance croissante</option>
                  <option value="due_desc">Échéance décroissante</option>
                  <option value="priority">Priorité</option>
                  <option value="title">Titre</option>
                  <option value="created_desc">Plus récentes</option>
                </select>
              </div>

              <button type="button" onClick={resetFilters} className="rounded-xl border border-[var(--opc-border)] px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">
                Réinitialiser
              </button>

              <button type="button" onClick={() => void loadData()} className="flex items-center gap-2 rounded-xl border border-[var(--opc-border)] px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">
                <RefreshCw className="h-4 w-4" /> Actualiser
              </button>
            </div>
          </div>

          <div className="mt-3 text-xs font-bold text-slate-500">
            {visibleTasks.length} tâche{visibleTasks.length > 1 ? "s" : ""} affichée{visibleTasks.length > 1 ? "s" : ""} sur {stats.total}
          </div>
        </div>

        {error ? <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}

        {loading ? (
          <div className="grid min-h-72 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[var(--opc-blue)]" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--opc-border)] bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-4">Tâche</th>
                  <th className="px-5 py-4">Activité liée</th>
                  <th className="px-5 py-4">Responsable</th>
                  <th className="px-5 py-4">Échéance</th>
                  <th className="px-5 py-4">Priorité</th>
                  <th className="px-5 py-4">Statut</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleTasks.map((task) => {
                  const overdue = Boolean(task.due_date && task.due_date < today && task.status !== "done");
                  return (
                    <tr key={task.id} onDoubleClick={() => openEdit(task)} className="cursor-pointer border-b border-slate-100 text-sm transition hover:bg-blue-50/40">
                      <td className="px-5 py-4">
                        <div className="font-black text-[var(--opc-ink)]">{task.title}</div>
                        {task.description ? <div className="mt-1 max-w-md truncate text-xs text-slate-500">{task.description}</div> : null}
                      </td>
                      <td className="px-5 py-4">
                        {task.activity ? (
                          <div className="flex items-center gap-2">
                            <Link2 className="h-4 w-4 text-[var(--opc-blue)]" />
                            <span className="font-black text-[var(--opc-blue)]">{task.activity.code}</span>
                            <span className="max-w-48 truncate text-xs text-slate-500">{task.activity.name}</span>
                          </div>
                        ) : <span className="text-slate-400">Non liée</span>}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2"><UserRound className="h-4 w-4 text-slate-400" />{task.owner || "—"}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-2 font-bold ${overdue ? "text-[var(--opc-red)]" : "text-slate-600"}`}>
                          <CalendarClock className="h-4 w-4" />{task.due_date || "—"}{overdue ? " · En retard" : ""}
                        </span>
                      </td>
                      <td className="px-5 py-4"><PriorityBadge priority={task.priority} /></td>
                      <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                        <select
                          value={task.status}
                          onChange={(event) => void quickStatus(task, event.target.value as TaskStatus)}
                          className="rounded-lg border border-[var(--opc-border)] bg-white px-2.5 py-2 text-xs font-black outline-none"
                        >
                          {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </td>
                      <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => openEdit(task)} className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--opc-border)] text-slate-600 hover:bg-slate-50" aria-label="Modifier">
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => setTaskToDelete(task)} className="grid h-9 w-9 place-items-center rounded-lg border border-red-200 text-[var(--opc-red)] hover:bg-red-50" aria-label="Supprimer">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {visibleTasks.length === 0 ? (
                  <tr><td colSpan={7} className="px-5 py-16 text-center text-sm text-slate-400">Aucune tâche ne correspond aux filtres.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-[1px]" onMouseDown={closeDrawer}>
          <aside className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[var(--opc-border)] bg-white px-6 py-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--opc-red)]">{editing ? "Détails de la tâche" : "Création"}</p>
                <h2 className="mt-2 text-2xl font-black text-[var(--opc-ink)]">{editing ? editing.title : "Nouvelle tâche"}</h2>
              </div>
              <button type="button" onClick={closeDrawer} className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--opc-border)] text-slate-500 hover:bg-slate-50">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={saveTask} className="p-6">
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Titre">
                  <input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Vérifier le plan EXE" className="input" />
                </Field>

                <Field label="Activité liée">
                  <select value={form.activity_id} onChange={(event) => setForm({ ...form, activity_id: event.target.value })} className="input">
                    <option value="">Aucune activité</option>
                    {activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.code} — {activity.name}</option>)}
                  </select>
                </Field>

                <Field label="Responsable">
                  <input value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })} placeholder="Nom / entreprise" className="input" />
                </Field>

                <Field label="Échéance">
                  <input type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} className="input" />
                </Field>

                <Field label="Priorité">
                  <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as TaskPriority })} className="input">
                    {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>

                <Field label="Statut">
                  <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as TaskStatus })} className="input">
                    {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
              </div>

              <div className="mt-5">
                <Field label="Description">
                  <textarea rows={7} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Détails, résultat attendu, blocage éventuel..." className="input resize-none" />
                </Field>
              </div>

              <div className="mt-7 flex flex-wrap justify-between gap-3 border-t border-[var(--opc-border)] pt-5">
                <div>
                  {editing ? (
                    <button type="button" onClick={() => setTaskToDelete(editing)} className="flex items-center gap-2 rounded-xl border border-red-200 px-5 py-3 text-sm font-black text-[var(--opc-red)] hover:bg-red-50">
                      <Trash2 className="h-4 w-4" /> Supprimer
                    </button>
                  ) : null}
                </div>

                <div className="flex gap-3">
                  <button type="button" onClick={closeDrawer} className="rounded-xl border border-[var(--opc-border)] px-5 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">Annuler</button>
                  <button type="submit" disabled={saving || !form.title.trim()} className="flex items-center gap-2 rounded-xl bg-[var(--opc-blue)] px-5 py-3 text-sm font-black text-white disabled:opacity-60">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{editing ? "Enregistrer" : "Créer la tâche"}
                  </button>
                </div>
              </div>
            </form>
          </aside>
        </div>
      ) : null}

      {taskToDelete ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-[var(--opc-red)]"><Trash2 className="h-5 w-5" /></div>
            <h3 className="mt-4 text-xl font-black text-[var(--opc-ink)]">Supprimer cette tâche ?</h3>
            <p className="mt-2 text-sm text-slate-600">« {taskToDelete.title} » sera supprimée définitivement. Cette action est irréversible.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" disabled={deleting} onClick={() => setTaskToDelete(null)} className="rounded-xl border border-[var(--opc-border)] px-5 py-3 text-sm font-bold text-slate-600">Annuler</button>
              <button type="button" disabled={deleting} onClick={() => void confirmDelete()} className="flex items-center gap-2 rounded-xl bg-[var(--opc-red)] px-5 py-3 text-sm font-black text-white disabled:opacity-60">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Supprimer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`.input{width:100%;border:1px solid var(--opc-border);border-radius:.75rem;background:white;padding:.75rem .875rem;font-size:.875rem;outline:none}.input:focus{border-color:var(--opc-blue);box-shadow:0 0 0 4px rgba(0,80,164,.08)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-sm font-black text-slate-700">{label}</span><div className="mt-2">{children}</div></label>;
}

function FilterSelect({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[var(--opc-border)] bg-white px-3">
      <Filter className="h-4 w-4 text-slate-400" />
      <select value={value} onChange={(event) => onChange(event.target.value)} className="bg-transparent py-2.5 text-sm font-bold text-slate-600 outline-none">{children}</select>
    </div>
  );
}

function Stat({ icon, label, value, red = false, amber = false, green = false }: { icon: React.ReactNode; label: string; value: string; red?: boolean; amber?: boolean; green?: boolean }) {
  const tone = red ? "text-[var(--opc-red)]" : amber ? "text-amber-600" : green ? "text-emerald-600" : "text-[var(--opc-blue)]";
  return (
    <article className="rounded-2xl border border-[var(--opc-border)] bg-white p-5 shadow-sm">
      <div className={`flex items-center gap-2 ${tone}`}>{icon}<p className="text-sm font-semibold text-[var(--opc-muted)]">{label}</p></div>
      <p className={`mt-3 text-3xl font-black ${tone}`}>{value}</p>
    </article>
  );
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const style = priority === "critical"
    ? "bg-red-50 text-red-700"
    : priority === "high"
      ? "bg-amber-50 text-amber-700"
      : priority === "medium"
        ? "bg-blue-50 text-blue-700"
        : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black ${style}`}>{priorityLabels[priority]}</span>;
}
