"use client";

import {
  Archive,
  Download,
  Eye,
  EyeOff,
  FileScan,
  FileText,
  Loader2,
  PenLine,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  downloadGeneratedFile,
  generatePvPdfBlob,
  generatePvWordBlob,
  prepareOriginalPvScan,
  safePvFileName,
  type GeneratedPv,
} from "@/lib/documents/pv-generator";
import { parsePastedPv } from "@/lib/meetings/pasted-pv";
import { createClient } from "@/lib/supabase/client";

type Project = { id: string; code: string | null; name: string };
type Zone = { id: string; project_id: string; code: string | null; name: string };

const classifications = ["Coordination", "Chantier", "Technique", "Sécurité / EHS", "Client", "Autre"];
const companies = ["ALSTOM", "AVANZIT", "ONCF", "Groupement projet"];

type Signatory = { company: "ONCF" | "ALSTOM" | "AVANZIT"; name: string; role: string };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function displayDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}-${month}-${year}` : value;
}

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
  const [classification, setClassification] = useState("Coordination");
  const [issuerCompany, setIssuerCompany] = useState("ALSTOM");
  const [text, setText] = useState("");
  const [originalScan, setOriginalScan] = useState<File | null>(null);
  const [dateOverride, setDateOverride] = useState("");
  const [objectiveOverride, setObjectiveOverride] = useState("");
  const [showOncfLogo, setShowOncfLogo] = useState(true);
  const [showAlstomLogo, setShowAlstomLogo] = useState(true);
  const [showAvanzitLogo, setShowAvanzitLogo] = useState(true);
  const [signatories, setSignatories] = useState<Signatory[]>([
    { company: "ONCF", name: "", role: "" },
    { company: "ALSTOM", name: "", role: "" },
    { company: "AVANZIT", name: "", role: "" },
  ]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState<{
    pdf: Blob;
    word: Blob;
    fileBase: string;
    documentId: string;
    original?: Blob;
  } | null>(null);
  const detectedPv = useMemo(() => parsePastedPv(text, ""), [text]);
  const pvDate = dateOverride || detectedPv.meeting_date || today();
  const pvObjective = objectiveOverride || detectedPv.objective;
  const automaticTitle = `${displayDate(pvDate)} — ${pvObjective || "Objet du PV à détecter"}`;

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

  function chooseOriginalScan(file: File | null) {
    invalidate();
    if (!file) {
      setOriginalScan(null);
      return;
    }
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      setError("Format du scan original accepté : PDF, JPG ou PNG.");
      return;
    }
    if (file.size > 45 * 1024 * 1024) {
      setError("Le scan original doit faire moins de 45 Mo.");
      return;
    }
    setOriginalScan(file);
  }

  async function generateAndArchive() {
    if (!projectId) {
      setError("Sélectionnez le projet du PV.");
      return;
    }
    if (!text.trim()) {
      setError("Collez le texte digitalisé complet du PV.");
      return;
    }
    if (!pvObjective.trim()) {
      setError(
        "Objet du PV non détecté. Ajoutez une ligne « Objet : ... » dans le texte ou renseignez le champ Objet détecté.",
      );
      return;
    }
    setGenerating(true);
    setError("");
    const documentId = crypto.randomUUID();
    const originalDocumentId = originalScan ? crypto.randomUUID() : null;
    const parsed = parsePastedPv(text, automaticTitle);
    const date = pvDate;
    const reference = `PV-${date.replaceAll("-", "")}-${documentId.slice(0, 6).toUpperCase()}`;
    const zone = zones.find((item) => item.id === zoneId);
    const pv: GeneratedPv = {
      ...parsed,
      meeting_date: date,
      objective: pvObjective,
      title: `${displayDate(date)} — ${pvObjective}`,
      reference,
      zone_name: zone?.name ?? "",
      classification,
      project_name: projects.find((project) => project.id === projectId)?.name ?? "Projet PDD",
      issuer_company: issuerCompany,
      show_logos: {
        oncf: showOncfLogo,
        alstom: showAlstomLogo,
        avanzit: showAvanzitLogo,
      },
      signatories,
    };
    const fileBase = safePvFileName(pv.title);
    const storagePath = `${projectId}/${documentId}/${fileBase}.pdf`;
    const originalStoragePath = originalDocumentId
      ? `${projectId}/${originalDocumentId}/${fileBase}-scan-original.pdf`
      : null;
    try {
      const [pdf, word, original] = await Promise.all([
        generatePvPdfBlob(pv),
        generatePvWordBlob(pv),
        originalScan ? prepareOriginalPvScan(originalScan) : Promise.resolve(undefined),
      ]);
      const upload = await supabase.storage.from("documents").upload(storagePath, pdf, {
        contentType: "application/pdf",
        upsert: false,
      });
      if (upload.error) throw new Error(`Archivage du PDF impossible : ${upload.error.message}`);
      if (original && originalStoragePath) {
        const originalUpload = await supabase.storage
          .from("documents")
          .upload(originalStoragePath, original, {
            contentType: "application/pdf",
            upsert: false,
          });
        if (originalUpload.error) {
          await supabase.storage.from("documents").remove([storagePath]);
          throw new Error(`Archivage du scan original impossible : ${originalUpload.error.message}`);
        }
      }
      const sharedMetadata = {
        project_id: projectId,
        zone_id: zoneId || null,
        revision: "00",
        status: "Finalisé",
        category: "PV",
        document_type: "pv" as const,
        execution_status: "not_applicable" as const,
        company: issuerCompany,
        document_date: date,
      };
      const documentRows = [
        {
          id: documentId,
          ...sharedMetadata,
          title: `${pv.title} — PV généré`,
          reference,
          document_subcategory: "pv_reunion",
          comments: `PV final généré automatiquement depuis un texte digitalisé. Classement : ${classification}.`,
          file_url: storagePath,
        },
        ...(originalDocumentId && originalStoragePath
          ? [{
              id: originalDocumentId,
              ...sharedMetadata,
              title: `${pv.title} — Scan original`,
              reference: `${reference}-ORG`,
              document_subcategory: "pv_scan_original",
              comments: `Scan original associé au PV ${reference}. Fichier source : ${originalScan?.name ?? ""}.`,
              file_url: originalStoragePath,
            }]
          : []),
      ];
      const insert = await supabase.from("documents").insert(documentRows);
      if (insert.error) {
        await supabase.storage
          .from("documents")
          .remove([storagePath, originalStoragePath].filter((path): path is string => Boolean(path)));
        throw new Error(`Classement dans Documents impossible : ${insert.error.message}`);
      }
      setGenerated({ pdf, word, fileBase, documentId, original });
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Génération du PV impossible.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className="rounded-2xl border border-emerald-200 bg-white shadow-sm">
      <div className="rounded-t-2xl bg-gradient-to-r from-[#0b2748] via-[#0050a4] to-[#0b2748] px-6 py-5 text-white">
        <h2 className="flex items-center gap-2 text-xl font-black">
          <FileText className="h-5 w-5" /> Générateur de procès-verbal
        </h2>
        <p className="mt-1 text-sm font-semibold text-emerald-100">
          Modèle professionnel ALSTOM · classement automatique dans Documents → PV
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
          <label className="text-xs font-black uppercase tracking-wide text-slate-500">
            Classement
            <select value={classification} onChange={(event) => { setClassification(event.target.value); invalidate(); }} className="input mt-2 normal-case">
              {classifications.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-xs font-black uppercase tracking-wide text-slate-500">
            Entreprise émettrice
            <select value={issuerCompany} onChange={(event) => { setIssuerCompany(event.target.value); invalidate(); }} className="input mt-2 normal-case">
              {companies.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
          Texte digitalisé complet
          <textarea rows={16} value={text} onChange={(event) => { setText(event.target.value); setDateOverride(""); setObjectiveOverride(""); invalidate(); }} className="input mt-2 resize-y whitespace-pre-wrap normal-case leading-relaxed" placeholder={"Collez ici le texte complet du PV…\n\nDate : 20/08/2026\nLieu : Chantier\nObjet : Coordination des travaux\n\nParticipants :\n- Nom — Société — Fonction\n\nPoints traités :\n1. Avancement des travaux…"} />
        </label>
        <section className="rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-cyan-700 shadow-sm">
              <FileScan className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-700">Scan original du PV — facultatif</h3>
              <p className="mt-1 text-xs text-slate-500">Il sera classé à côté du PV généré dans Documents → PV. Les images sont converties automatiquement en PDF.</p>
            </div>
          </div>
          <div className="relative mt-4 rounded-xl border-2 border-dashed border-cyan-200 bg-white">
            <label className="flex cursor-pointer items-center justify-center gap-3 px-4 py-5 pr-12 text-sm font-black text-slate-700">
              <Upload className="h-5 w-5 text-cyan-700" />
              {originalScan ? originalScan.name : "Choisir le scan original (PDF, JPG ou PNG)"}
              <input type="file" hidden accept="application/pdf,image/jpeg,image/png" onChange={(event) => chooseOriginalScan(event.target.files?.[0] ?? null)} />
            </label>
            {originalScan ? (
              <button type="button" onClick={() => chooseOriginalScan(null)} className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Retirer le scan original">
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </section>
        <div className="grid gap-4 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 md:grid-cols-[190px_1fr]">
          <label className="text-xs font-black uppercase tracking-wide text-slate-500">
            Date détectée
            <input type="date" value={pvDate} onChange={(event) => { setDateOverride(event.target.value); invalidate(); }} className="input mt-2 bg-white normal-case" />
          </label>
          <label className="text-xs font-black uppercase tracking-wide text-slate-500">
            Objet détecté — corrigeable
            <input value={pvObjective} onChange={(event) => { setObjectiveOverride(event.target.value); invalidate(); }} className="input mt-2 bg-white normal-case" placeholder="Objet du procès-verbal" />
          </label>
          <div className="md:col-span-2">
            <p className="text-[11px] font-black uppercase tracking-wide text-[var(--opc-blue)]">Titre généré automatiquement</p>
            <p className="mt-1 text-base font-black text-slate-800">{automaticTitle}</p>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-black uppercase tracking-wide text-slate-700">Logos du document</h3>
          <p className="mt-1 text-xs text-slate-500">Affichez ou masquez chaque logo dans le PDF et le Word.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {[
              ["ONCF", showOncfLogo, () => setShowOncfLogo((value) => !value)],
              ["ALSTOM", showAlstomLogo, () => setShowAlstomLogo((value) => !value)],
              ["AVANZIT", showAvanzitLogo, () => setShowAvanzitLogo((value) => !value)],
            ].map(([label, visible, toggle]) => (
              <button key={label as string} type="button" onClick={() => { (toggle as () => void)(); invalidate(); }} className={`flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-black ${visible ? "border-blue-300 bg-white text-[var(--opc-blue)]" : "border-slate-200 bg-slate-100 text-slate-500"}`}>
                {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />} Logo {label as string}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-700"><PenLine className="h-4 w-4 text-[var(--opc-red)]" /> Visa et signatures</h3>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {signatories.map((signatory, index) => (
              <div key={signatory.company} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-center text-sm font-black text-[var(--opc-blue)]">{signatory.company}</p>
                <input value={signatory.name} onChange={(event) => { setSignatories((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item)); invalidate(); }} className="input mt-3 bg-white" placeholder="Nom et prénom" />
                <input value={signatory.role} onChange={(event) => { setSignatories((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, role: event.target.value } : item)); invalidate(); }} className="input mt-2 bg-white" placeholder="Fonction" />
                <div className="mt-3 grid h-16 place-items-center rounded-lg border border-dashed border-slate-300 bg-white text-xs font-bold text-slate-400">Espace signature</div>
              </div>
            ))}
          </div>
        </section>
        {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p> : null}
        {!generated ? (
          <button type="button" disabled={generating} onClick={() => void generateAndArchive()} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white disabled:cursor-wait disabled:opacity-60">
            {generating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
            {generating ? "Génération et classement…" : "Générer et classer dans Documents → PV"}
          </button>
        ) : (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="flex items-center gap-2 text-sm font-black text-emerald-800"><Archive className="h-5 w-5" /> {generated.original ? "PV généré et scan original classés dans Documents → PV" : "PV généré et classé dans Documents → PV"}</p>
            <div className={`mt-4 grid gap-3 sm:grid-cols-2 ${generated.original ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
              <button type="button" onClick={() => downloadGeneratedFile(generated.pdf, `${generated.fileBase}.pdf`)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--opc-red)] px-4 text-sm font-black text-white"><Download className="h-4 w-4" /> Télécharger PDF</button>
              <button type="button" onClick={() => downloadGeneratedFile(generated.word, `${generated.fileBase}.docx`)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--opc-blue)] px-4 text-sm font-black text-white"><Download className="h-4 w-4" /> Télécharger Word</button>
              {generated.original ? <button type="button" onClick={() => downloadGeneratedFile(generated.original!, `${generated.fileBase}-scan-original.pdf`)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 text-sm font-black text-white"><FileScan className="h-4 w-4" /> Télécharger l’original</button> : null}
              <button type="button" onClick={onOpenPvLibrary} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 text-sm font-black text-emerald-800"><Archive className="h-4 w-4" /> Ouvrir Documents → PV</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
