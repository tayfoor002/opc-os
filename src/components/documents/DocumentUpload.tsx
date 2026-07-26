"use client";

import { useCallback, useState, useTransition } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Upload, X } from "lucide-react";

import { uploadDocument } from "@/app/documents/actions";
import { Button } from "@/components/ui/button";

type Project = {
  id: string;
  code: string | null;
  name: string;
};

type Props = {
  projects: Project[];
  onSuccess?: () => void;
};

export function DocumentUpload({ projects, onSuccess }: Props) {
  const router = useRouter();

  const [projectId, setProjectId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];

    if (!selectedFile) return;

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

  function handleUpload() {
    setError("");

    if (!projectId) {
      setError("Sélectionne un projet.");
      return;
    }

    if (!file) {
      setError("Sélectionne un fichier PDF.");
      return;
    }

    const formData = new FormData();
    formData.append("projectId", projectId);
    formData.append("file", file);

    startTransition(async () => {
      const result = await uploadDocument(formData);

      if (!result.success) {
        setError(result.error);
        return;
      }

      setFile(null);
      setProjectId("");

      router.refresh();
      onSuccess?.();
    });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label
          htmlFor="projectId"
          className="text-sm font-medium"
        >
          Projet
        </label>

        <select
          id="projectId"
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            setError("");
          }}
          disabled={isPending}
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        >
          <option value="">Sélectionner un projet</option>

          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.code
                ? `${project.code} — ${project.name}`
                : project.name}
            </option>
          ))}
        </select>
      </div>

      {!file ? (
        <div
          {...getRootProps()}
          className={[
            "cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition",
            isDragActive
              ? "border-primary bg-primary/5"
              : "border-border hover:bg-muted/50",
          ].join(" ")}
        >
          <input {...getInputProps()} />

          <Upload className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />

          {isDragActive ? (
            <p className="font-medium">Dépose le PDF ici…</p>
          ) : (
            <>
              <p className="font-medium">Glisse ton PDF ici</p>

              <p className="mt-2 text-sm text-muted-foreground">
                ou clique pour sélectionner un fichier
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border p-4">
          <FileText className="h-8 w-8 shrink-0" />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {file.name}
            </p>

            <p className="text-xs text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(2)} Mo
            </p>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={isPending}
            onClick={() => setFile(null)}
            aria-label="Retirer le fichier"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {fileRejections.length > 0 && (
        <p className="text-sm text-destructive">
          Seuls les fichiers PDF sont acceptés.
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleUpload}
          disabled={isPending || !file || !projectId}
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Upload en cours…
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Uploader le document
            </>
          )}
        </Button>
      </div>
    </div>
  );
}