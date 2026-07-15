"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, CirclePlus, Edit3, Loader2, Search, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Activity, ActivityFormValues, ActivityStatus } from "@/types/activity";

const emptyForm: ActivityFormValues = {
  code: "", name: "", zone: "", responsible: "", start_date: "", finish_date: "",
  progress: 0, status: "not_started", critical: false,
};

const statusLabels: Record<ActivityStatus, string> = {
  not_started: "Non démarrée", in_progress: "En cours", blocked: "Bloquée", completed: "Terminée",
};

export function ActivitiesWorkspace() {
  const supabase = useMemo(() => createClient(), []);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [form, setForm] = useState<ActivityFormValues>(emptyForm);

  async function loadActivities() {
    setLoading(true); setError("");
    const projectResult = await supabase.from("projects").select("id").eq("code", "PDD").single();
    if (projectResult.error) { setError(projectResult.error.message); setLoading(false); return; }
    setProjectId(projectResult.data.id);
    const result = await supabase.from("activities").select("*").eq("project_id", projectResult.data.id).order("start_date", { ascending: true });
    if (result.error) setError(result.error.message); else setActivities((result.data ?? []) as Activity[]);
    setLoading(false);
  }

  useEffect(() => { void loadActivities(); }, []);

  const filtered = activities.filter((activity) =>
    `${activity.code} ${activity.name} ${activity.zone ?? ""} ${activity.responsible ?? ""}`.toLowerCase().includes(query.toLowerCase())
  );

  const stats = {
    total: activities.length,
    active: activities.filter((item) => item.status === "in_progress").length,
    critical: activities.filter((item) => item.critical).length,
    completed: activities.filter((item) => item.status === "completed").length,
  };

  function openCreate() { setEditing(null); setForm(emptyForm); setOpen(true); }
  function openEdit(activity: Activity) {
    setEditing(activity);
    setForm({
      code: activity.code, name: activity.name, zone: activity.zone ?? "", responsible: activity.responsible ?? "",
      start_date: activity.start_date ?? "", finish_date: activity.finish_date ?? "", progress: Number(activity.progress ?? 0),
      status: activity.status, critical: activity.critical,
    });
    setOpen(true);
  }

  async function saveActivity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!projectId) return;
    setSaving(true); setError("");
    const payload = {
      project_id: projectId, code: form.code.trim(), name: form.name.trim(), zone: form.zone.trim() || null,
      responsible: form.responsible.trim() || null, start_date: form.start_date || null, finish_date: form.finish_date || null,
      progress: Number(form.progress), status: form.status, critical: form.critical,
    };
    const result = editing
      ? await supabase.from("activities").update(payload).eq("id", editing.id)
      : await supabase.from("activities").insert(payload);
    if (result.error) setError(result.error.message);
    else { setOpen(false); setEditing(null); setForm(emptyForm); await loadActivities(); }
    setSaving(false);
  }

  async function deleteActivity(activity: Activity) {
    if (!window.confirm(`Supprimer l'activité ${activity.code} — ${activity.name} ?`)) return;
    const result = await supabase.from("activities").delete().eq("id", activity.id);
    if (result.error) setError(result.error.message); else await loadActivities();
  }

  return (
    <div className="mx-auto max-w-[1700px]">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-[var(--opc-ink)]">Activities Engine</h1>
          <p className="mt-2 text-base font-bold text-[var(--opc-blue)]">Programme de développement - Génie Civil, Installation & VT</p>
          <p className="mt-2 text-sm text-[var(--opc-muted)]">Créer, modifier, suivre et clôturer les activités réelles du projet PDD.</p>
        </div>
        <button type="button" onClick={openCreate} className="flex items-center justify-center gap-2 rounded-xl bg-[var(--opc-red)] px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-[var(--opc-red-dark)]">
          <CirclePlus className="h-4 w-4" /> Nouvelle activité
        </button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Activités totales" value={String(stats.total)} />
        <Stat label="En cours" value={String(stats.active)} />
        <Stat label="Critiques" value={String(stats.critical)} red />
        <Stat label="Terminées" value={String(stats.completed)} />
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--opc-border)] bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-[var(--opc-border)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full max-w-md items-center gap-3 rounded-xl border border-[var(--opc-border)] bg-slate-50 px-4 py-2.5">
            <Search className="h-4 w-4 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une activité..." className="w-full bg-transparent text-sm outline-none" />
          </div>
          <button type="button" onClick={() => void loadActivities()} className="rounded-xl border border-[var(--opc-border)] px-4 py-2.5 text-sm font-bold text-slate-600">Actualiser</button>
        </div>

        {error ? <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}

        {loading ? (
          <div className="grid min-h-72 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[var(--opc-blue)]" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] border-collapse">
              <thead><tr className="border-b border-[var(--opc-border)] bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-4">Code</th><th className="px-5 py-4">Activité</th><th className="px-5 py-4">Zone</th>
                <th className="px-5 py-4">Responsable</th><th className="px-5 py-4">Dates</th><th className="px-5 py-4">Avancement</th>
                <th className="px-5 py-4">Statut</th><th className="px-5 py-4 text-right">Actions</th>
              </tr></thead>
              <tbody>
                {filtered.map((activity) => (
                  <tr key={activity.id} className="border-b border-slate-100 text-sm hover:bg-blue-50/30">
                    <td className="px-5 py-4 font-black text-[var(--opc-blue)]">{activity.code}</td>
                    <td className="px-5 py-4"><div className="flex items-center gap-2">{activity.critical ? <AlertTriangle className="h-4 w-4 text-[var(--opc-red)]" /> : <CheckCircle2 className="h-4 w-4 text-slate-300" />}<span className="font-bold">{activity.name}</span></div></td>
                    <td className="px-5 py-4">{activity.zone || "—"}</td><td className="px-5 py-4">{activity.responsible || "—"}</td>
                    <td className="px-5 py-4 text-xs text-slate-500"><div className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />{activity.start_date || "—"} → {activity.finish_date || "—"}</div></td>
                    <td className="px-5 py-4"><div className="flex items-center gap-3"><div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[var(--opc-blue)]" style={{ width: `${activity.progress}%` }} /></div><span className="text-xs font-black">{activity.progress}%</span></div></td>
                    <td className="px-5 py-4"><StatusBadge status={activity.status} /></td>
                    <td className="px-5 py-4"><div className="flex justify-end gap-2"><button type="button" onClick={() => openEdit(activity)} className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--opc-border)] text-slate-600"><Edit3 className="h-4 w-4" /></button><button type="button" onClick={() => void deleteActivity(activity)} className="grid h-9 w-9 place-items-center rounded-lg border border-red-200 text-[var(--opc-red)]"><Trash2 className="h-4 w-4" /></button></div></td>
                  </tr>
                ))}
                {filtered.length === 0 ? <tr><td colSpan={8} className="px-5 py-16 text-center text-sm text-slate-400">Aucune activité trouvée.</td></tr> : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4 backdrop-blur-[1px]">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-[var(--opc-border)] px-6 py-5">
              <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--opc-red)]">{editing ? "Modification" : "Création"}</p><h2 className="mt-2 text-2xl font-black">{editing ? editing.name : "Nouvelle activité"}</h2></div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--opc-border)] text-slate-500"><X className="h-4 w-4" /></button>
            </div>
            <form onSubmit={saveActivity} className="p-6">
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Code"><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="ACT-006" className="input" /></Field>
                <Field label="Nom de l'activité"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Pose de portique" className="input" /></Field>
                <Field label="Zone"><input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} placeholder="Casa-Port" className="input" /></Field>
                <Field label="Responsable"><input value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} placeholder="Avanzit / Alstom" className="input" /></Field>
                <Field label="Date de début"><input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="input" /></Field>
                <Field label="Date de fin"><input type="date" value={form.finish_date} onChange={(e) => setForm({ ...form, finish_date: e.target.value })} className="input" /></Field>
                <Field label="Avancement (%)"><input type="number" min={0} max={100} value={form.progress} onChange={(e) => setForm({ ...form, progress: Number(e.target.value) })} className="input" /></Field>
                <Field label="Statut"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ActivityStatus })} className="input">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              </div>
              <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-xl border border-red-100 bg-[var(--opc-red-soft)] p-4"><input type="checkbox" checked={form.critical} onChange={(e) => setForm({ ...form, critical: e.target.checked })} className="h-5 w-5 accent-[var(--opc-red)]" /><span className="text-sm font-black text-[var(--opc-red)]">Activité critique</span></label>
              <div className="mt-6 flex justify-end gap-3 border-t border-[var(--opc-border)] pt-5"><button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-[var(--opc-border)] px-5 py-3 text-sm font-bold text-slate-600">Annuler</button><button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-[var(--opc-blue)] px-5 py-3 text-sm font-black text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{editing ? "Enregistrer" : "Créer l'activité"}</button></div>
            </form>
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
function Stat({ label, value, red = false }: { label: string; value: string; red?: boolean }) {
  return <article className="rounded-2xl border border-[var(--opc-border)] bg-white p-5 shadow-sm"><p className="text-sm font-semibold text-[var(--opc-muted)]">{label}</p><p className={`mt-3 text-3xl font-black ${red ? "text-[var(--opc-red)]" : "text-[var(--opc-ink)]"}`}>{value}</p></article>;
}
function StatusBadge({ status }: { status: ActivityStatus }) {
  const className = status === "completed" ? "bg-emerald-50 text-emerald-700" : status === "in_progress" ? "bg-blue-50 text-blue-700" : status === "blocked" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black ${className}`}>{statusLabels[status]}</span>;
}
