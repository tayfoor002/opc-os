"use client";

import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileClock,
  FileSpreadsheet,
  Loader2,
  Search,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DocumentListItem } from "@/lib/documents/queries";
import {
  compareProcedureRegisters,
  EMPTY_CHANGE_SUMMARY,
  getLatestGedDeposit,
  matchProcedureDocument,
  parseProcedureRegister,
  resolveProcedureRegisterHeader,
  type ProcedureRegisterChangeSummary,
  type ProcedureRegisterSnapshot,
} from "@/lib/documents/procedure-register";
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

type RegisterImportRow = {
  id: string;
  file_name: string;
  storage_path: string | null;
  sheet_name: string;
  headers: string[];
  rows: ProcedureRegisterSnapshot["rows"];
  change_summary: ProcedureRegisterChangeSummary;
  created_at: string;
};

type StatusFilter =
  | "all"
  | "changed"
  | "available"
  | "outdated"
  | "missing";

const BASELINE_URL = "/data/tableau-suivi-procedures-reference.xlsx";
const REFERENCE_HEADER = "Réf. Groupement";
const TITLE_HEADER = "Titre";
const GED_HEADER = "Date dépôt GED / AMO / ONCF";

function normalizeSummary(
  value: Partial<ProcedureRegisterChangeSummary> | null | undefined,
): ProcedureRegisterChangeSummary {
  return {
    added: Number(value?.added ?? 0),
    modified: Number(value?.modified ?? 0),
    removed: Number(value?.removed ?? 0),
    unchanged: Number(value?.unchanged ?? 0),
    details: Array.isArray(value?.details) ? value.details.map(String) : [],
    removedKeys: Array.isArray(value?.removedKeys)
      ? value.removedKeys.map(String)
      : [],
  };
}

function safeStorageName(fileName: string) {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-");
}

function formatImportDate(value: string | null) {
  if (!value) return "Référence initiale intégrée";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status: ReturnType<typeof matchProcedureDocument>["status"]) {
  if (status === "available") return "Dernière version disponible";
  if (status === "outdated") return "Version OPC OS à mettre à jour";
  if (status === "missing") return "Fichier absent d’OPC OS";
  return "Pas encore déposée à la GED";
}

function statusClass(status: ReturnType<typeof matchProcedureDocument>["status"]) {
  if (status === "available") return "bg-emerald-100 text-emerald-800";
  if (status === "not_deposited") return "bg-slate-100 text-slate-600";
  return "bg-amber-100 text-amber-900";
}

export function ProcedureRegister({ documents, projects }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [snapshot, setSnapshot] = useState<ProcedureRegisterSnapshot | null>(
    null,
  );
  const [summary, setSummary] =
    useState<ProcedureRegisterChangeSummary>(EMPTY_CHANGE_SUMMARY);
  const [importedAt, setImportedAt] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState(BASELINE_URL);
  const [isBaseline, setIsBaseline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const loadBaseline = useCallback(async () => {
    const response = await fetch(BASELINE_URL);
    if (!response.ok) {
      throw new Error("Le tableau de référence intégré est introuvable.");
    }
    const parsed = await parseProcedureRegister(
      await response.arrayBuffer(),
      "Tableau Suivi Procédures travaux LC KS (1).xlsx",
    );
    setSnapshot(parsed);
    setSummary({
      ...EMPTY_CHANGE_SUMMARY,
      unchanged: parsed.rows.length,
      details: [
        `${parsed.rows.length} procédures importées comme référence initiale.`,
      ],
      removedKeys: [],
    });
    setImportedAt(null);
    setSourceUrl(BASELINE_URL);
    setIsBaseline(true);
  }, []);

  const loadLatestImport = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error: queryError } = await supabase
      .from("procedure_register_imports")
      .select(
        "id,file_name,storage_path,sheet_name,headers,rows,change_summary,created_at",
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (queryError) {
      if (
        queryError.message.includes("procedure_register_imports") ||
        queryError.message.includes("schema cache")
      ) {
        await loadBaseline();
        setError(
          "Le registre est prêt, mais la migration 014_procedure_register.sql doit être exécutée dans Supabase avant le premier nouvel import.",
        );
      } else {
        setError(`Impossible de charger le registre : ${queryError.message}`);
      }
      setLoading(false);
      return;
    }

    if (!data) {
      await loadBaseline();
      setLoading(false);
      return;
    }

    const record = data as RegisterImportRow;
    setSnapshot({
      fileName: record.file_name,
      sheetName: record.sheet_name,
      headers: record.headers,
      rows: record.rows,
    });
    setSummary(normalizeSummary(record.change_summary));
    setImportedAt(record.created_at);
    setIsBaseline(false);
    setSourceUrl("");
    if (record.storage_path) {
      const signed = await supabase.storage
        .from("procedure-registers")
        .createSignedUrl(record.storage_path, 60 * 10);
      if (signed.data?.signedUrl) setSourceUrl(signed.data.signedUrl);
    }
    setLoading(false);
  }, [loadBaseline, projectId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadLatestImport();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadLatestImport]);

  const projectDocuments = useMemo(
    () => documents.filter((document) => document.project_id === projectId),
    [documents, projectId],
  );

  const rowsWithMatch = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.rows.map((row) => ({
      row,
      match: matchProcedureDocument(row, snapshot.headers, projectDocuments),
    }));
  }, [projectDocuments, snapshot]);

  const counts = useMemo(
    () =>
      rowsWithMatch.reduce(
        (result, item) => {
          result[item.match.status] += 1;
          return result;
        },
        { available: 0, outdated: 0, missing: 0, not_deposited: 0 },
      ),
    [rowsWithMatch],
  );

  const visibleRows = useMemo(() => {
    if (!snapshot) return [];
    const referenceHeader = resolveProcedureRegisterHeader(
      snapshot.headers,
      REFERENCE_HEADER,
    );
    const titleHeader = resolveProcedureRegisterHeader(
      snapshot.headers,
      TITLE_HEADER,
    );
    const normalizedQuery = query.trim().toLowerCase();

    return rowsWithMatch.filter(({ row, match }) => {
      const matchesQuery =
        !normalizedQuery ||
        `${row.values[referenceHeader ?? ""] ?? ""} ${
          row.values[titleHeader ?? ""] ?? ""
        }`
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesFilter =
        statusFilter === "all" ||
        (statusFilter === "changed"
          ? row.changeType !== "unchanged"
          : match.status === statusFilter);
      return matchesQuery && matchesFilter;
    });
  }, [query, rowsWithMatch, snapshot, statusFilter]);

  async function handleUpload(file: File) {
    if (!projectId || !snapshot) return;
    if (!/\.xlsx?$/i.test(file.name)) {
      setError("Sélectionnez un fichier Excel .xlsx ou .xls.");
      return;
    }

    setUploading(true);
    setError(null);
    const supabase = createClient();
    let storagePath: string | null = null;

    try {
      const parsed = await parseProcedureRegister(file, file.name);
      const compared = compareProcedureRegisters(snapshot, parsed);
      storagePath = `${projectId}/${Date.now()}-${safeStorageName(file.name)}`;
      const storageResult = await supabase.storage
        .from("procedure-registers")
        .upload(storagePath, file, {
          cacheControl: "3600",
          contentType:
            file.type ||
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          upsert: false,
        });
      if (storageResult.error) throw storageResult.error;

      const insertResult = await supabase
        .from("procedure_register_imports")
        .insert({
          project_id: projectId,
          file_name: file.name,
          storage_path: storagePath,
          sheet_name: compared.snapshot.sheetName,
          headers: compared.snapshot.headers,
          rows: compared.snapshot.rows,
          row_count: compared.snapshot.rows.length,
          change_summary: compared.summary,
        })
        .select(
          "id,file_name,storage_path,sheet_name,headers,rows,change_summary,created_at",
        )
        .single();
      if (insertResult.error) throw insertResult.error;

      const record = insertResult.data as RegisterImportRow;
      setSnapshot(compared.snapshot);
      setSummary(compared.summary);
      setImportedAt(record.created_at);
      setIsBaseline(false);
      const signed = await supabase.storage
        .from("procedure-registers")
        .createSignedUrl(storagePath, 60 * 10);
      setSourceUrl(signed.data?.signedUrl ?? "");
    } catch (caughtError) {
      if (storagePath) {
        await supabase.storage.from("procedure-registers").remove([storagePath]);
      }
      const message =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(
        message.includes("procedure_register_imports") ||
          message.includes("procedure-registers")
          ? "Import impossible tant que la migration 014_procedure_register.sql n’est pas exécutée dans Supabase."
          : `Import impossible : ${message}`,
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-80 items-center justify-center rounded-2xl border bg-white">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--opc-blue)]" />
      </div>
    );
  }

  if (!projects.length) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        Créez d’abord un projet pour associer le registre des procédures.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[var(--opc-border)] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
              <h2 className="text-xl font-black text-slate-950">
                Tableau de suivi des procédures
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Référence versionnée, comparaison Excel et contrôle des fichiers
              présents dans OPC OS.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code ? `${project.code} — ` : ""}
                  {project.name}
                </option>
              ))}
            </select>
            {sourceUrl ? (
              <a
                href={sourceUrl}
                download
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                Source Excel
              </a>
            ) : null}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleUpload(file);
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--opc-blue)] px-4 text-sm font-black text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Importer la mise à jour
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t pt-3 text-xs text-slate-500">
          <span className="font-bold text-slate-700">
            {snapshot?.fileName ?? "Aucun fichier"}
          </span>
          <span>{formatImportDate(importedAt)}</span>
          <span>{snapshot?.rows.length ?? 0} procédure(s)</span>
          {isBaseline ? (
            <span className="rounded-full bg-blue-50 px-2 py-1 font-bold text-blue-700">
              Référence fournie intégrée
            </span>
          ) : null}
        </div>
      </section>

      {error ? (
        <div className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-950">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex items-start gap-3">
          <FileClock className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700" />
          <div className="min-w-0">
            <h3 className="font-black text-emerald-950">
              Derniers changements détectés
            </h3>
            <p className="mt-1 text-sm text-emerald-900">
              {summary.added} ajout(s), {summary.modified} procédure(s)
              modifiée(s), {summary.removed} suppression(s) et{" "}
              {summary.unchanged} inchangée(s).
            </p>
            {summary.details.length ? (
              <ul className="mt-3 grid gap-1 text-xs font-semibold text-emerald-900 md:grid-cols-2">
                {summary.details.slice(0, 12).map((detail, index) => (
                  <li key={`${detail}-${index}`} className="truncate">
                    • {detail}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs font-semibold text-emerald-800">
                Aucun changement par rapport à la version précédente.
              </p>
            )}
            {summary.removedKeys.length ? (
              <p className="mt-3 text-xs font-bold text-amber-900">
                Retirées : {summary.removedKeys.join(", ")}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatusCard
          label="À jour dans OPC OS"
          value={counts.available}
          tone="green"
          onClick={() => setStatusFilter("available")}
        />
        <StatusCard
          label="Versions obsolètes"
          value={counts.outdated}
          tone="amber"
          onClick={() => setStatusFilter("outdated")}
        />
        <StatusCard
          label="Fichiers manquants"
          value={counts.missing}
          tone="red"
          onClick={() => setStatusFilter("missing")}
        />
        <StatusCard
          label="Sans dépôt GED daté"
          value={counts.not_deposited}
          tone="slate"
          onClick={() => setStatusFilter("all")}
        />
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--opc-border)] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <label className="flex min-w-64 flex-1 items-center gap-2 rounded-xl border bg-slate-50 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher une référence ou un titre..."
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "Toutes"],
              ["changed", "Modifiées"],
              ["missing", "Absentes"],
              ["outdated", "Obsolètes"],
              ["available", "À jour"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value as StatusFilter)}
                className={`rounded-lg px-3 py-2 text-xs font-black ${
                  statusFilter === value
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="text-xs font-bold text-slate-500">
            {visibleRows.length} ligne(s)
          </span>
        </div>

        <div className="max-h-[68vh] overflow-auto">
          <table className="min-w-max border-separate border-spacing-0 text-left text-xs">
            <thead className="sticky top-0 z-20 bg-slate-900 text-white">
              <tr>
                <th className="sticky left-0 z-30 w-48 border-b border-r border-slate-700 bg-slate-900 px-3 py-3">
                  Contrôle OPC OS
                </th>
                <th className="w-36 border-b border-r border-slate-700 bg-slate-900 px-3 py-3">
                  Dernière GED
                </th>
                {snapshot?.headers.map((header) => (
                  <th
                    key={header}
                    className="max-w-64 border-b border-r border-slate-700 px-3 py-3 font-black"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ row, match }) => {
                const gedHeader = snapshot
                  ? resolveProcedureRegisterHeader(
                      snapshot.headers,
                      GED_HEADER,
                    )
                  : null;
                const latest = gedHeader
                  ? getLatestGedDeposit(row.values[gedHeader] ?? "")
                  : null;
                return (
                  <tr key={row.key} className="align-top hover:bg-slate-50">
                    <td className="sticky left-0 z-10 border-b border-r bg-white px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-[11px] font-black ${statusClass(
                          match.status,
                        )}`}
                      >
                        {statusLabel(match.status)}
                      </span>
                      {match.status === "outdated" ? (
                        <p className="mt-1 text-[11px] font-bold text-amber-800">
                          OPC OS : {match.availableRevision ?? "révision vide"}
                        </p>
                      ) : null}
                      {match.matchedDocument ? (
                        <Link
                          href={`/documents/${match.matchedDocument.id}`}
                          className="mt-2 block font-bold text-[var(--opc-blue)] hover:underline"
                        >
                          Ouvrir le document
                        </Link>
                      ) : null}
                    </td>
                    <td className="border-b border-r bg-emerald-50 px-3 py-3 font-black text-emerald-800">
                      {latest ? (
                        <>
                          <span className="block">{latest.version}</span>
                          <span className="mt-1 block whitespace-nowrap">
                            {latest.date ?? "Date non renseignée"}
                          </span>
                        </>
                      ) : (
                        <span className="font-semibold text-slate-400">—</span>
                      )}
                    </td>
                    {snapshot?.headers.map((header) => {
                      const changed = row.changedColumns.includes(header);
                      const isGed = header === gedHeader;
                      return (
                        <td
                          key={`${row.key}-${header}`}
                          className={`max-w-72 whitespace-pre-line border-b border-r px-3 py-3 leading-5 ${
                            changed
                              ? "bg-emerald-100 font-bold text-emerald-950"
                              : isGed
                                ? "bg-emerald-50 text-emerald-900"
                                : "bg-white text-slate-700"
                          }`}
                        >
                          {row.values[header] || "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!visibleRows.length ? (
          <div className="p-10 text-center text-sm font-semibold text-slate-500">
            Aucune procédure ne correspond aux filtres.
          </div>
        ) : null}
      </section>
    </div>
  );
}

function StatusCard({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  tone: "green" | "amber" | "red" | "slate";
  onClick: () => void;
}) {
  const tones = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-900",
    slate: "border-slate-200 bg-slate-50 text-slate-800",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${tones[tone]}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-black uppercase tracking-wide">
          {label}
        </span>
        {tone === "green" ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <AlertTriangle className="h-5 w-5" />
        )}
      </div>
      <strong className="mt-3 block text-3xl font-black">{value}</strong>
    </button>
  );
}
