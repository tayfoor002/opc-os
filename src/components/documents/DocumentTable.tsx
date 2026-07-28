import Link from "next/link";

import type { DocumentListItem } from "@/lib/documents/queries";

type DocumentTableProps = {
  documents: DocumentListItem[];
  allDocuments: DocumentListItem[];
};

const typeLabels: Record<string, string> = {
  plan: "Plan",
  procedure: "Procédure",
  pv: "PV",
  icp: "ICP",
  pvi: "PVI",
  ndc: "NDC",
  other: "Autre",
};

const subcategoryLabels: Record<string, string> = {
  plan_pose: "Plan de pose",
  plan_deroulage: "Plan de déroulage",
  tcr_plan: "TCR Plan",
  gc_plan: "GC Plan",
  gc: "Génie civil",
  installation_poste: "Installation poste",
  installation_campagne: "Installation campagne",
  vt: "Vérification technique",
};

export function DocumentTable({
  documents,
  allDocuments,
}: DocumentTableProps) {
  const latestPlanIds = new Set<string>();
  const seenPlanReferences = new Set<string>();
  for (const document of allDocuments) {
    if (document.document_type !== "plan") continue;
    const key = document.reference?.trim().toLowerCase() || document.id;
    if (!seenPlanReferences.has(key)) {
      seenPlanReferences.add(key);
      latestPlanIds.add(document.id);
    }
  }

  if (documents.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--opc-border)] bg-white p-10 text-center">
        <p className="text-lg font-bold">Aucun document</p>
        <p className="mt-2 text-sm text-[var(--opc-muted)]">
          Aucun document ne correspond aux filtres sélectionnés.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--opc-border)] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-[1200px] w-full text-left">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-[var(--opc-muted)]">
            <tr>
              <th className="px-5 py-4">Référence</th>
              <th className="px-5 py-4">Titre</th>
              <th className="px-5 py-4">Type / sous-catégorie</th>
              <th className="px-5 py-4">Révision</th>
              <th className="px-5 py-4">Pour exécution</th>
              <th className="px-5 py-4">Mise en ligne OPC OS</th>
              <th className="px-5 py-4">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--opc-border)]">
            {documents.map((document) => {
              const isLatestPlan = latestPlanIds.has(document.id);
              return (
                <tr
                  key={document.id}
                  className="group transition-colors hover:bg-slate-50 focus-within:bg-slate-50"
                >
                  <Cell document={document}>
                    <span className="font-black text-[var(--opc-blue)]">
                      {document.reference || "Sans référence"}
                    </span>
                  </Cell>
                  <Cell document={document}>
                    <span className="font-bold">{document.title}</span>
                  </Cell>
                  <Cell document={document}>
                    <span className="font-bold">
                      {typeLabels[document.document_type] ??
                        document.document_type}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {document.document_subcategory
                        ? subcategoryLabels[document.document_subcategory] ??
                          document.document_subcategory
                        : "—"}
                    </span>
                  </Cell>
                  <Cell document={document}>
                    <span>{document.revision || "—"}</span>
                    {isLatestPlan ? (
                      <span className="ml-2 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700">
                        Dernière version
                      </span>
                    ) : null}
                  </Cell>
                  <Cell document={document}>
                    {document.document_type === "plan" ? (
                      <ExecutionBadge status={document.execution_status} />
                    ) : (
                      <span className="text-slate-400">Non applicable</span>
                    )}
                  </Cell>
                  <Cell document={document}>
                    {new Intl.DateTimeFormat("fr-FR", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(document.created_at))}
                  </Cell>
                  <Cell document={document}>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">
                      {document.status ?? "Non défini"}
                    </span>
                  </Cell>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cell({
  document,
  children,
}: {
  document: DocumentListItem;
  children: React.ReactNode;
}) {
  return (
    <td className="p-0">
      <Link
        href={`/documents/${document.id}`}
        className="block min-h-16 px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--opc-blue)]"
      >
        {children}
      </Link>
    </td>
  );
}

function ExecutionBadge({ status }: { status: string }) {
  const config =
    status === "approved"
      ? { label: "Bon pour exécution", className: "bg-emerald-50 text-emerald-700" }
      : status === "rejected"
        ? { label: "Non bon pour exécution", className: "bg-red-50 text-red-700" }
        : { label: "En attente", className: "bg-amber-50 text-amber-700" };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${config.className}`}>
      {config.label}
    </span>
  );
}
