"use client";

import { FileType2, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { convertPdfBlobToEditableWord } from "@/lib/documents/pdf-to-word";
import type { DocumentListItem } from "@/lib/documents/queries";
import { getDocumentStoragePathCandidates } from "@/lib/documents/storage";
import { createClient } from "@/lib/supabase/client";

type Props = { documents: DocumentListItem[] };
type Conversion = { source: DocumentListItem; word: DocumentListItem | null };

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
  const conversions = useMemo(() => {
    const wordByReference = new Map<string, DocumentListItem>();
    for (const item of documents) {
      if (item.document_subcategory !== "pv_word") continue;
      const reference = item.reference?.replace(/-WORD$/i, "");
      if (reference) wordByReference.set(reference, item);
    }
    return documents
      .filter(
        (item) => item.document_subcategory === "pv_reunion" && item.file_url && item.reference,
      )
      .map((source): Conversion => ({
        source,
        word: wordByReference.get(source.reference as string) ?? null,
      }))
      .filter(({ word }) =>
        !word || /Version Word fidèle créée à partir du PDF/i.test(word.comments ?? ""),
      );
  }, [documents]);

  if (!conversions.length) return null;

  async function downloadStoredFile(path: string) {
    for (const candidate of getDocumentStoragePathCandidates(path)) {
      const downloaded = await supabase.storage.from("documents").download(candidate);
      if (!downloaded.error && downloaded.data) return downloaded.data;
    }
    return null;
  }

  async function createEditableWords() {
    setRunning(true);
    setProgress(0);
    setError("");
    try {
      for (let index = 0; index < conversions.length; index += 1) {
        const { source, word: existingWord } = conversions[index];
        const pdfBlob = await downloadStoredFile(source.file_url ?? "");
        if (!pdfBlob) throw new Error(`PDF introuvable : ${source.title}`);

        const word = await convertPdfBlobToEditableWord(pdfBlob);
        const storageWord = new Blob([await word.arrayBuffer()], { type: "application/pdf" });
        const wordId = existingWord?.id ?? crypto.randomUUID();
        const storagePath = existingWord?.file_url ??
          `${source.project_id}/${wordId}/${wordFileBase(source.title)}.docx`;
        const storage = supabase.storage.from("documents");
        const uploaded = existingWord
          ? await storage.update(storagePath, storageWord, { contentType: "application/pdf", upsert: true })
          : await storage.upload(storagePath, storageWord, { contentType: "application/pdf", upsert: false });
        if (uploaded.error) throw new Error(`Archivage Word impossible : ${uploaded.error.message}`);

        const metadata = {
          comments: `Version Word éditable reconstruite à partir du texte du PDF ${source.reference}.`,
          file_url: storagePath,
        };
        if (existingWord) {
          const updated = await supabase.from("documents").update(metadata).eq("id", existingWord.id);
          if (updated.error) throw new Error(`Mise à jour Word impossible : ${updated.error.message}`);
        } else {
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
            ...metadata,
          });
          if (inserted.error) {
            await storage.remove([storagePath]);
            throw new Error(`Classement Word impossible : ${inserted.error.message}`);
          }
        }
        setProgress(index + 1);
      }
      router.refresh();
    } catch (conversionError) {
      setError(conversionError instanceof Error ? conversionError.message : "Création des Word éditables impossible.");
    } finally {
      setRunning(false);
    }
  }

  const replacing = conversions.some(({ word }) => Boolean(word));
  return <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
    <div>
      <p className="text-sm font-black text-blue-950">{conversions.length} version(s) Word à rendre éditable(s)</p>
      <p className="text-xs font-semibold text-blue-800">Le texte du PDF devient du vrai texte modifiable ; les logos restent des images.</p>
      {error ? <p className="mt-1 text-xs font-bold text-red-700">{error}</p> : null}
    </div>
    <Button type="button" onClick={() => void createEditableWords()} disabled={running}>
      {running ? <Loader2 className="size-4 animate-spin" /> : <FileType2 className="size-4" />}
      {running ? `Conversion ${progress}/${conversions.length}…` : replacing ? "Remplacer par des Word éditables" : "Créer les Word éditables"}
    </Button>
  </div>;
}
