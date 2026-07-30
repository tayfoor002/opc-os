"use client";

import { useCallback, useState, useTransition } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FileSearch,
  FileText,
  Loader2,
  Save,
  Upload,
  X,
} from "lucide-react";

import {
  findProcedureRegisterTitle,
  loadDocumentRelationOptions,
  uploadDocument,
} from "@/app/documents/actions";
import { DocumentForm } from "@/components/documents/DocumentForm";
import { Button } from "@/components/ui/button";
import { inferDocumentMetadata } from "@/lib/documents/document-metadata";
import type {
  DocumentEditValues,
  DocumentRelationOptions,
  ProjectOption,
} from "@/lib/documents/types";

type DocumentUploadProps = {
  projects: ProjectOption[];
  onSuccess?: () => void;
};

type UploadItem = {
  id: string;
  file: File;
  values: DocumentEditValues;
  options: DocumentRelationOptions;
  formVersion: number;
  state: "analyzing" | "ready" | "uploading" | "error";
  detectedFields: string[];
  warning: string | null;
  error: string | null;
};

const EMPTY_OPTIONS: DocumentRelationOptions = {
  zones: [],
  phases: [],
  activities: [],
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

function normalize(value: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findDefaultProject(projects: ProjectOption[]) {
  return (
    projects.find(
      (project) =>
        normalize(project.code) === "pdd" ||
        normalize(project.name) === "pdd" ||
        normalize(`${project.code ?? ""} ${project.name}`).includes("pdd"),
    ) ??
    (projects.length === 1 ? projects[0] : null)
  );
}

async function getDefaultContext(projects: ProjectOption[]) {
  const project = findDefaultProject(projects);
  if (!project) {
    return {
      values: EMPTY_DOCUMENT,
      options: EMPTY_OPTIONS,
    };
  }

  const result = await loadDocumentRelationOptions(project.id);
  if (!result.success) {
    return {
      values: { ...EMPTY_DOCUMENT, project_id: project.id },
      options: EMPTY_OPTIONS,
    };
  }

  const zone =
    result.options.zones.find((item) =>
      ["zone casa", "casa"].includes(normalize(item.name)),
    ) ??
    result.options.zones.find((item) =>
      normalize(`${item.code ?? ""} ${item.name}`).includes("casa"),
    ) ??
    null;
  const phasesForZone = zone
    ? result.options.phases.filter((phase) => phase.zone_id === zone.id)
    : result.options.phases;
  const phase =
    phasesForZone.find((item) =>
      ["phase 1", "p1"].includes(normalize(item.name)),
    ) ??
    phasesForZone.find((item) =>
      normalize(`${item.code ?? ""} ${item.name}`).includes("phase 1"),
    ) ??
    null;

  return {
    values: {
      ...EMPTY_DOCUMENT,
      project_id: project.id,
      zone_id: zone?.id ?? "",
      phase_id: phase?.id ?? "",
    },
    options: result.options,
  };
}

export function DocumentUpload({
  projects,
  onSuccess,
}: DocumentUploadProps) {
  const router = useRouter();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!acceptedFiles.length) return;
      setBatchError(null);
      const context = await getDefaultContext(projects);
      const newItems = acceptedFiles.map<UploadItem>((file) => ({
        id: crypto.randomUUID(),
        file,
        values: { ...context.values },
        options: context.options,
        formVersion: 0,
        state: "analyzing",
        detectedFields: [],
        warning: null,
        error: null,
      }));
      setItems((current) => [...current, ...newItems]);

      await Promise.all(
        newItems.map(async (item) => {
          const inference = await inferDocumentMetadata(item.file);
          if (
            !inference.titleDetectedFromCover &&
            context.values.project_id &&
            inference.values.reference
          ) {
            const registerMatch = await findProcedureRegisterTitle(
              context.values.project_id,
              inference.values.reference,
            );
            if (registerMatch.success && registerMatch.title) {
              inference.values.title = registerMatch.title;
              inference.detectedFields = [
                ...new Set([...inference.detectedFields, "titre"]),
              ];
              inference.warning = inference.warning
                ? `${inference.warning} Le titre a été confirmé dans le tableau de suivi des procédures.`
                : "Le titre a été confirmé depuis la référence exacte du tableau de suivi des procédures.";
            }
          }
          setItems((current) =>
            current.map((currentItem) =>
              currentItem.id === item.id
                ? {
                    ...currentItem,
                    values: {
                      ...currentItem.values,
                      ...inference.values,
                      reference: (inference.values.reference ?? "").replace(
                        /\s+/g,
                        "",
                      ),
                    },
                    formVersion: currentItem.formVersion + 1,
                    state: "ready",
                    detectedFields: inference.detectedFields,
                    warning: inference.warning,
                  }
                : currentItem,
            ),
          );
        }),
      );
    },
    [projects],
  );

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    fileRejections,
  } = useDropzone({
    onDrop,
    multiple: true,
    maxFiles: 20,
    accept: {
      "application/pdf": [".pdf"],
    },
  });

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
    setBatchError(null);
  }

  function updateItemValues(id: string, values: DocumentEditValues) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, values } : item)),
    );
  }

  function submitAll() {
    const readyItems = items.filter(
      (item) => item.state === "ready" || item.state === "error",
    );
    if (!readyItems.length || items.some((item) => item.state === "analyzing")) {
      return;
    }

    setBatchError(null);
    setItems((current) =>
      current.map((item) =>
        readyItems.some((ready) => ready.id === item.id)
          ? { ...item, state: "uploading", error: null }
          : item,
      ),
    );

    startSaving(async () => {
      const results: Array<{
        id: string;
        result: Awaited<ReturnType<typeof uploadDocument>>;
      }> = [];
      const orderedItems = readyItems.slice().sort((left, right) => {
        const referenceOrder = left.values.reference.localeCompare(
          right.values.reference,
          "fr",
        );
        if (referenceOrder) {
          return referenceOrder;
        }
        return left.values.revision.localeCompare(
          right.values.revision,
          "fr",
          { numeric: true },
        );
      });

      for (const item of orderedItems) {
        const formData = new FormData();
        Object.entries(item.values).forEach(([key, value]) => {
          formData.set(key, value);
        });
        formData.set("file", item.file);
        results.push({
          id: item.id,
          result: await uploadDocument(formData),
        });
      }

      const successfulIds = new Set(
        results
          .filter(({ result }) => result.success)
          .map(({ id }) => id),
      );
      const failed = results.filter(({ result }) => !result.success);
      setItems((current) =>
        current
          .filter((item) => !successfulIds.has(item.id))
          .map((item) => {
            const failure = failed.find(({ id }) => id === item.id);
            return failure && !failure.result.success
              ? {
                  ...item,
                  state: "error" as const,
                  error: failure.result.error,
                }
              : item;
          }),
      );
      router.refresh();

      if (!failed.length) {
        onSuccess?.();
        return;
      }
      setBatchError(
        `${successfulIds.size} document(s) créé(s), ${failed.length} en échec. Les fichiers en erreur restent affichés pour correction.`,
      );
    });
  }

  const analyzingCount = items.filter(
    (item) => item.state === "analyzing",
  ).length;

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={[
          "cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition",
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-border hover:bg-muted/50",
        ].join(" ")}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto mb-2 size-8 text-muted-foreground" />
        <p className="font-bold">
          {isDragActive
            ? "Dépose les PDF ici…"
            : "Glisse plusieurs PDF ici ou clique pour les sélectionner"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Jusqu’à 20 fichiers. Chaque PDF garde son propre titre, sa référence
          et sa révision.
        </p>
      </div>

      {fileRejections.length > 0 ? (
        <p className="text-sm font-semibold text-destructive">
          Certains fichiers ont été refusés : seuls les PDF sont acceptés,
          avec un maximum de 20 fichiers.
        </p>
      ) : null}

      {items.length ? (
        <div className="rounded-2xl border bg-slate-50 p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
            <div>
              <h3 className="font-black text-slate-950">
                {items.length} document(s) dans le lot
              </h3>
              <p className="text-xs text-slate-500">
                Ouvre chaque ligne pour vérifier ou modifier ses informations.
              </p>
            </div>
            {analyzingCount ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1.5 text-xs font-black text-blue-800">
                <Loader2 className="size-3.5 animate-spin" />
                Analyse de {analyzingCount} fichier(s)
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-black text-emerald-800">
                <CheckCircle2 className="size-3.5" />
                Analyse terminée
              </span>
            )}
          </div>

          <div className="max-h-[62vh] space-y-3 overflow-y-auto pr-1">
            {items.map((item, index) => (
              <details
                key={item.id}
                {...(items.length === 1 || item.error ? { open: true } : {})}
                className="group rounded-xl border bg-white"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
                  {item.state === "analyzing" ||
                  item.state === "uploading" ? (
                    <Loader2 className="size-5 shrink-0 animate-spin text-blue-600" />
                  ) : item.error ? (
                    <AlertTriangle className="size-5 shrink-0 text-red-600" />
                  ) : (
                    <FileText className="size-5 shrink-0 text-[var(--opc-blue)]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-slate-900">
                      {item.values.reference || `Document ${index + 1}`}
                      {item.values.title ? ` — ${item.values.title}` : ""}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {item.file.name}
                      {item.values.revision
                        ? ` · Révision ${item.values.revision}`
                        : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={(event) => {
                      event.preventDefault();
                      removeItem(item.id);
                    }}
                    aria-label={`Retirer ${item.file.name}`}
                    disabled={isSaving}
                  >
                    <X className="size-4" />
                  </Button>
                  <ChevronDown className="size-4 text-slate-400 transition group-open:rotate-180" />
                </summary>

                <div className="border-t p-4">
                  {item.detectedFields.length ? (
                    <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-950">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                      <p>
                        <strong>Détecté automatiquement :</strong>{" "}
                        {item.detectedFields.join(", ")}.
                      </p>
                    </div>
                  ) : item.state !== "analyzing" ? (
                    <div className="mb-4 flex items-center gap-3 rounded-xl border bg-slate-50 px-4 py-3 text-xs text-slate-700">
                      <FileSearch className="size-4 shrink-0" />
                      Aucun champ fiable détecté automatiquement.
                    </div>
                  ) : null}

                  {item.warning ? (
                    <p className="mb-4 text-xs font-semibold text-amber-700">
                      {item.warning}
                    </p>
                  ) : null}
                  {item.error ? (
                    <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-xs font-bold text-red-800">
                      {item.error}
                    </p>
                  ) : null}

                  <DocumentForm
                    key={`${item.id}-${item.formVersion}`}
                    initialValues={item.values}
                    projects={projects}
                    initialOptions={item.options}
                    onCancel={() => undefined}
                    onSuccess={() => undefined}
                    onSubmitForm={async () => ({
                      success: false,
                      error: "Utilise le bouton de création du lot.",
                    })}
                    hideActions
                    onValuesChange={(values) =>
                      updateItemValues(item.id, values)
                    }
                  />
                </div>
              </details>
            ))}
          </div>
        </div>
      ) : null}

      {batchError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {batchError}
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => onSuccess?.()}
          disabled={isSaving}
        >
          Annuler
        </Button>
        <Button
          type="button"
          onClick={submitAll}
          disabled={
            isSaving ||
            !items.length ||
            items.some(
              (item) =>
                item.state === "analyzing" || item.state === "uploading",
            )
          }
        >
          {isSaving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {isSaving
            ? "Création du lot…"
            : `Créer ${items.length || ""} document(s)`}
        </Button>
      </div>
    </div>
  );
}
