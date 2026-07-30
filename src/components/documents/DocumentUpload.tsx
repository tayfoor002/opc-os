"use client";

import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FileSearch,
  FileText,
  Loader2,
  Upload,
  X,
} from "lucide-react";

import { uploadDocument } from "@/app/documents/actions";
import { DocumentForm } from "@/components/documents/DocumentForm";
import { Button } from "@/components/ui/button";
import { inferDocumentMetadata } from "@/lib/documents/document-metadata";
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
  document_type: "other",
  document_subcategory: "",
  execution_status: "not_applicable",
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
  const analysisIdRef = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [initialValues, setInitialValues] = useState(EMPTY_DOCUMENT);
  const [analysisVersion, setAnalysisVersion] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detectedFields, setDetectedFields] = useState<string[]>([]);
  const [analysisWarning, setAnalysisWarning] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (!selectedFile) {
      return;
    }
    setFile(selectedFile);
    const analysisId = analysisIdRef.current + 1;
    analysisIdRef.current = analysisId;
    setIsAnalyzing(true);
    setDetectedFields([]);
    setAnalysisWarning(null);

    const inference = await inferDocumentMetadata(selectedFile);
    if (analysisIdRef.current !== analysisId) return;
    setInitialValues((current) => ({
      ...EMPTY_DOCUMENT,
      project_id: current.project_id,
      ...inference.values,
    }));
    setDetectedFields(inference.detectedFields);
    setAnalysisWarning(inference.warning);
    setAnalysisVersion((current) => current + 1);
    setIsAnalyzing(false);
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
    analysisIdRef.current += 1;
    setFile(null);
    setInitialValues(EMPTY_DOCUMENT);
    setDetectedFields([]);
    setAnalysisWarning(null);
    router.refresh();
    onSuccess?.();
  }

  function removeFile() {
    analysisIdRef.current += 1;
    setFile(null);
    setInitialValues(EMPTY_DOCUMENT);
    setDetectedFields([]);
    setAnalysisWarning(null);
    setIsAnalyzing(false);
    setAnalysisVersion((current) => current + 1);
  }

  return (
    <DocumentForm
      key={`${file?.name ?? "empty"}-${analysisVersion}`}
      initialValues={initialValues}
      projects={projects}
      initialOptions={{ zones: [], phases: [], activities: [] }}
      onCancel={() => onSuccess?.()}
      onSuccess={handleSuccess}
      onSubmitForm={submitDocument}
      submitLabel="Créer le document"
      submittingLabel="Création…"
      canSubmit={Boolean(file) && !isAnalyzing}
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
              onClick={removeFile}
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

        {isAnalyzing ? (
          <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900">
            <Loader2 className="size-5 shrink-0 animate-spin" />
            Analyse du PDF et préremplissage des informations…
          </div>
        ) : detectedFields.length ? (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-black">Informations détectées automatiquement</p>
              <p className="mt-1">
                {detectedFields.join(", ")}. Vérifie uniquement les champs
                ambigus avant de créer le document.
              </p>
            </div>
          </div>
        ) : file ? (
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <FileSearch className="size-5 shrink-0" />
            Aucun champ fiable n’a été détecté automatiquement.
          </div>
        ) : null}

        {analysisWarning ? (
          <p className="text-xs font-semibold text-amber-700">
            {analysisWarning}
          </p>
        ) : null}
      </div>
    </DocumentForm>
  );
}
