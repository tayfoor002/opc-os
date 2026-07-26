import { PageHeader } from "@/components/page-header";
import { documentCategories, documents } from "@/lib/data";

export default function DocumentsPage() {
  return (
    <>
      <PageHeader
        title="Documents"
        description="Gestion documentaire reliée au projet, à la zone, à la phase et à l'activité."
        action={<button className="primaryButton">+ Ajouter un document</button>}
      />

      <div className="categoryBar">
        {documentCategories.map((category) => <span key={category}>{category}</span>)}
      </div>

      <section className="panel">
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Document</th><th>Catégorie</th><th>Rév.</th><th>Statut</th>
                <th>Zone / Phase</th><th>Activité</th><th>Entreprise</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td><strong>{doc.name}</strong><small>{doc.updatedAt}</small></td>
                  <td>{doc.category}</td>
                  <td>{doc.revision}</td>
                  <td><span className="status">{doc.status}</span></td>
                  <td>{doc.zone}<small>{doc.phase}</small></td>
                  <td>{doc.activity}</td>
                  <td>{doc.company}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
