"use client";

import { useState } from "react";

import { DocumentToolbar } from "./DocumentToolbar";
import { DocumentTable } from "./DocumentTable";
import { DocumentUpload } from "./DocumentUpload";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DocumentListItem } from "@/lib/documents/queries";

type Project = {
  id: string;
  code: string | null;
  name: string;
};

type Props = {
  documents: DocumentListItem[];
  projects: Project[];
};

export function DocumentsView({ documents, projects }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <DocumentToolbar onCreate={() => setOpen(true)} />

      <DocumentTable documents={documents} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Nouveau document</DialogTitle>
          </DialogHeader>

          <DocumentUpload
            projects={projects}
            onSuccess={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
