"use client";
import { useState, useMemo } from "react";
import { Upload, X, Loader2, Check, FileSpreadsheet } from "lucide-react";
import { readScheduleFile } from "@/lib/planning/import";
import { normalizeLabel, rowErrors, type ScheduleRow } from "@/lib/planning/schedule";
import { saveScheduleChanges } from "@/app/planning/actions";
import { createClient } from "@/lib/supabase/client";
import type { Task } from "@/types/task";
import type { Activity } from "@/types/activity";

type PreviewRow = ScheduleRow & {target: string; activityId: string; included: boolean};
export function ScheduleImport({projectId, tasks, activities, onApplied}: {projectId: string; tasks: Task[]; activities: Activity[]; onApplied: () => Promise<void>}) {
  const [open,setOpen] = useState(false);
  const [rows,setRows] = useState<PreviewRow[]>([]);
  const [source,setSource] = useState("");
  const [warnings,setWarnings] = useState<string[]>([]);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false);
  const [loadedSource,setLoadedSource] = useState("");
  const supabase = useMemo(() => createClient(),[]);
  const patch = (index:number, updates:Partial<PreviewRow>) => setRows(current => current.map((row,i) => i===index ? {...row,...updates} : row));

  async function matchRows(imported: ScheduleRow[], namespace: string) {
    const bindings = await supabase.from("schedule_bindings").select("source_key,task_id").eq("project_id",projectId).eq("source_name",namespace);
    if (bindings.error) throw new Error("L’import nécessite la migration Planning 019. " + bindings.error.message);
    const mapped = new Map((bindings.data ?? []).map(row => [row.source_key,row.task_id]));
    setRows(imported.map(row => {
      const parentMatches = activities.filter(activity => normalizeLabel(activity.name) === normalizeLabel(row.parent) || (row.parent && normalizeLabel(activity.code) === normalizeLabel(row.parent)));
      const parentId = parentMatches.length === 1 ? parentMatches[0].id : "";
      const candidates = tasks.filter(task => normalizeLabel(task.title) === normalizeLabel(row.title) && (!parentId || task.activity_id===parentId));
      const bound = mapped.get(row.key);
      const repeated = imported.filter(other => normalizeLabel(other.title) === normalizeLabel(row.title)).length > 1;
      const target = bound && tasks.some(task => task.id===bound) ? bound : candidates.length===1 && !repeated ? candidates[0].id : "";
      return {...row,target,activityId:parentId,included:Boolean(target),warnings:[...row.warnings,...(candidates.length>1&&!bound ? ["Plusieurs tâches portent ce nom : choisis la correspondance."] : [])]};
    }));
    setLoadedSource(namespace);
  }

  async function read(file: File) {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await readScheduleFile(file);
      const namespace = file.name.replace(/\.[^.]+$/, "");
      await matchRows(result.rows, namespace);
      setSource(namespace); setWarnings(result.warnings);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Lecture impossible"); }
    finally {setBusy(false);}
  }

  const selected = rows.filter(row=>row.included);
  const issues = selected.flatMap(row => [...rowErrors(row), ...(!row.target ? ["Choisis une tâche existante ou Nouvelle tâche"] : []), ...(row.target==="new"&&!row.activityId ? ["Activité parente requise"] : [])]);
  const existingTargets = selected.filter(row=>row.target!=="new").map(row=>row.target);
  if (new Set(existingTargets).size!==existingTargets.length) issues.push("Deux lignes ciblent la même tâche.");

  async function apply() {
    setBusy(true);setError("");
    try {
      const result = await saveScheduleChanges({projectId,source,rows:selected.map(row => {
        const task = tasks.find(task=>task.id===row.target);
        return {task_id:task?.id ?? null,activity_id:task?.activity_id ?? row.activityId,title:row.title,start:row.start,finish:row.finish,expected_start:task?.start_date ?? null,expected_finish:task?.due_date ?? null,source_key:row.key,metadata:{parent:row.parent,predecessors:row.predecessors}};
      })});
      if (!result.success) {setError(result.error);return;}
      await onApplied();setRows([]);setMessage(`${result.count} tâches synchronisées. Les activités parentes ont été recalculées.`);
    } catch (cause) {setError(cause instanceof Error ? cause.message : "Import impossible");}
    finally {setBusy(false);}
  }

  return <>
    <button onClick={()=>setOpen(true)} className="flex items-center gap-2 rounded-xl bg-[var(--opc-blue)] px-4 py-3 text-sm font-bold text-white"><Upload size={17}/>Importer un planning</button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="schedule-import-title">
      <div className="flex max-h-[92vh] w-full max-w-[1450px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b p-6"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Importer · Vérifier · Synchroniser</p><h2 id="schedule-import-title" className="mt-1 text-2xl font-black">Importer le planning du projet</h2><p className="mt-2 text-sm text-slate-500">Les dates planifiées sont mises à jour. L’avancement terrain, les documents et les responsables sont conservés.</p></div><button disabled={busy} aria-label="Fermer l’import" onClick={()=>setOpen(false)} className="rounded-lg p-2 hover:bg-slate-100"><X/></button></header>
        <div className="overflow-auto p-6">
          <label className={`flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50 p-5 ${busy ? "pointer-events-none opacity-50" : ""}`}><FileSpreadsheet className="text-blue-600"/><div><strong>Choisir un planning</strong><p className="mt-1 text-xs text-slate-500">PDF avec dates explicites · Excel / CSV · XML MS Project · 20 Mo maximum</p><p className="mt-1 text-xs text-slate-500">Pour .mpp : enregistrer au format XML depuis MS Project. Les PDF scannés nécessitent un OCR.</p></div><input aria-label="Fichier planning" type="file" accept=".pdf,.xlsx,.xls,.csv,.xml,.mpp" disabled={busy} className="sr-only" onChange={event=>{const file=event.target.files?.[0];if(file)void read(file);event.target.value="";}}/></label>
          {busy && <p className="mt-3 flex items-center gap-2 text-sm"><Loader2 className="animate-spin" size={18}/>Traitement en cours…</p>}
          {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {message && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
          {!!rows.length && <>
            <div className="my-5 flex flex-wrap items-end gap-4"><label className="text-sm font-bold">Identifiant du planning<input aria-label="Identifiant du planning" value={source} maxLength={200} disabled={busy} onChange={event=>setSource(event.target.value)} className="mt-1 block rounded-lg border p-2 font-normal"/><span className="mt-1 block text-xs font-normal text-slate-500">Garde le même identifiant pour les prochaines révisions.</span></label><button disabled={busy || !source.trim()} className="rounded-lg border px-3 py-2 text-sm font-bold" onClick={async()=>{setBusy(true);setError("");try{await matchRows(rows,source);}catch(cause){setError(String(cause));}finally{setBusy(false);}}}>Rapprocher les tâches</button><p className="text-sm text-slate-600">{rows.length} lignes détectées · {selected.length} sélectionnées</p></div>
            {warnings.map(warning=><p key={warning} className="mb-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{warning}</p>)}
            <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[1060px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Choix","Source / tâche","Début","Fin","Correspondance OPC OS","Activité parente"].map(label=><th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={row.key} className="border-t align-top"><td className="p-3"><input aria-label={`Importer ${row.title}`} type="checkbox" checked={row.included} disabled={busy} onChange={event=>patch(index,{included:event.target.checked})}/></td><td className="p-3"><span className="text-xs text-slate-400">{row.key}</span><input aria-label={`Libellé ${index+1}`} maxLength={250} disabled={busy} value={row.title} onChange={event=>patch(index,{title:event.target.value})} className="block w-56 rounded border p-2 font-semibold"/>{[...rowErrors(row),...row.warnings].map((warning,i)=><p key={i} className="mt-1 max-w-xs text-xs text-amber-700">{warning}</p>)}{row.predecessors.length>0&&<p className="mt-1 text-xs text-slate-500">Prédécesseurs source : {row.predecessors.join(", ")}</p>}</td><td className="p-3"><input aria-label={`Début ${index+1}`} type="date" disabled={busy} value={row.start} onChange={event=>patch(index,{start:event.target.value})} className="rounded border p-2"/></td><td className="p-3"><input aria-label={`Fin ${index+1}`} type="date" disabled={busy} value={row.finish} onChange={event=>patch(index,{finish:event.target.value})} className="rounded border p-2"/></td><td className="p-3"><select aria-label={`Correspondance ${index+1}`} disabled={busy} value={row.target} onChange={event=>patch(index,{target:event.target.value,included:Boolean(event.target.value)})} className="max-w-72 rounded border p-2"><option value="">Choisir / ignorer</option><option value="new">+ Nouvelle tâche</option>{tasks.map(task=><option key={task.id} value={task.id}>{activities.find(activity=>activity.id===task.activity_id)?.code ?? "Sans activité"} · {task.title}</option>)}</select>{row.target!=="new"&&row.target&&<p className="mt-2 text-xs text-slate-500">Actuellement : {tasks.find(task=>task.id===row.target)?.start_date ?? "—"} → {tasks.find(task=>task.id===row.target)?.due_date ?? "—"}</p>}</td><td className="p-3">{row.target==="new"?<select aria-label={`Activité ${index+1}`} disabled={busy} value={row.activityId} onChange={event=>patch(index,{activityId:event.target.value})} className="max-w-64 rounded border p-2"><option value="">Choisir une activité</option>{activities.map(activity=><option key={activity.id} value={activity.id}>{activity.code} · {activity.name}</option>)}</select>:<span className="text-xs">{activities.find(activity=>activity.id===tasks.find(task=>task.id===row.target)?.activity_id)?.name ?? "—"}</span>}</td></tr>)}</tbody></table></div>
          </>}
        </div>
        <footer className="flex items-center justify-between gap-3 border-t bg-slate-50 p-5"><p className="text-xs text-slate-500">{issues.length ? issues[0] : "L’import s’applique en une transaction, avec contrôle des modifications concurrentes."}</p><button disabled={busy||!selected.length||!!issues.length||source!==loadedSource} onClick={()=>void apply()} className="flex shrink-0 items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-40"><Check size={17}/>Valider {selected.length} tâches</button></footer>
      </div>
    </div>}
  </>;
}
