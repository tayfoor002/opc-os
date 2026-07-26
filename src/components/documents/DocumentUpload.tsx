"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import { FileText, Upload, X } from "lucide-react";

import { uploadDocument } from "@/app/documents/actions";
import { DocumentForm } from "@/components/documents/DocumentForm";
import { Button } from "@/components/ui/button";
import type {
  DocumentEditValues,
  ProjectOption,
} from "@/lib/documents/types";

type DocumentUploadProps = {
  projects: ProjectOption[];
  onSuccess?: () => void;
};

const EMPTY_DOCUMENT: DocumentEditValues = {
  title: "",
  reference: "",
  revision: "",
  status: "Draft",
  category: "",
  company: "",
  comments: "",
  document_date: "",
  project_id: "",
  zone_id: "",
  phase_id: "",
  activity_id: "",
};

export function DocumentUpload({
  projects,
  onSuccess,
}: DocumentUploadProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (!selectedFile) {
      return;
    }
    setFile(selectedFile);
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

  async function submitDocument(formData: FormData) {
    if (!file) {
      return {
        success: false as const,
        error: "Sélectionne un fichier PDF.",
      };
    }

    formData.set("file", file);
    return uploadDocument(formData);
  }

  function handleSuccess() {
    setFile(null);
    router.refresh();
    onSuccess?.();
  }

  return (
    <DocumentForm
      initialValues={EMPTY_DOCUMENT}
      projects={projects}
      initialOptions={{ zones: [], phases: [], activities: [] }}
      onCancel={() => onSuccess?.()}
      onSuccess={handleSuccess}
      onSubmitForm={submitDocument}
      submitLabel="Créer le document"
      submittingLabel="Création…"
      canSubmit={Boolean(file)}
    >
      <div className="space-y-2">
        <p className="text-sm font-semibold">Fichier PDF</p>

        {!file ? (
          <div
            {...getRootProps()}
            className={[
              "cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition",
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/50",
            ].join(" ")}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto mb-3 size-9 text-muted-foreground" />
            <p className="font-medium">
              {isDragActive
                ? "Dépose le PDF ici…"
                : "Glisse ton PDF ici ou clique pour le sélectionner"}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border p-4">
            <FileText className="size-8 shrink-0 text-[var(--opc-blue)]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(2)} Mo
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setFile(null)}
              aria-label="Retirer le fichier"
            >
              <X className="size-4" />
            </Button>
          </div>
        )}

        {fileRejections.length > 0 ? (
          <p className="text-sm text-destructive">
            Seuls les fichiers PDF sont acceptés.
          </p>
        ) : null}
      </div>
    </DocumentForm>
  );
}
