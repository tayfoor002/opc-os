"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Download,
  FilePenLine,
  Loader2,
  Trash2,
} from "lucide-react";

import {
  deleteDocument,
  updateDocument,
} from "@/app/documents/actions";
import { DocumentForm } from "@/components/documents/DocumentForm";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type {
  DocumentEditValues,
  DocumentRelationOptions,
  ProjectOption,
} from "@/lib/documents/types";

type DocumentDetailsActionsProps = {
  documentId: string;
  title: string;
  downloadUrl: string | null;
  initialValues: DocumentEditValues;
  projects: ProjectOption[];
  initialOptions: DocumentRelationOptions;
};

export function DocumentDetailsActions({
  documentId,
  title,
  downloadUrl,
  initialValues,
  projects,
  initialOptions,
}: DocumentDetailsActionsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editOpen, setEditOpen] = useState(searchParams.get("edit") === "1");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, startDeleting] = useTransition();

  function handleUpdated() {
    setEditOpen(false);
    router.refresh();
  }

  function handleDelete() {
    setDeleteError("");
    startDeleting(async () => {
      const result = await deleteDocument(documentId);
      if (!result.success) {
        setDeleteError(result.error);
        return;
      }
      router.push("/documents");
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {downloadUrl ? (
          <a
            href={downloadUrl}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <Download className="size-4" />
            Télécharger
          </a>
        ) : (
          <Button type="button" variant="outline" disabled>
            <Download className="size-4" />
            Télécharger
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          onClick={() => setEditOpen(true)}
        >
          <FilePenLine className="size-4" />
          Modifier
        </Button>

        <Button
          type="button"
          variant="destructive"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="size-4" />
          Supprimer
        </Button>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Modifier le document</DialogTitle>
            <DialogDescription>
              Complète les métadonnées et les rattachements du document.
            </DialogDescription>
          </DialogHeader>
          <DocumentForm
            initialValues={initialValues}
            projects={projects}
            initialOptions={initialOptions}
            onCancel={() => setEditOpen(false)}
            onSuccess={handleUpdated}
            onSubmitForm={(formData) =>
              updateDocument(documentId, formData)
            }
          />
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le document ?</DialogTitle>
            <DialogDescription>
              Le fichier « {title} » sera supprimé du Storage privé, puis sa
              ligne sera supprimée de la base de données. Cette action est
              irréversible.
            </DialogDescription>
          </DialogHeader>

          {deleteError ? (
            <div
              role="alert"
              className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
            >
              {deleteError}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={isDeleting}
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Supprimer définitivement
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
