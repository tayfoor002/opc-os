"use client";
import { useEffect, useMemo, useState } from "react";
import { Layers3, MapPinned, Workflow } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Row={id:string;name:string;code:string;zone_id?:string};
export function GlobalScopeBar(){
 const supabase=useMemo(()=>createClient(),[]); const [zones,setZones]=useState<Row[]>([]); const [phases,setPhases]=useState<Row[]>([]); const [packages,setPackages]=useState<Row[]>([]);
 const [zone,setZone]=useState(""); const [phase,setPhase]=useState(""); const [wp,setWp]=useState("");
 useEffect(()=>{ const saved=JSON.parse(localStorage.getItem("opc_scope")||"{}"); setZone(saved.zone||""); setPhase(saved.phase||""); setWp(saved.wp||"");
  (async()=>{ const p=await supabase.from("projects").select("id").eq("code","PDD").single(); if(p.error)return; const [z,ph,w]=await Promise.all([supabase.from("zones").select("id,code,name").eq("project_id",p.data.id).order("sort_order"),supabase.from("phases").select("id,code,name,zone_id").eq("project_id",p.data.id).order("sort_order"),supabase.from("work_packages").select("id,code,name").eq("project_id",p.data.id).order("sort_order")]); setZones(z.data||[]); setPhases(ph.data||[]); setPackages(w.data||[]); })(); },[supabase]);
 const filteredPhases=phase&&zone?phases.filter(x=>x.zone_id===zone):zone?phases.filter(x=>x.zone_id===zone):phases;
 function persist(next:{zone:string;phase:string;wp:string}){ localStorage.setItem("opc_scope",JSON.stringify(next)); window.dispatchEvent(new CustomEvent("opc-scope-change",{detail:next})); }
 function changeZone(v:string){setZone(v);setPhase("");persist({zone:v,phase:"",wp});}
 function changePhase(v:string){setPhase(v);persist({zone,phase:v,wp});}
 function changeWp(v:string){setWp(v);persist({zone,phase,wp:v});}
 return <div className="border-b border-[var(--opc-border)] bg-white px-6 py-3"><div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-2 text-sm"><span className="mr-1 font-black text-[var(--opc-ink)]">PDD</span><Scope icon={MapPinned} value={zone} onChange={changeZone}><option value="">Toutes les zones</option>{zones.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</Scope><Scope icon={Workflow} value={phase} onChange={changePhase}><option value="">Toutes les phases</option>{filteredPhases.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</Scope><Scope icon={Layers3} value={wp} onChange={changeWp}><option value="">Tous les lots</option>{packages.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</Scope><span className="ml-auto text-xs font-bold text-slate-400">Filtre global actif dans OPC OS</span></div></div>;
}
function Scope({icon:Icon,value,onChange,children}:{icon:any;value:string;onChange:(v:string)=>void;children:React.ReactNode}){return <label className="flex items-center gap-2 rounded-xl border border-[var(--opc-border)] bg-slate-50 px-3 py-2"><Icon className="h-4 w-4 text-[var(--opc-blue)]"/><select value={value} onChange={e=>onChange(e.target.value)} className="bg-transparent font-bold outline-none">{children}</select></label>}
