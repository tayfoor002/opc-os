type DocumentItem = {
  id: string;
  reference: string | null;
  title: string;
  revision: string | null;
  status: string | null;
  category: string | null;
};

type DocumentTableProps = {
  documents: DocumentItem[];
};

export function DocumentTable({
  documents,
}: DocumentTableProps) {
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
              <th className="px-5 py-4">Référence</th>
              <th className="px-5 py-4">Titre</th>
              <th className="px-5 py-4">Catégorie</th>
              <th className="px-5 py-4">Révision</th>
              <th className="px-5 py-4">Statut</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--opc-border)]">
            {documents.map((document) => (
              <tr
                key={document.id}
                className="hover:bg-slate-50"
              >
                <td className="px-5 py-4 font-semibold">
                  {document.reference ?? "—"}
                </td>

                <td className="px-5 py-4">
                  {document.title}
                </td>

                <td className="px-5 py-4">
                  {document.category ?? "—"}
                </td>

                <td className="px-5 py-4">
                  {document.revision ?? "—"}
                </td>

                <td className="px-5 py-4">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">
                    {document.status ?? "Non défini"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}