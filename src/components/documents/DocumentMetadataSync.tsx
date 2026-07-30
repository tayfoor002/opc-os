"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, RefreshCcw } from "lucide-react";

import { synchronizeExistingDocumentMetadata } from "@/app/documents/actions";

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
      let scanned = 0;
      let updated = 0;
      let skipped = 0;
      let failed = 0;

      for (let index = 0; index < documentIds.length; index += 3) {
        const results = await Promise.all(
          documentIds
            .slice(index, index + 3)
            .map((documentId) =>
              synchronizeExistingDocumentMetadata(documentId),
            ),
        );
        for (const result of results) {
          if (!result.success) {
            failed += 1;
            continue;
          }
          if (result.scanned) scanned += 1;
          if (result.updated) updated += 1;
          if (result.skipped) skipped += 1;
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
