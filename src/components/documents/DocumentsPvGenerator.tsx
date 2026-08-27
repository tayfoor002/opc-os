"use client";

import { Archive, Download, FileText, Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  downloadGeneratedFile,
  generatePvPdfBlob,
  generatePvWordBlob,
  safePvFileName,
  type GeneratedPv,
} from "@/lib/documents/pv-generator";
import { parsePastedPv } from "@/lib/meetings/pasted-pv";
import { createClient } from "@/lib/supabase/client";

type Project = { id: string; code: string | null; name: string };
type Zone = { id: string; project_id: string; code: string | null; name: string };

const classifications = ["Coordination", "Chantier", "Technique", "Sécurité / EHS", "Client", "Autre"];

export function DocumentsPvGenerator({
  projects,
  onOpenPvLibrary,
}: {
  projects: Project[];
  onOpenPvLibrary: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const defaultProject = projects.find((project) => project.code === "PDD")?.id ?? projects[0]?.id ?? "";
  const [projectId, setProjectId] = useState(defaultProject);
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneId, setZoneId] = useState("");
  const [title, setTitle] = useState("");
  const [classification, setClassification] = useState("Coordination");
  const [text, setText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState<{
    pdf: Blob;
    word: Blob;
    fileBase: string;
    documentId: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    async function loadZones() {
      if (!projectId) return setZones([]);
      const result = await supabase
        .from("zones")
        .select("id,project_id,code,name")
        .eq("project_id", projectId)
        .order("name");
      if (!active) return;
      if (result.error) setError(result.error.message);
      else setZones((result.data ?? []) as Zone[]);
    }
    void loadZones();
    return () => {
      active = false;
    };
  }, [projectId, supabase]);

  function invalidate() {
    setGenerated(null);
    setError("");
  }

  async function generateAndArchive() {
    if (!projectId) {
      setError("Sélectionnez le projet du PV.");
      return;
    }
    if (!title.trim()) {
      setError("Saisissez le titre du PV.");
      return;
    }
    if (!text.trim()) {
      setError("Collez le texte digitalisé complet du PV.");
      return;
    }
    setGenerating(true);
    setError("");
    const documentId = crypto.randomUUID();
    const parsed = parsePastedPv(text, title);
    const date = parsed.meeting_date || new Date().toISOString().slice(0, 10);
    const reference = `PV-${date.replaceAll("-", "")}-${documentId.slice(0, 6).toUpperCase()}`;
    const zone = zones.find((item) => item.id === zoneId);
    const pv: GeneratedPv = {
      ...parsed,
      meeting_date: date,
      reference,
      zone_name: zone?.name ?? "Non classée",
      classification,
    };
    const fileBase = safePvFileName(pv.title);
    const storagePath = `${projectId}/${documentId}/${fileBase}.pdf`;
    try {
      const [pdf, word] = await Promise.all([
        generatePvPdfBlob(pv),
        generatePvWordBlob(pv),
      ]);
      const upload = await supabase.storage.from("documents").upload(storagePath, pdf, {
        contentType: "application/pdf",
        upsert: false,
      });
      if (upload.error) throw new Error(`Archivage du PDF impossible : ${upload.error.message}`);
      const insert = await supabase.from("documents").insert({
        id: documentId,
        project_id: projectId,
        zone_id: zoneId || null,
        title: pv.title,
        reference,
        revision: "00",
        status: "Finalisé",
        category: "PV",
        document_type: "pv",
        document_subcategory: "pv_reunion",
        execution_status: "not_applicable",
        company: "OPC OS",
        comments: `PV généré automatiquement depuis un texte digitalisé. Classement : ${classification}.`,
        document_date: date,
        file_url: storagePath,
      });
      if (insert.error) {
        await supabase.storage.from("documents").remove([storagePath]);
        throw new Error(`Classement dans Documents impossible : ${insert.error.message}`);
      }
      setGenerated({ pdf, word, fileBase, documentId });
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Génération du PV impossible.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="rounded-2xl border border-emerald-200 bg-white shadow-sm">
      <div className="rounded-t-2xl bg-emerald-700 px-6 py-5 text-white">
        <h2 className="flex items-center gap-2 text-xl font-black">
          <FileText className="h-5 w-5" /> Générateur de procès-verbal
        </h2>
        <p className="mt-1 text-sm font-semibold text-emerald-100">
          Générateur indépendant · classement automatique dans Documents → PV
        </p>
      </div>
      <div className="space-y-5 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-xs font-black uppercase tracking-wide text-slate-500">
            Projet
            <select value={projectId} onChange={(event) => { setProjectId(event.target.value); setZoneId(""); invalidate(); }} className="input mt-2 normal-case">
              {projects.map((project) => <option key={project.id} value={project.id}>{project.code ? `${project.code} — ` : ""}{project.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-black uppercase tracking-wide text-slate-500">
            Zone de classement (facultative)
            <select value={zoneId} onChange={(event) => { setZoneId(event.target.value); invalidate(); }} className="input mt-2 normal-case">
              <option value="">Sélectionner la zone…</option>
              {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.code ? `${zone.code} — ` : ""}{zone.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-black uppercase tracking-wide text-slate-500 md:col-span-2">
            Titre du PV
            <input value={title} onChange={(event) => { setTitle(event.target.value); invalidate(); }} className="input mt-2 normal-case" placeholder="PV de coordination — Zone A" />
            <span className="mt-1 block text-[11px] font-medium normal-case text-slate-400">Le titre devient le nom des fichiers PDF et Word.</span>
          </label>
          <label className="text-xs font-black uppercase tracking-wide text-slate-500">
            Classement
            <select value={classification} onChange={(event) => { setClassification(event.target.value); invalidate(); }} className="input mt-2 normal-case">
              {classifications.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
          Texte digitalisé complet
          <textarea rows={16} value={text} onChange={(event) => { setText(event.target.value); invalidate(); }} className="input mt-2 resize-y whitespace-pre-wrap normal-case leading-relaxed" placeholder={"Collez ici le texte complet du PV…\n\nDate : 20/08/2026\nLieu : Chantier\nObjet : Coordination des travaux\n\nParticipants :\n- Nom — Société — Fonction\n\nPoints traités :\n1. Avancement des travaux…"} />
        </label>
        {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p> : null}
        {!generated ? (
          <button type="button" disabled={generating} onClick={() => void generateAndArchive()} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white disabled:cursor-wait disabled:opacity-60">
            {generating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
            {generating ? "Génération et classement…" : "Générer et classer dans Documents → PV"}
          </button>
        ) : (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="flex items-center gap-2 text-sm font-black text-emerald-800"><Archive className="h-5 w-5" /> PV généré et classé dans Documents → PV</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <button type="button" onClick={() => downloadGeneratedFile(generated.pdf, `${generated.fileBase}.pdf`)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--opc-red)] px-4 text-sm font-black text-white"><Download className="h-4 w-4" /> Télécharger PDF</button>
              <button type="button" onClick={() => downloadGeneratedFile(generated.word, `${generated.fileBase}.docx`)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--opc-blue)] px-4 text-sm font-black text-white"><Download className="h-4 w-4" /> Télécharger Word</button>
              <button type="button" onClick={onOpenPvLibrary} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 text-sm font-black text-emerald-800"><Archive className="h-4 w-4" /> Ouvrir Documents → PV</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
