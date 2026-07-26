import Link from "next/link";

import type { DocumentListItem } from "@/lib/documents/queries";

type DocumentTableProps = {
  documents: DocumentListItem[];
};

const columns: Array<{
  key: keyof Omit<DocumentListItem, "id">;
  label: string;
}> = [
  { key: "reference", label: "Référence" },
  { key: "title", label: "Titre" },
  { key: "category", label: "Catégorie" },
  { key: "revision", label: "Révision" },
  { key: "status", label: "Statut" },
];

function getCellValue(
  document: DocumentListItem,
  key: keyof Omit<DocumentListItem, "id">,
): string {
  if (key === "status") {
    return document.status ?? "Non défini";
  }

  return document[key] ?? "—";
}

export function DocumentTable({ documents }: DocumentTableProps) {
  if (documents.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--opc-border)] bg-white p-10 text-center">
        <p className="text-lg font-bold">Aucun document</p>
        <p className="mt-2 text-sm text-[var(--opc-muted)]">
          Ajoute ton premier document pour commencer.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--opc-border)] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-[var(--opc-muted)]">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-5 py-4">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--opc-border)]">
            {documents.map((document) => (
              <tr
                key={document.id}
                className="group transition-colors hover:bg-slate-50 focus-within:bg-slate-50"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={
                      column.key === "reference"
                        ? "p-0 font-semibold"
                        : "p-0"
                    }
                  >
                    <Link
                      href={`/documents/${document.id}`}
                      className="block px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--opc-blue)]"
                      aria-label={
                        column.key === "title"
                          ? `Voir le document ${document.title}`
                          : undefined
                      }
                    >
                      {column.key === "status" ? (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">
                          {getCellValue(document, column.key)}
                        </span>
                      ) : (
                        getCellValue(document, column.key)
                      )}
                    </Link>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
