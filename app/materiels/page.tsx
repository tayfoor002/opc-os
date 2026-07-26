import { PageHeader } from "@/components/page-header";
import { materialCategories, materials } from "@/lib/data";

export default function MaterialsPage() {
  return (
    <>
      <PageHeader
        title="Matériels / Équipements"
        description="Catégories principales fixes, sous-catégories personnalisables."
        action={<button className="primaryButton">+ Ajouter un matériel</button>}
      />

      <section className="cardsGrid compact">
        {materialCategories.map((category) => (
          <article className="miniCard" key={category}>
            <strong>{category}</strong>
            <span>Configurer</span>
          </article>
        ))}
      </section>

      <section className="panel">
        <div className="tableWrap">
          <table>
            <thead>
              <tr><th>Matériel</th><th>Catégorie</th><th>Référence</th><th>Statut</th><th>Zone / Phase</th><th>Activité</th><th>Quantité</th></tr>
            </thead>
            <tbody>
              {materials.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong></td>
                  <td>{item.category}</td>
                  <td>{item.reference}</td>
                  <td><span className="status">{item.status}</span></td>
                  <td>{item.zone}<small>{item.phase}</small></td>
                  <td>{item.activity}</td>
                  <td>{item.quantity} {item.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
