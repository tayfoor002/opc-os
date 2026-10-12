"use client";
import { useRef, useState } from "react";
import { ChevronDown, ChevronRight, Download, Save, X, CalendarDays, Plus, Loader2 } from "lucide-react";
import type { Activity } from "@/types/activity";
import type { Task } from "@/types/task";
import { dayDistance, shiftDate, validDate, exportProjectXml } from "@/lib/planning/schedule";
import { saveScheduleChanges } from "@/app/planning/actions";
import { ScheduleImport } from "./ScheduleImport";

type Editor = {task:Task|null; activityId:string; title:string; start:string; finish:string};
function download(content:string, name:string, type:string) {
  const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement("a");link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function EditableGantt({activities,tasks,projectId,onSaved,onOpenActivity}: {activities:Activity[]; tasks:Task[]; projectId:string; onSaved:()=>Promise<void>; onOpenActivity:(activity:Activity)=>void}) {
  const [zoom,setZoom]=useState<"day"|"week"|"month">("week");
  const [collapsed,setCollapsed]=useState<Set<string>>(new Set());
  const [editor,setEditor]=useState<Editor|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [drag,setDrag]=useState<{id:string;x:number;days:number}|null>(null);
  const [onlyLate,setOnlyLate]=useState(false);
  const [notice,setNotice]=useState("");
  const suppressClick=useRef(false);
  const now=new Date();
  const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const visibleTasks=tasks.filter(task=>!onlyLate||(task.due_date&&task.due_date<today&&task.status!=="done"));
  const dates=[...activities.flatMap(activity=>[activity.start_date,activity.finish_date]),...tasks.flatMap(task=>[task.start_date,task.due_date])].filter((date):date is string=>Boolean(date)&&validDate(date!)).sort();
  const start=shiftDate(dates[0]??today,-7);
  const end=shiftDate(dates.at(-1)??today,14);
  const days=Math.max(1,dayDistance(start,end)+1);
  const pixels=zoom==="day"?30:zoom==="week"?10:3;
  const width=Math.max(800,days*pixels);
  const dayWidth=width/days;
  const ticks=(()=>{
    const result:{date:string;label:string;offset:number;span:number}[]=[];
    let cursor=start;
    while(cursor<=end&&result.length<1500){
      let next=shiftDate(cursor,zoom==="day"?1:7);
      if(zoom==="month") {const date=new Date(`${cursor}T12:00:00Z`);date.setUTCMonth(date.getUTCMonth()+1,1);next=date.toISOString().slice(0,10);}
      const span=Math.min(dayDistance(cursor,next),dayDistance(cursor,end)+1);
      result.push({date:cursor,label:new Intl.DateTimeFormat("fr-FR",{day:zoom==="month"?undefined:"2-digit",month:"short",year:"2-digit",timeZone:"UTC"}).format(new Date(`${cursor}T12:00:00Z`)),offset:dayDistance(start,cursor),span});cursor=next;
    }
    return result;
  })();
  const undated=tasks.filter(task=>!task.start_date||!task.due_date).length;
  const late=tasks.filter(task=>task.due_date&&task.due_date<today&&task.status!=="done").length;
  const selectedActivities=activities.filter(activity=>!onlyLate||visibleTasks.some(task=>task.activity_id===activity.id));
  const groups=[...selectedActivities.map(activity=>({id:activity.id,activity,title:`${activity.code} · ${activity.name}`,items:visibleTasks.filter(task=>task.activity_id===activity.id)})),...(visibleTasks.some(task=>!task.activity_id)?[{id:"unassigned",activity:null,title:"Tâches sans activité",items:visibleTasks.filter(task=>!task.activity_id)}]:[])];

  function editTask(task:Task,shift=0){setError("");setEditor({task,activityId:task.activity_id??"",title:task.title,start:task.start_date?shiftDate(task.start_date,shift):"",finish:task.due_date?shiftDate(task.due_date,shift):""});}
  async function save(){
    if(!editor)return;setBusy(true);setError("");
    try{
      const result=await saveScheduleChanges({projectId,source:"Modification manuelle",rows:[{task_id:editor.task?.id??null,activity_id:editor.activityId||null,title:editor.title,start:editor.start,finish:editor.finish,expected_start:editor.task?.start_date??null,expected_finish:editor.task?.due_date??null}]});
      if(!result.success){setError(result.error);return;}
      await onSaved();setEditor(null);setNotice("Dates enregistrées : tâches et activités synchronisées.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Enregistrement impossible");}finally{setBusy(false);}
  }
  function exportXml(){
    const rows=activities.flatMap(activity=>{
      const children=tasks.filter(task=>task.activity_id===activity.id&&task.start_date&&task.due_date);
      const summary=activity.start_date&&activity.finish_date?[{id:activity.id,title:`${activity.code} · ${activity.name}`,start:activity.start_date,finish:activity.finish_date,progress:activity.progress,summary:true,level:1}]:[];
      return [...summary,...children.map(task=>({id:task.id,title:task.title,start:task.start_date!,finish:task.due_date!,progress:task.progress,summary:false,level:summary.length?2:1}))];
    });
    rows.push(...tasks.filter(task=>!task.activity_id&&task.start_date&&task.due_date).map(task=>({id:task.id,title:task.title,start:task.start_date!,finish:task.due_date!,progress:task.progress,summary:false,level:1})));
    if(!rows.length){setNotice("Aucune tâche datée à exporter.");return;}
    download(exportProjectXml(rows),"OPC-OS-planning.xml","application/xml");setNotice(`Export XML : dates, hiérarchie et avancement. ${undated} tâches sans dates exclues. Calendriers et dépendances non exportés.`);
  }
  function exportCsv(){
    const quote=(value:unknown)=>`"${String(value??"").replace(/"/g,'""')}"`;
    const rows=[["ID","Nom de la tâche","Début","Fin","Activité parente","Avancement"],...tasks.map(task=>[task.id,task.title,task.start_date,task.due_date,activities.find(activity=>activity.id===task.activity_id)?.name??"",task.progress])];
    download("\uFEFF"+rows.map(row=>row.map(quote).join(";")).join("\r\n"),"OPC-OS-planning.csv","text/csv;charset=utf-8");
  }

  function bar(dateStart:string|null,dateFinish:string|null,progress:number,summary:boolean,task?:Task){
    if(!dateStart||!dateFinish||!validDate(dateStart)||!validDate(dateFinish))return <span className="absolute left-4 top-3 text-xs italic text-slate-400">Dates à définir</span>;
    const offset=dayDistance(start,dateStart)+(drag?.id===task?.id?drag?.days??0:0);
    const duration=Math.max(1,dayDistance(dateStart,dateFinish)+1);
    const overdue=task&&dateFinish<today&&task.status!=="done";
    return <button aria-label={task?`Modifier les dates de ${task.title}`:"Période de l’activité"} title={`${dateStart} → ${dateFinish} · ${progress}%`} onClick={()=>{if(suppressClick.current){suppressClick.current=false;return;}if(task)editTask(task);}} onPointerDown={event=>{if(!task)return;suppressClick.current=false;event.currentTarget.setPointerCapture(event.pointerId);setDrag({id:task.id,x:event.clientX,days:0});}} onPointerMove={event=>{if(drag?.id===task?.id)setDrag({...drag!,days:Math.round((event.clientX-drag!.x)/dayWidth)});}} onPointerUp={event=>{if(!task||drag?.id!==task.id)return;event.currentTarget.releasePointerCapture(event.pointerId);const shift=drag.days;setDrag(null);if(shift){suppressClick.current=true;event.preventDefault();editTask(task,shift);}}} onPointerCancel={()=>setDrag(null)} className={`absolute top-2.5 h-7 overflow-hidden rounded-md text-left shadow-sm ${summary?"bg-slate-800":task?.status==="done"?"bg-emerald-600":task?.status==="blocked"?"bg-red-600":overdue?"bg-amber-500":"bg-blue-600"} ${task?"touch-none cursor-grab active:cursor-grabbing":"pointer-events-none"}`} style={{left:offset*dayWidth,width:Math.max(8,duration*dayWidth)}}><span className="absolute inset-y-0 left-0 bg-black/20" style={{width:`${Math.min(100,Math.max(0,progress))}%`}}/><span className="relative flex h-full items-center whitespace-nowrap px-2 text-[10px] font-bold text-white">{progress}%</span></button>;
  }
  const gridBackground={backgroundImage:"linear-gradient(to right, #e2e8f0 1px, transparent 1px)",backgroundSize:`${dayWidth*(zoom==="day"?1:7)}px 100%`};
  const todayOffset=dayDistance(start,today)*dayWidth;
  const marker=todayOffset>=0&&todayOffset<=width?<div className="pointer-events-none absolute inset-y-0 z-10 border-l-2 border-red-500" style={{left:todayOffset}}/>:null;
  return <div className="p-5">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black text-slate-900">Gantt opérationnel</h2><p className="mt-1 text-sm text-slate-500">Activités et tâches · une seule source de dates · mise à jour après validation</p></div><div className="flex flex-wrap gap-2"><ScheduleImport projectId={projectId} tasks={tasks} activities={activities} onApplied={onSaved}/><button onClick={()=>{setError("");setEditor({task:null,activityId:activities[0]?.id??"",title:"",start:"",finish:""});}} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold"><Plus size={17}/>Nouvelle tâche</button><button onClick={exportXml} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold"><Download size={16}/>MS Project XML</button><button onClick={exportCsv} className="rounded-xl border px-3 py-2 text-sm font-bold">Excel / CSV</button></div></div>
    <div className="mb-4 flex flex-wrap gap-3 text-xs font-semibold"><span className="rounded-lg bg-blue-50 px-3 py-2 text-blue-700">{tasks.length} tâches</span><span className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">{undated} sans dates</span><span className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{late} en retard</span><span className="rounded-lg bg-slate-100 px-3 py-2">{start} → {end}</span></div>
    {notice&&<p role="status" className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">{notice}</p>}
    <div className="mb-4 flex flex-wrap items-center gap-2">{(["day","week","month"] as const).map(scale=><button key={scale} onClick={()=>setZoom(scale)} className={`rounded-lg px-3 py-2 text-sm font-bold ${zoom===scale?"bg-slate-900 text-white":"border bg-white"}`}>{scale==="day"?"Jour":scale==="week"?"Semaine":"Mois"}</button>)}<button onClick={()=>setCollapsed(new Set())} className="rounded-lg border px-3 py-2 text-sm">Tout développer</button><label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyLate} onChange={event=>setOnlyLate(event.target.checked)}/>Tâches en retard</label></div>
    <div className="max-h-[650px] overflow-auto rounded-xl border border-slate-200"><div className="grid min-w-max" style={{gridTemplateColumns:`390px ${width}px`}}>
      <div className="sticky left-0 top-0 z-30 flex h-14 items-center border-b border-r bg-slate-100 px-4 text-xs font-black uppercase tracking-wide text-slate-600">Activité / tâche · avancement</div><div className="sticky top-0 z-20 h-14 border-b bg-slate-100">{ticks.map(tick=><div key={tick.date} className="absolute flex h-full items-center justify-center border-r text-[10px] font-bold text-slate-500" style={{left:tick.offset*dayWidth,width:tick.span*dayWidth}}>{tick.label}</div>)}{marker}</div>
      {groups.map(group=><GanttGroup key={group.id} group={group} collapsed={collapsed.has(group.id)} toggle={()=>setCollapsed(current=>{const next=new Set(current);if(next.has(group.id))next.delete(group.id);else next.add(group.id);return next;})} onOpen={()=>group.activity&&onOpenActivity(group.activity)} edit={editTask} bar={bar} marker={marker} background={gridBackground}/>)}
      {!groups.length&&<div className="col-span-2 p-12 text-center text-sm text-slate-500">Aucune tâche pour cette vue.</div>}
    </div></div>
    <div className="mt-3 flex flex-wrap gap-5 text-xs text-slate-500"><span>■ Activité récapitulative</span><span className="text-blue-600">■ Planifiée / en cours</span><span className="text-amber-600">■ En retard</span><span className="text-emerald-600">■ Terminée</span><span className="text-red-600">│ Aujourd’hui</span><span>Cliquer ou déplacer une barre pour modifier ses dates.</span></div>
    {editor&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="schedule-editor-title"><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><h3 id="schedule-editor-title" className="text-xl font-black">{editor.task?"Modifier les dates":"Créer une tâche planifiée"}</h3><button disabled={busy} aria-label="Fermer l’édition" onClick={()=>setEditor(null)}><X/></button></div><p className="mt-2 text-sm text-slate-500">Les dates de l’activité parente sont recalculées à partir de ses tâches.</p><label className="mt-5 block text-sm font-bold">Tâche<input aria-label="Nom de la tâche" disabled={busy||!!editor.task} maxLength={250} value={editor.title} onChange={event=>setEditor({...editor,title:event.target.value})} className="mt-1 w-full rounded-lg border p-3 disabled:bg-slate-50"/></label>{!editor.task&&<label className="mt-3 block text-sm font-bold">Activité<select aria-label="Activité parente" disabled={busy} value={editor.activityId} onChange={event=>setEditor({...editor,activityId:event.target.value})} className="mt-1 w-full rounded-lg border p-3"><option value="">Choisir une activité</option>{activities.map(activity=><option key={activity.id} value={activity.id}>{activity.code} · {activity.name}</option>)}</select></label>}<div className="mt-4 grid grid-cols-2 gap-3"><label className="text-sm font-bold">Début<input aria-label="Date de début" disabled={busy} type="date" value={editor.start} onChange={event=>setEditor({...editor,start:event.target.value})} className="mt-1 w-full rounded-lg border p-3"/></label><label className="text-sm font-bold">Fin<input aria-label="Date de fin" disabled={busy} type="date" min={editor.start||undefined} value={editor.finish} onChange={event=>setEditor({...editor,finish:event.target.value})} className="mt-1 w-full rounded-lg border p-3"/></label></div>{editor.start&&editor.finish&&<p className="mt-3 text-xs text-slate-500"><CalendarDays size={14} className="mr-1 inline"/>{dayDistance(editor.start,editor.finish)+1} jours calendaires · pas de recalcul des jours ouvrés</p>}{error&&<p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button disabled={busy||!editor.title.trim()||(!editor.task&&!editor.activityId)||!validDate(editor.start)||!validDate(editor.finish)||editor.start>editor.finish} onClick={()=>void save()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 p-3 font-bold text-white disabled:opacity-40">{busy?<Loader2 size={17} className="animate-spin"/>:<Save size={17}/>}Enregistrer et synchroniser</button></div></div>}
  </div>;
}

function GanttGroup({group,collapsed,toggle,onOpen,edit,bar,marker,background}: {group:{id:string;activity:Activity|null;title:string;items:Task[]};collapsed:boolean;toggle:()=>void;onOpen:()=>void;edit:(task:Task)=>void;bar:(start:string|null,finish:string|null,progress:number,summary:boolean,task?:Task)=>React.ReactNode;marker:React.ReactNode;background:React.CSSProperties}) {
  const activity=group.activity;
  return <>
    <div className="sticky left-0 z-10 flex h-14 items-center gap-2 border-b border-r bg-slate-100 px-3"><button aria-label={`Développer ${group.title}`} onClick={toggle} className="rounded p-1 hover:bg-slate-200">{collapsed?<ChevronRight size={16}/>:<ChevronDown size={16}/>}</button><button onClick={onOpen} className="min-w-0 flex-1 text-left"><span className="block truncate text-xs font-black text-slate-800">{group.title}</span><span className="text-[10px] text-slate-500">{group.items.length} tâches · {activity?.progress??0}%</span></button></div><div className="relative h-14 border-b bg-slate-50" style={background}>{activity&&bar(activity.start_date,activity.finish_date,activity.progress,true)}{marker}</div>
    {!collapsed&&group.items.map(task=><TaskGanttRow key={task.id} task={task} edit={edit} bar={bar} marker={marker} background={background}/>)}
  </>;
}
function TaskGanttRow({task,edit,bar,marker,background}:{task:Task;edit:(task:Task)=>void;bar:(start:string|null,finish:string|null,progress:number,summary:boolean,task?:Task)=>React.ReactNode;marker:React.ReactNode;background:React.CSSProperties}) {
  return <><button onClick={()=>edit(task)} className="sticky left-0 z-10 flex h-12 items-center gap-2 border-b border-r bg-white px-4 pl-10 text-left hover:bg-blue-50"><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-700">{task.title}</span><span className="text-[10px] text-slate-400">{task.start_date??"—"} → {task.due_date??"—"}</span></span><span className="text-xs font-bold text-blue-700">{task.progress}%</span></button><div className="relative h-12 border-b bg-white" style={background}>{bar(task.start_date,task.due_date,task.progress,false,task)}{marker}</div></>;
}
