"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FileScan,
  Loader2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useState } from "react";

import {
  analyzeHandwrittenPv,
  type PvOcrResult,
} from "@/lib/meetings/pv-ocr";
import type { MeetingType } from "@/types/meeting";

type ZoneOption = { id: string; name: string; code: string };

const classificationLabels: Record<MeetingType, string> = {
  coordination: "Coordination",
  site: "Chantier",
  technical: "Technique",
  safety: "Sécurité / EHS",
  client: "Client",
  other: "Autre",
};

export function HandwrittenPvImport({
  zones,
  onApply,
}: {
  zones: ZoneOption[];
  onApply: (
    result: PvOcrResult,
    sourceFile: File,
    zoneId: string,
    classification: MeetingType,
  ) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [zoneId, setZoneId] = useState("");
  const [classification, setClassification] =
    useState<MeetingType>("coordination");
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<PvOcrResult | null>(null);
  const [error, setError] = useState("");

  function chooseFile(next: File | null) {
    setError("");
    setResult(null);
    if (!next) return setFile(null);
    const accepted = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ].includes(next.type);
    if (!accepted) {
      setError("Format accepté : PDF, JPG, PNG ou WebP.");
      return;
    }
    if (next.size > 25 * 1024 * 1024) {
      setError("Le fichier doit faire au maximum 25 Mo.");
      return;
    }
    setFile(next);
  }

  async function analyze() {
    if (!file || !zoneId) {
      setError("Ajoutez le PV et sélectionnez sa zone chantier.");
      return;
    }
    const zone = zones.find((item) => item.id === zoneId);
    if (!zone) return;
    setAnalyzing(true);
    setError("");
    setResult(null);
    try {
      setResult(
        await analyzeHandwrittenPv(
          file,
          zone.name,
          classification,
          setProgress,
        ),
      );
      setProgress("Analyse terminée — vérifiez les passages signalés.");
    } catch (analysisError) {
      setError(
        analysisError instanceof Error
          ? analysisError.message
          : "Analyse du PV impossible.",
      );
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-slate-50 shadow-sm">
      <div className="border-b border-blue-100 bg-[var(--opc-blue)] px-5 py-4 text-white">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15">
            <FileScan className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-black">Importer un PV manuscrit</h2>
            <p className="mt-0.5 text-xs font-medium text-blue-100">
              Scan flou accepté · lecture renforcée · classement automatique
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            chooseFile(event.dataTransfer.files[0] ?? null);
          }}
          className="relative rounded-2xl border-2 border-dashed border-blue-200 bg-white transition hover:border-[var(--opc-blue)] hover:bg-blue-50"
        >
          <label className="flex w-full cursor-pointer items-center justify-center gap-3 px-4 py-6 pr-12 text-left">
            <Upload className="h-6 w-6 shrink-0 text-[var(--opc-blue)]" />
            <span>
              <span className="block text-sm font-black text-slate-700">
                {file ? file.name : "Déposer ou choisir le PV"}
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                PDF ou image, 25 Mo maximum
                {file ? ` · ${(file.size / 1024 / 1024).toFixed(1)} Mo` : ""}
              </span>
            </span>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              hidden
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            />
          </label>
          {file ? (
            <button
              type="button"
              onClick={() => chooseFile(null)}
              className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100"
              aria-label="Retirer le fichier"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-black uppercase tracking-wide text-slate-500">
            Zone chantier obligatoire
            <select
              value={zoneId}
              onChange={(event) => setZoneId(event.target.value)}
              className="input mt-2 normal-case"
            >
              <option value="">Sélectionner la zone…</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.code ? `${zone.code} — ` : ""}{zone.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-black uppercase tracking-wide text-slate-500">
            Classement du PV
            <select
              value={classification}
              onChange={(event) =>
                setClassification(event.target.value as MeetingType)
              }
              className="input mt-2 normal-case"
            >
              {Object.entries(classificationLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          disabled={!file || !zoneId || analyzing}
          onClick={() => void analyze()}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--opc-red)] px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {analyzing ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Sparkles className="h-5 w-5" />
          )}
          {analyzing ? "Analyse haute précision en cours…" : "Lire et structurer le PV"}
        </button>

        {progress ? (
          <p className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
            {progress}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
            {error}
          </p>
        ) : null}

        {result ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <div>
                  <p className="text-sm font-black text-slate-800">
                    Transcription prête à vérifier
                  </p>
                  <p className="text-xs text-slate-500">
                    Fiabilité estimée : {Math.round(result.confidence * 100)} % · {result.page_count} page(s)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onApply(result, file!, zoneId, classification)}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white"
              >
                Appliquer au CR
              </button>
            </div>
            {result.warnings.length || result.uncertain_fragments.length ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="flex items-center gap-2 text-xs font-black text-amber-800">
                  <AlertTriangle className="h-4 w-4" /> Passages à contrôler sur le scan
                </p>
                <ul className="mt-2 space-y-1 text-xs text-amber-800">
                  {[...result.warnings, ...result.uncertain_fragments].map((warning, index) => (
                    <li key={`${warning}-${index}`}>• {warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
