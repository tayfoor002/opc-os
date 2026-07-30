"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, RefreshCcw } from "lucide-react";

import {
  applySynchronizedDocumentMetadata,
  findProcedureRegisterTitle,
} from "@/app/documents/actions";
import { inferDocumentMetadata } from "@/lib/documents/document-metadata";
import { getDocumentStoragePathCandidates } from "@/lib/documents/storage";
import { createClient } from "@/lib/supabase/client";

type Props = {
  documentIds: string[];
};

export function DocumentMetadataSync({ documentIds }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function synchronize() {
    setMessage("");
    startTransition(async () => {
      const supabase = createClient();
      const { data: documents, error: queryError } = await supabase
        .from("documents")
        .select("id,project_id,file_url,reference,revision,title")
        .in("id", documentIds);
      if (queryError) {
        setMessage(`Chargement impossible : ${queryError.message}`);
        return;
      }
      let scanned = 0;
      let updated = 0;
      let skipped = 0;
      let failed = 0;

      const synchronizeDocument = async (
        document: NonNullable<typeof documents>[number],
      ) => {
        if (!document.file_url) {
          return "skipped" as const;
        }
        let storedPdf: Blob | null = null;
        for (const candidate of getDocumentStoragePathCandidates(
          document.file_url,
        )) {
          const download = await supabase.storage
            .from("documents")
            .download(candidate);
          if (!download.error && download.data) {
            storedPdf = download.data;
            break;
          }
        }
        if (!storedPdf) {
          return "skipped" as const;
        }
        const inference = await inferDocumentMetadata(
          new File([storedPdf], "document.pdf", {
            type: "application/pdf",
          }),
        );
        const detectedReference = inference.values.reference?.trim();
        const revision = inference.values.revision?.trim();
        const reference =
          document.reference?.trim() || detectedReference;
        if (!reference || !revision) {
          return "skipped" as const;
        }
        const registerTitle = await findProcedureRegisterTitle(
          document.project_id,
          reference,
        );
        const title =
          registerTitle.success && registerTitle.title
            ? registerTitle.title
            : inference.values.title?.trim() || document.title;
        if (
          reference === document.reference &&
          revision === document.revision &&
          title === document.title
        ) {
          return "unchanged" as const;
        }
        const update = await applySynchronizedDocumentMetadata(document.id, {
          reference,
          revision,
          title,
        });
        return update.success ? ("updated" as const) : ("failed" as const);
      };

      for (let index = 0; index < (documents ?? []).length; index += 2) {
        const results = await Promise.all(
          (documents ?? [])
            .slice(index, index + 2)
            .map(async (document) => {
              try {
                return await synchronizeDocument(document);
              } catch {
                return "failed" as const;
              }
            }),
        );
        for (const result of results) {
          if (result !== "skipped") scanned += 1;
          if (result === "updated") updated += 1;
          if (result === "skipped") skipped += 1;
          if (result === "failed") failed += 1;
        }
      }
      setMessage(
        `${updated} document(s) corrigé(s) sur ${scanned} analysé(s)` +
          (skipped ? ` · ${skipped} ignoré(s)` : "") +
          (failed ? ` · ${failed} en erreur` : ""),
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={synchronize}
        disabled={isPending || !documentIds.length}
        className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800 transition hover:bg-blue-100 disabled:opacity-60"
      >
        {isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <RefreshCcw className="size-4" />
        )}
        {isPending ? "Analyse des PDF…" : "Synchroniser les métadonnées"}
      </button>
      {message ? (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600">
          <CheckCircle2 className="size-4 text-emerald-600" />
          {message}
        </span>
      ) : null}
    </div>
  );
}
