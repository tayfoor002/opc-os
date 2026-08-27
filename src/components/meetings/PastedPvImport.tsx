"use client";

import { ClipboardPaste, FileText, WandSparkles } from "lucide-react";
import { useState } from "react";

import { parsePastedPv } from "@/lib/meetings/pasted-pv";
import type { PvOcrResult } from "@/lib/meetings/pv-ocr";
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

export function PastedPvImport({
  zones,
  onApply,
}: {
  zones: ZoneOption[];
  onApply: (
    result: PvOcrResult,
    zoneId: string,
    classification: MeetingType,
  ) => void;
}) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [classification, setClassification] =
    useState<MeetingType>("coordination");
  const [error, setError] = useState("");

  function apply() {
    if (!text.trim()) {
      setError("Collez d’abord le texte digitalisé du PV.");
      return;
    }
    if (!zoneId) {
      setError("Sélectionnez la zone de classement du document.");
      return;
    }
    setError("");
    onApply(parsePastedPv(text, title, classification), zoneId, classification);
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-slate-50 shadow-sm">
      <div className="border-b border-emerald-100 bg-emerald-700 px-5 py-4 text-white">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15">
            <ClipboardPaste className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-black">Coller le texte digitalisé du PV</h2>
            <p className="mt-0.5 text-xs font-medium text-emerald-100">
              Gratuit · sans clé API · export au format officiel PDF et Word
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
          Titre du document
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="input mt-2 normal-case"
            placeholder="Ex. PV de coordination — Zone A"
          />
          <span className="mt-1 block text-[11px] font-medium normal-case text-slate-400">
            Ce titre deviendra automatiquement le nom du PDF et du fichier Word.
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-black uppercase tracking-wide text-slate-500">
            Zone de classement
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

        <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
          Texte complet du PV
          <textarea
            rows={12}
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="input mt-2 resize-y whitespace-pre-wrap normal-case leading-relaxed"
            placeholder={"Collez ici tout le texte obtenu depuis votre outil…\n\nDate : 20/08/2026\nLieu : Chantier\nObjet : Coordination des travaux\n\nParticipants :\n- Nom — Société — Fonction\n\nPoints traités :\n1. Avancement des travaux…"}
          />
        </label>

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={apply}
          disabled={!text.trim() || !zoneId}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <WandSparkles className="h-5 w-5" />
          Préparer le CR et les exports
        </button>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
          Le texte original est conservé intégralement. Vous pourrez le vérifier dans
          l’aperçu, le corriger, puis télécharger le PDF et le Word.
        </p>
      </div>
    </section>
  );
}
