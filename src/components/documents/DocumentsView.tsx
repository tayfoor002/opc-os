"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

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

  return (
    <>
      <DocumentToolbar onCreate={() => setOpen(true)} />

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
      </section>

      <DocumentTable
        documents={filteredDocuments}
        allDocuments={documents}
      />

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
