"use client";

import { useCallback, useState, useTransition } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Upload, X } from "lucide-react";

import { attachDocumentFile } from "@/app/documents/actions";
import { Button } from "@/components/ui/button";

type DocumentFileAttachProps = {
  documentId: string;
};

export function DocumentFileAttach({
  documentId,
}: DocumentFileAttachProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (!selectedFile) {
      return;
    }
    setFile(selectedFile);
    setError("");
  }, []);

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    fileRejections,
  } = useDropzone({
    onDrop,
    multiple: false,
    maxFiles: 1,
    accept: {
      "application/pdf": [".pdf"],
    },
  });

  function uploadFile() {
    if (!file) {
      setError("Sélectionne un fichier PDF.");
      return;
    }

    const formData = new FormData();
    formData.set("file", file);
    setError("");

    startTransition(async () => {
      const result = await attachDocumentFile(documentId, formData);
      if (!result.success) {
        setError(result.error);
        return;
      }

      setFile(null);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto mt-6 w-full max-w-xl text-left">
      {!file ? (
        <div
          {...getRootProps()}
          className={[
            "cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition",
            isDragActive
              ? "border-[var(--opc-blue)] bg-[var(--opc-blue-soft)]"
              : "border-[var(--opc-border)] bg-white hover:bg-slate-50",
          ].join(" ")}
        >
          <input {...getInputProps()} />
          <Upload className="mx-auto mb-3 size-8 text-[var(--opc-blue)]" />
          <p className="text-sm font-bold">
            {isDragActive
              ? "Dépose le PDF ici…"
              : "Ajouter le fichier PDF"}
          </p>
          <p className="mt-1 text-xs text-[var(--opc-muted)]">
            Glisse un PDF ou clique pour le sélectionner.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border bg-white p-4">
          <FileText className="size-8 shrink-0 text-[var(--opc-blue)]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{file.name}</p>
            <p className="text-xs text-[var(--opc-muted)]">
              {(file.size / 1024 / 1024).toFixed(2)} Mo
            </p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={isPending}
            onClick={() => setFile(null)}
            aria-label="Retirer le fichier"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      {fileRejections.length > 0 ? (
        <p className="mt-2 text-sm text-destructive">
          Seuls les fichiers PDF sont acceptés.
        </p>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="mt-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
        >
          {error}
        </div>
      ) : null}

      <div className="mt-4 flex justify-center">
        <Button
          type="button"
          onClick={uploadFile}
          disabled={!file || isPending}
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          {isPending ? "Envoi en cours…" : "Enregistrer le PDF"}
        </Button>
      </div>
    </div>
  );
}
