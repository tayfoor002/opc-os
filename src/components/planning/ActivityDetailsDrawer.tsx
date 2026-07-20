"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarDays,
  CheckCircle2,
  CirclePlus,
  ExternalLink,
  FileText,
  Gauge,
  Link2,
  Loader2,
  MapPin,
  Save,
  UserRound,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Activity, ActivityStatus } from "@/types/activity";

const statusLabels: Record<ActivityStatus, string> = {
  not_started: "Non démarrée",
  in_progress: "En cours",
  blocked: "Bloquée",
  completed: "Terminée",
};

type DrawerTab = "overview" | "tasks" | "materials" | "documents" | "progress" | "reporting";

type ActivityTask = {
  id: string;
  title: string;
  owner: string | null;
  due_date: string | null;
  status: "todo" | "in_progress" | "blocked" | "done";
};

type ActivityMaterial = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  supplier: string | null;
  delivery_status: "planned" | "ordered" | "delivered" | "consumed";
};

type ActivityDocument = {
  id: string;
  name: string;
  document_type: string;
  url: string | null;
  created_at: string;
};

type ProgressUpdate = {
  id: string;
  progress: number;
  note: string | null;
  update_date: string;
};

const taskStatusLabels: Record<ActivityTask["status"], string> = {
  todo: "À faire",
  in_progress: "En cours",
  blocked: "Bloquée",
  done: "Terminée",
};

const deliveryLabels: Record<ActivityMaterial["delivery_status"], string> = {
  planned: "Prévu",
  ordered: "Commandé",
  delivered: "Livré",
  consumed: "Consommé",
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
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<DrawerTab>("overview");
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<ActivityStatus>("not_started");
  const [responsible, setResponsible] = useState("");
  const [loadingLinkedData, setLoadingLinkedData] = useState(false);
  const [linkedError, setLinkedError] = useState("");
  const [tasks, setTasks] = useState<ActivityTask[]>([]);
  const [materials, setMaterials] = useState<ActivityMaterial[]>([]);
  const [documents, setDocuments] = useState<ActivityDocument[]>([]);
  const [progressUpdates, setProgressUpdates] = useState<ProgressUpdate[]>([]);
  const [newTask, setNewTask] = useState("");
  const [newMaterial, setNewMaterial] = useState("");
  const [materialQuantity, setMaterialQuantity] = useState("1");
  const [newDocument, setNewDocument] = useState("");
  const [newDocumentUrl, setNewDocumentUrl] = useState("");
  const [progressNote, setProgressNote] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);

  useEffect(() => {
    if (!activity) return;
    setProgress(Number(activity.progress));
    setStatus(activity.status);
    setResponsible(activity.responsible ?? "");
    setTab("overview");
    setLinkedError("");
    void loadLinkedData(activity.id);
  }, [activity]);

  async function loadLinkedData(activityId: string) {
    setLoadingLinkedData(true);
    setLinkedError("");

    const [taskResult, materialResult, documentResult, progressResult] = await Promise.all([
      supabase.from("tasks").select("id,title,owner,due_date,status").eq("activity_id", activityId).order("created_at", { ascending: false }),
      supabase.from("activity_materials").select("id,name,quantity,unit,supplier,delivery_status").eq("activity_id", activityId).order("created_at", { ascending: false }),
      supabase.from("activity_documents").select("id,name,document_type,url,created_at").eq("activity_id", activityId).order("created_at", { ascending: false }),
      supabase.from("activity_progress_updates").select("id,progress,note,update_date").eq("activity_id", activityId).order("update_date", { ascending: false }),
    ]);

    if (!taskResult.error) setTasks((taskResult.data ?? []) as ActivityTask[]);
    if (!materialResult.error) setMaterials((materialResult.data ?? []) as ActivityMaterial[]);
    if (!documentResult.error) setDocuments((documentResult.data ?? []) as ActivityDocument[]);
    if (!progressResult.error) setProgressUpdates((progressResult.data ?? []) as ProgressUpdate[]);

    const firstError = [taskResult.error, materialResult.error, documentResult.error, progressResult.error].find(Boolean);
    if (firstError) setLinkedError("Certaines données liées ne sont pas encore disponibles. Exécute la migration Sprint 14.2 dans Supabase.");
    setLoadingLinkedData(false);
  }

  if (!activity) return null;
  const currentActivity = activity;

  const completedTasks = tasks.filter((item) => item.status === "done").length;
  const taskProgress = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;

  async function addTask() {
    if (!newTask.trim()) return;
    setQuickSaving(true);
    const result = await supabase.from("tasks").insert({
      project_id: currentActivity.project_id,
      activity_id: currentActivity.id,
      title: newTask.trim(),
      status: "todo",
      priority: "medium",
    });
    if (result.error) setLinkedError(result.error.message);
    else {
      setNewTask("");
      await loadLinkedData(currentActivity.id);
    }
    setQuickSaving(false);
  }

  async function addMaterial() {
    if (!newMaterial.trim()) return;
    setQuickSaving(true);
    const result = await supabase.from("activity_materials").insert({
      project_id: currentActivity.project_id,
      activity_id: currentActivity.id,
      name: newMaterial.trim(),
      quantity: Number(materialQuantity) || 1,
      unit: "u",
      delivery_status: "planned",
    });
    if (result.error) setLinkedError(result.error.message);
    else {
      setNewMaterial("");
      setMaterialQuantity("1");
      await loadLinkedData(currentActivity.id);
    }
    setQuickSaving(false);
  }

  async function addDocument() {
    if (!newDocument.trim()) return;
    setQuickSaving(true);
    const result = await supabase.from("activity_documents").insert({
      project_id: currentActivity.project_id,
      activity_id: currentActivity.id,
      name: newDocument.trim(),
      document_type: "link",
      url: newDocumentUrl.trim() || null,
    });
    if (result.error) setLinkedError(result.error.message);
    else {
      setNewDocument("");
      setNewDocumentUrl("");
      await loadLinkedData(currentActivity.id);
    }
    setQuickSaving(false);
  }

  async function saveProgressUpdate() {
    setQuickSaving(true);
    const result = await supabase.from("activity_progress_updates").insert({
      project_id: currentActivity.project_id,
      activity_id: currentActivity.id,
      progress,
      note: progressNote.trim() || null,
    });
    if (result.error) setLinkedError(result.error.message);
    else {
      await onSave({ progress, status, responsible: responsible.trim() || null });
      setProgressNote("");
      await loadLinkedData(currentActivity.id);
    }
    setQuickSaving(false);
  }

  return (
    <>
      <button type="button" aria-label="Fermer les détails" onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-[1px]" />
      <aside className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-2xl flex-col border-l border-[var(--opc-border)] bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[var(--opc-border)] p-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--opc-blue)]">{activity.code}</p>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-500">Activity Workspace</span>
            </div>
            <h2 className="mt-2 text-xl font-black text-[var(--opc-ink)]">{activity.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--opc-border)] text-slate-500 hover:bg-slate-50"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-[var(--opc-border)] px-4 py-3">
          {([
            ["overview", "Synthèse", Gauge],
            ["tasks", `Tasks ${tasks.length}`, CheckCircle2],
            ["materials", `Materials ${materials.length}`, Boxes],
            ["documents", `Documents ${documents.length}`, FileText],
            ["progress", "Avancement", BarChart3],
            ["reporting", "Reporting", Link2],
          ] as const).map(([value, label, Icon]) => (
            <button key={value} type="button" onClick={() => setTab(value)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-black transition ${tab === value ? "bg-[var(--opc-blue)] text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"}`}>
              <Icon className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {linkedError ? <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">{linkedError}</div> : null}
          {loadingLinkedData ? <div className="grid min-h-44 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[var(--opc-blue)]" /></div> : null}

          {!loadingLinkedData && tab === "overview" ? (
            <div className="space-y-5">
              {activity.critical ? (
                <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-[var(--opc-red-soft)] p-4 text-[var(--opc-red)]">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div><p className="text-sm font-black">Activité critique</p><p className="mt-1 text-xs">Tout déplacement peut impacter le planning du projet.</p></div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="Avancement" value={`${progress} %`} />
                <Metric label="Tasks" value={`${completedTasks}/${tasks.length}`} />
                <Metric label="Materials" value={String(materials.length)} />
                <Metric label="Documents" value={String(documents.length)} />
              </div>

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
                {tasks.length ? <p className="mt-2 text-xs font-semibold text-slate-500">Avancement calculé par les tâches : {taskProgress} %</p> : null}
              </section>

              <section className="rounded-2xl border border-[var(--opc-border)] p-4">
                <label className="text-sm font-black">Statut</label>
                <select value={status} onChange={(event) => setStatus(event.target.value as ActivityStatus)} className="mt-2 w-full rounded-xl border border-[var(--opc-border)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--opc-blue)]">
                  {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </section>
            </div>
          ) : null}

          {!loadingLinkedData && tab === "tasks" ? (
            <LinkedSection title="Tasks liées" description="Les tâches créées ici apparaissent aussi dans le module Tasks.">
              <QuickAdd value={newTask} onChange={setNewTask} placeholder="Nouvelle tâche..." actionLabel="Ajouter" onAction={addTask} disabled={quickSaving} />
              <div className="mt-4 space-y-2">
                {tasks.length ? tasks.map((task) => (
                  <div key={task.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--opc-border)] p-3">
                    <div><p className="text-sm font-black">{task.title}</p><p className="mt-1 text-xs text-slate-500">{task.owner ?? "Non affectée"}{task.due_date ? ` · ${task.due_date}` : ""}</p></div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600">{taskStatusLabels[task.status]}</span>
                  </div>
                )) : <EmptyState text="Aucune tâche liée à cette activité." />}
              </div>
              <ModuleLink href={`/tasks?activity=${activity.id}`} label="Ouvrir le module Tasks" />
            </LinkedSection>
          ) : null}

          {!loadingLinkedData && tab === "materials" ? (
            <LinkedSection title="Materials liés" description="Associe les besoins matière directement à l'activité.">
              <div className="grid gap-2 sm:grid-cols-[1fr_110px_auto]">
                <input value={newMaterial} onChange={(event) => setNewMaterial(event.target.value)} placeholder="Ex. Béton C30/37" className="rounded-xl border border-[var(--opc-border)] px-3 py-2.5 text-sm" />
                <input type="number" min="0" step="0.01" value={materialQuantity} onChange={(event) => setMaterialQuantity(event.target.value)} className="rounded-xl border border-[var(--opc-border)] px-3 py-2.5 text-sm" />
                <button type="button" disabled={quickSaving} onClick={() => void addMaterial()} className="flex items-center justify-center gap-2 rounded-xl bg-[var(--opc-blue)] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"><CirclePlus className="h-4 w-4" />Ajouter</button>
              </div>
              <div className="mt-4 space-y-2">
                {materials.length ? materials.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--opc-border)] p-3">
                    <div><p className="text-sm font-black">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.quantity} {item.unit} · {item.supplier ?? "Fournisseur non défini"}</p></div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-600">{deliveryLabels[item.delivery_status]}</span>
                  </div>
                )) : <EmptyState text="Aucun matériau lié à cette activité." />}
              </div>
              <ModuleLink href={`/materials?activity=${activity.id}`} label="Ouvrir le module Materials" />
            </LinkedSection>
          ) : null}

          {!loadingLinkedData && tab === "documents" ? (
            <LinkedSection title="Documents liés" description="Enregistre un document, un plan ou un lien de référence.">
              <div className="grid gap-2">
                <input value={newDocument} onChange={(event) => setNewDocument(event.target.value)} placeholder="Nom du document" className="rounded-xl border border-[var(--opc-border)] px-3 py-2.5 text-sm" />
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input value={newDocumentUrl} onChange={(event) => setNewDocumentUrl(event.target.value)} placeholder="URL ou chemin (optionnel)" className="rounded-xl border border-[var(--opc-border)] px-3 py-2.5 text-sm" />
                  <button type="button" disabled={quickSaving} onClick={() => void addDocument()} className="flex items-center justify-center gap-2 rounded-xl bg-[var(--opc-blue)] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"><CirclePlus className="h-4 w-4" />Ajouter</button>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {documents.length ? documents.map((document) => (
                  <div key={document.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--opc-border)] p-3">
                    <div><p className="text-sm font-black">{document.name}</p><p className="mt-1 text-xs text-slate-500">{document.document_type} · {document.created_at.slice(0, 10)}</p></div>
                    {document.url ? <a href={document.url} target="_blank" rel="noreferrer" className="rounded-lg border border-[var(--opc-border)] p-2 text-[var(--opc-blue)]"><ExternalLink className="h-4 w-4" /></a> : null}
                  </div>
                )) : <EmptyState text="Aucun document lié à cette activité." />}
              </div>
              <ModuleLink href={`/documents?activity=${activity.id}`} label="Ouvrir le module Documents" />
            </LinkedSection>
          ) : null}

          {!loadingLinkedData && tab === "progress" ? (
            <LinkedSection title="Journal d'avancement" description="Chaque mise à jour est historisée et synchronisée avec l'activité.">
              <div className="rounded-2xl border border-[var(--opc-border)] p-4">
                <div className="flex items-center justify-between"><label className="text-sm font-black">Nouvel avancement</label><span className="text-sm font-black text-[var(--opc-blue)]">{progress} %</span></div>
                <input type="range" min={0} max={100} step={5} value={progress} onChange={(event) => setProgress(Number(event.target.value))} className="mt-4 w-full accent-[var(--opc-blue)]" />
                <textarea value={progressNote} onChange={(event) => setProgressNote(event.target.value)} placeholder="Commentaire de suivi..." rows={3} className="mt-3 w-full rounded-xl border border-[var(--opc-border)] px-3 py-2.5 text-sm" />
                <button type="button" disabled={quickSaving} onClick={() => void saveProgressUpdate()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--opc-blue)] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"><Save className="h-4 w-4" />Enregistrer la mise à jour</button>
              </div>
              <div className="mt-4 space-y-2">
                {progressUpdates.length ? progressUpdates.map((item) => (
                  <div key={item.id} className="rounded-xl border border-[var(--opc-border)] p-3">
                    <div className="flex items-center justify-between"><p className="text-sm font-black">{item.progress} %</p><p className="text-xs font-bold text-slate-400">{item.update_date}</p></div>
                    {item.note ? <p className="mt-2 text-sm text-slate-600">{item.note}</p> : null}
                  </div>
                )) : <EmptyState text="Aucune mise à jour d'avancement enregistrée." />}
              </div>
              <ModuleLink href={`/progress?activity=${activity.id}`} label="Ouvrir le module Avancement" />
            </LinkedSection>
          ) : null}

          {!loadingLinkedData && tab === "reporting" ? (
            <LinkedSection title="Reporting de l'activité" description="Toutes les données liées sont prêtes pour alimenter les rapports.">
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Avancement" value={`${progress} %`} />
                <Metric label="Tasks terminées" value={`${completedTasks}/${tasks.length}`} />
                <Metric label="Materials" value={String(materials.length)} />
                <Metric label="Documents" value={String(documents.length)} />
              </div>
              <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                Le prochain module Reporting utilisera automatiquement ces données pour générer la fiche activité, les retards, les ressources, les documents et l'historique d'avancement.
              </div>
              <ModuleLink href={`/reporting?activity=${activity.id}`} label="Ouvrir le module Reporting" />
            </LinkedSection>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-[var(--opc-border)] p-5">
          <button type="button" onClick={onClose} className="rounded-xl border border-[var(--opc-border)] px-4 py-3 text-sm font-bold text-slate-600">Fermer</button>
          <button type="button" disabled={saving} onClick={() => void onSave({ progress, status, responsible: responsible.trim() || null })} className="flex items-center justify-center gap-2 rounded-xl bg-[var(--opc-blue)] px-4 py-3 text-sm font-bold text-white disabled:opacity-60"><Save className="h-4 w-4" />{saving ? "Enregistrement..." : "Enregistrer"}</button>
        </div>
      </aside>
    </>
  );
}

function LinkedSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section><h3 className="text-lg font-black text-[var(--opc-ink)]">{title}</h3><p className="mt-1 text-sm text-[var(--opc-muted)]">{description}</p><div className="mt-4">{children}</div></section>;
}

function QuickAdd({ value, onChange, placeholder, actionLabel, onAction, disabled }: { value: string; onChange: (value: string) => void; placeholder: string; actionLabel: string; onAction: () => Promise<void>; disabled: boolean }) {
  return <div className="grid gap-2 sm:grid-cols-[1fr_auto]"><input value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void onAction(); }} placeholder={placeholder} className="rounded-xl border border-[var(--opc-border)] px-3 py-2.5 text-sm" /><button type="button" disabled={disabled} onClick={() => void onAction()} className="flex items-center justify-center gap-2 rounded-xl bg-[var(--opc-blue)] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"><CirclePlus className="h-4 w-4" />{actionLabel}</button></div>;
}

function ModuleLink({ href, label }: { href: string; label: string }) {
  return <a href={href} className="mt-4 flex items-center justify-between rounded-xl border border-[var(--opc-border)] p-3 text-sm font-black text-[var(--opc-blue)] hover:bg-blue-50">{label}<ExternalLink className="h-4 w-4" /></a>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-[var(--opc-border)] p-5 text-center text-sm font-semibold text-slate-400">{text}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-xl font-black text-[var(--opc-ink)]">{value}</p></div>;
}

function Detail({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><Icon className="h-4 w-4 text-[var(--opc-blue)]" /><p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-black">{value}</p></div>;
}
