"use client";

import { Loader2, Trash2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ConfirmDeleteDialogProps = {
  open: boolean;
  title: string;
  description: string;
  subject?: string;
  deleting?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDeleteDialog({
  open,
  title,
  description,
  subject,
  deleting = false,
  onOpenChange,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!deleting) onOpenChange(nextOpen);
      }}
    >
      <DialogContent showCloseButton={!deleting} className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-[var(--opc-red)]">
            <Trash2 className="h-5 w-5" />
          </div>
          <DialogTitle className="text-xl font-black text-[var(--opc-ink)]">
            {title}
          </DialogTitle>
          <DialogDescription className="leading-6">
            {description}
          </DialogDescription>
        </DialogHeader>

        {subject ? (
          <div className="rounded-xl border border-red-100 bg-red-50/60 px-4 py-3 text-sm font-bold text-slate-700">
            {subject}
          </div>
        ) : null}

        <p className="text-xs font-semibold text-[var(--opc-red)]">
          Cette action est définitive et ne peut pas être annulée.
        </p>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={deleting}
            onClick={() => onOpenChange(false)}
            className="rounded-xl border border-[var(--opc-border)] px-5 py-3 text-sm font-bold text-slate-600 disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => void onConfirm()}
            className="flex items-center justify-center gap-2 rounded-xl bg-[var(--opc-red)] px-5 py-3 text-sm font-black text-white disabled:opacity-60"
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Oui, supprimer
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
