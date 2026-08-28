"use client";

import { FileType2, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { convertPdfBlobToWord } from "@/lib/documents/pdf-to-word";
import type { DocumentListItem } from "@/lib/documents/queries";
import { getDocumentStoragePathCandidates } from "@/lib/documents/storage";
import { createClient } from "@/lib/supabase/client";

type Props = {
  documents: DocumentListItem[];
};

function wordFileBase(title: string) {
  return title
    .replace(/\s+—\s+PV généré$/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "proces-verbal";
}

export function PvWordBackfill({ documents }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const existingWordReferences = useMemo(
    () =>
      new Set(
        documents
          .filter((item) => item.document_subcategory === "pv_word")
          .map((item) => item.reference?.replace(/-WORD$/i, ""))
          .filter((reference): reference is string => Boolean(reference)),
      ),
    [documents],
  );
  const missing = useMemo(
    () =>
      documents.filter(
        (item) =>
          item.document_subcategory === "pv_reunion" &&
          Boolean(item.file_url) &&
          Boolean(item.reference) &&
          !existingWordReferences.has(item.reference as string),
      ),
    [documents, existingWordReferences],
  );

  if (!missing.length) return null;

  async function createMissingWords() {
    setRunning(true);
    setProgress(0);
    setError("");

    try {
      for (let index = 0; index < missing.length; index += 1) {
        const source = missing[index];
        let pdfBlob: Blob | null = null;
        for (const candidate of getDocumentStoragePathCandidates(source.file_url ?? "")) {
          const downloaded = await supabase.storage.from("documents").download(candidate);
          if (!downloaded.error && downloaded.data) {
            pdfBlob = downloaded.data;
            break;
          }
        }
        if (!pdfBlob) throw new Error(`PDF introuvable : ${source.title}`);

        const word = await convertPdfBlobToWord(pdfBlob);
        const wordId = crypto.randomUUID();
        const storagePath = `${source.project_id}/${wordId}/${wordFileBase(source.title)}.docx`;
        const uploaded = await supabase.storage.from("documents").upload(storagePath, word, {
          contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          upsert: false,
        });
        if (uploaded.error) throw new Error(`Archivage Word impossible : ${uploaded.error.message}`);

        const inserted = await supabase.from("documents").insert({
          id: wordId,
          project_id: source.project_id,
          zone_id: source.zone_id,
          title: source.title.replace(/\s+—\s+PV généré$/i, "") + " — Word",
          reference: `${source.reference}-WORD`,
          revision: source.revision,
          status: source.status,
          category: source.category,
          document_type: "pv",
          document_subcategory: "pv_word",
          execution_status: "not_applicable",
          company: source.company,
          document_date: source.document_date,
          comments: `Version Word fidèle créée à partir du PDF ${source.reference}.`,
          file_url: storagePath,
        });
        if (inserted.error) {
          await supabase.storage.from("documents").remove([storagePath]);
          throw new Error(`Classement Word impossible : ${inserted.error.message}`);
        }
        setProgress(index + 1);
      }
      router.refresh();
    } catch (conversionError) {
      setError(
        conversionError instanceof Error
          ? conversionError.message
          : "Création des versions Word impossible.",
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
      <div>
        <p className="text-sm font-black text-blue-950">
          {missing.length} PV ancien(s) sans version Word
        </p>
        <p className="text-xs font-semibold text-blue-800">
          Crée une copie Word fidèle de chaque PDF et la classe sur la même ligne.
        </p>
        {error ? <p className="mt-1 text-xs font-bold text-red-700">{error}</p> : null}
      </div>
      <Button type="button" onClick={() => void createMissingWords()} disabled={running}>
        {running ? <Loader2 className="size-4 animate-spin" /> : <FileType2 className="size-4" />}
        {running ? `Création ${progress}/${missing.length}…` : "Créer les Word manquants"}
      </Button>
    </div>
  );
}
