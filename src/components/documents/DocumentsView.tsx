"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  FileText,
  FileType2,
  FileSpreadsheet,
  FolderOpen,
  Loader2,
  Search,
  Trash2,
} from "lucide-react";

import { deleteDocuments } from "@/app/documents/actions";
import { Button } from "@/components/ui/button";

import { DocumentToolbar } from "./DocumentToolbar";
import { DocumentTable } from "./DocumentTable";
import { DocumentUpload } from "./DocumentUpload";
import { DocumentMetadataSync } from "./DocumentMetadataSync";
import { ProcedureRegister } from "./ProcedureRegister";
import { DocumentsPvGenerator } from "./DocumentsPvGenerator";
import { PvWordBackfill } from "./PvWordBackfill";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DocumentListItem } from "@/lib/documents/queries";
import { getDocumentStoragePathCandidates } from "@/lib/documents/storage";
import { createClient } from "@/lib/supabase/client";

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
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isDeleting, startDeleting] = useTransition();
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadError, setDownloadError] = useState("");
  const [view, setView] = useState<"library" | "pv-generator" | "procedure-register">("library");
  const [typeFilter, setTypeFilter] = useState("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [query, setQuery] = useState("");

  const filteredDocuments = useMemo(
    () =>
      documents.filter((document) => {
        const matchesType =
          typeFilter === "all" || document.document_type === typeFilter;
        const matchesSubcategory =
          subcategoryFilter === "all" ||
          document.document_subcategory === subcategoryFilter;
        const normalizedQuery = query.trim().toLowerCase();
        const matchesQuery =
          !normalizedQuery ||
          `${document.reference ?? ""} ${document.title} ${
            document.revision ?? ""
          }`
            .toLowerCase()
            .includes(normalizedQuery);
        return matchesType && matchesSubcategory && matchesQuery;
      }),
    [documents, query, subcategoryFilter, typeFilter],
  );
  const visibleWordIds = useMemo(
    () =>
      filteredDocuments
        .filter((document) => document.document_subcategory === "pv_word")
        .map((document) => document.id),
    [filteredDocuments],
  );
  const visiblePvPdfIds = useMemo(
    () =>
      filteredDocuments
        .filter((document) => document.document_subcategory === "pv_reunion")
        .map((document) => document.id),
    [filteredDocuments],
  );
  const selectedDocuments = useMemo(
    () => documents.filter((document) => selectedIds.has(document.id)),
    [documents, selectedIds],
  );

  async function downloadSelectedDocuments() {
    if (!selectedDocuments.length) return;
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadError("");
    try {
      const JSZip = (await import("jszip")).default;
      const archive = new JSZip();
      const usedNames = new Set<string>();

      for (let index = 0; index < selectedDocuments.length; index += 1) {
        const document = selectedDocuments[index];
        if (!document.file_url) throw new Error(`Aucun fichier associé à ${document.title}.`);
        let storedFile: Blob | null = null;
        let storedPath = "";
        for (const candidate of getDocumentStoragePathCandidates(document.file_url)) {
          const result = await supabase.storage.from("documents").download(candidate);
          if (!result.error && result.data) {
            storedFile = result.data;
            storedPath = candidate;
            break;
          }
        }
        if (!storedFile) throw new Error(`Fichier introuvable : ${document.title}`);

        const encodedName = storedPath.split("?")[0].split("/").at(-1);
        let fileName = encodedName ? decodeURIComponent(encodedName) : `${document.title}.pdf`;
        if (usedNames.has(fileName)) {
          const extensionIndex = fileName.lastIndexOf(".");
          const base = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
          const extension = extensionIndex > 0 ? fileName.slice(extensionIndex) : "";
          fileName = `${base}-${index + 1}${extension}`;
        }
        usedNames.add(fileName);
        archive.file(fileName, storedFile);
        setDownloadProgress(index + 1);
      }

      const zip = await archive.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      const onlyWord = selectedDocuments.every(
        (document) => document.document_subcategory === "pv_word",
      );
      const onlyPdf = selectedDocuments.every(
        (document) => document.document_subcategory === "pv_reunion",
      );
      const format = onlyWord ? "word" : onlyPdf ? "pdf" : "documents";
      const url = URL.createObjectURL(zip);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `opc-os-pv-${format}-${new Date().toISOString().slice(0, 10)}.zip`;
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadFailure) {
      setDownloadError(
        downloadFailure instanceof Error
          ? downloadFailure.message
          : "Téléchargement multiple impossible.",
      );
    } finally {
      setIsDownloading(false);
    }
  }

  function toggleDocument(documentIds: string[]) {
    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = documentIds.every((documentId) => next.has(documentId));
      for (const documentId of documentIds) {
        if (allSelected) next.delete(documentId);
        else next.add(documentId);
      }
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      const visibleIds = filteredDocuments.map((document) => document.id);
      const allVisibleSelected =
        visibleIds.length > 0 && visibleIds.every((id) => next.has(id));
      for (const id of visibleIds) {
        if (allVisibleSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function handleMultipleDelete() {
    const ids = pendingDeleteIds;
    if (!ids.length) return;
    setDeleteError("");
    startDeleting(async () => {
      const result = await deleteDocuments(ids);
      if (!result.success) {
        setDeleteError(result.error);
        return;
      }
      setSelectedIds((current) => {
        const next = new Set(current);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      setPendingDeleteIds([]);
      setDeleteOpen(false);
      router.refresh();
    });
  }

  function requestDelete(documentIds: string[]) {
    setDeleteError("");
    setPendingDeleteIds(documentIds);
    setDeleteOpen(true);
  }

  return (
    <>
      <DocumentToolbar onCreate={() => setOpen(true)} />

      <div className="mb-5 inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setView("pv-generator")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black ${
            view === "pv-generator"
              ? "bg-emerald-700 text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <FileText className="h-4 w-4" />
          Générateur PV
        </button>
        <button
          type="button"
          onClick={() => setView("library")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black ${
            view === "library"
              ? "bg-[var(--opc-blue)] text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <FolderOpen className="h-4 w-4" />
          Bibliothèque
        </button>
        <button
          type="button"
          onClick={() => setView("procedure-register")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black ${
            view === "procedure-register"
              ? "bg-emerald-600 text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" />
          Tableau de référence procédures
        </button>
      </div>

      {view === "pv-generator" ? (
        <DocumentsPvGenerator
          projects={projects}
          onOpenPvLibrary={() => {
            setTypeFilter("pv");
            setSubcategoryFilter("all");
            setView("library");
            router.refresh();
          }}
        />
      ) : view === "procedure-register" ? (
        <ProcedureRegister documents={documents} projects={projects} />
      ) : (
        <>
      <section className="mb-5 rounded-2xl border border-[var(--opc-border)] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {[
            ["all", "Tous"],
            ["plan", "Plans"],
            ["procedure", "Procédures"],
            ["pv", "PV"],
            ["icp", "ICP"],
            ["pvi", "PVI"],
            ["ndc", "NDC"],
            ["other", "Autres"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setTypeFilter(value);
                setSubcategoryFilter("all");
              }}
              className={`rounded-xl px-4 py-2 text-xs font-black ${
                typeFilter === value
                  ? "bg-[var(--opc-blue)] text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_260px_auto]">
          <label className="flex items-center gap-2 rounded-xl border bg-slate-50 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Référence, titre ou révision..."
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          {typeFilter === "plan" || typeFilter === "procedure" ? (
            <select
              value={subcategoryFilter}
              onChange={(event) => setSubcategoryFilter(event.target.value)}
              className="rounded-xl border px-3 py-2 text-sm"
            >
              <option value="all">Toutes les sous-catégories</option>
              {typeFilter === "plan" ? (
                <>
                  <option value="plan_pose">Plan de pose</option>
                  <option value="plan_deroulage">Plan de déroulage</option>
                  <option value="tcr_plan">TCR Plan</option>
                  <option value="gc_plan">GC Plan</option>
                </>
              ) : (
                <>
                  <option value="gc">Génie civil</option>
                  <option value="installation_poste">
                    Installation poste
                  </option>
                  <option value="installation_campagne">
                    Installation campagne
                  </option>
                  <option value="vt">Vérification technique</option>
                </>
              )}
            </select>
          ) : (
            <div />
          )}
          <span className="self-center text-xs font-bold text-slate-500">
            {filteredDocuments.length} document(s) · plus récents en premier
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <DocumentMetadataSync
            documentIds={documents.map((document) => document.id)}
          />
          <div className="flex flex-wrap items-center gap-2">
            {visiblePvPdfIds.length ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedIds(new Set(visiblePvPdfIds))}
                className="border-red-200 text-red-700 hover:bg-red-50"
              >
                <FileText className="size-4" />
                Sélectionner tous les PDF ({visiblePvPdfIds.length})
              </Button>
            ) : null}
            {visibleWordIds.length ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelectedIds(new Set(visibleWordIds))}
                className="border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                <FileType2 className="size-4" />
                Sélectionner tous les Word ({visibleWordIds.length})
              </Button>
            ) : null}
          </div>
        </div>
        <PvWordBackfill documents={documents} />
        {typeFilter === "procedure" ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <div>
              <p className="text-sm font-black text-emerald-950">
                Tableau Excel de référence des procédures
              </p>
              <p className="text-xs font-semibold text-emerald-800">
                Comparez la liste de référence avec les procédures présentes
                dans OPC OS.
              </p>
            </div>
            <Button
              type="button"
              onClick={() => setView("procedure-register")}
              className="bg-emerald-700 hover:bg-emerald-800"
            >
              <FileSpreadsheet className="size-4" />
              Ouvrir le tableau de référence
            </Button>
          </div>
        ) : null}
      </section>

      <DocumentTable
        documents={filteredDocuments}
        allDocuments={documents}
        selectedIds={selectedIds}
        onToggle={toggleDocument}
        onToggleAll={toggleAllVisible}
        onRequestDelete={requestDelete}
      />

      {selectedIds.size ? (
        <div className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-white px-4 py-3 shadow-lg">
          <div>
            <span className="text-sm font-black text-slate-700">
              {selectedIds.size} document(s) sélectionné(s)
            </span>
            {downloadError ? <p className="mt-1 text-xs font-bold text-red-700">{downloadError}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => void downloadSelectedDocuments()}
              disabled={isDownloading || isDeleting}
              className="bg-emerald-700 hover:bg-emerald-800"
            >
              {isDownloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {isDownloading
                ? `Préparation ${downloadProgress}/${selectedDocuments.length}…`
                : "Télécharger la sélection (ZIP)"}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isDownloading}
              onClick={() => {
                requestDelete([...selectedIds]);
              }}
            >
              <Trash2 className="size-4" />
              Supprimer la sélection
            </Button>
          </div>
        </div>
      ) : null}
        </>
      )}

      <Dialog
        open={deleteOpen}
        onOpenChange={(nextOpen) => {
          setDeleteOpen(nextOpen);
          if (!nextOpen && !isDeleting) setPendingDeleteIds([]);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingDeleteIds.length === 1
                ? "Supprimer ce document ?"
                : "Supprimer les documents sélectionnés ?"}
            </DialogTitle>
            <DialogDescription>
              {pendingDeleteIds.length} document(s) et leurs fichiers associés
              seront supprimés définitivement. Cette action est irréversible.
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
              onClick={handleMultipleDelete}
              disabled={isDeleting || !pendingDeleteIds.length}
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
