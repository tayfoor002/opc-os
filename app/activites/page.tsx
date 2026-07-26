import { PageHeader } from "@/components/page-header";

const activities = [
  { name: "Pose transformateur", zone: "Zone A", phase: "Phase 2", progress: 70 },
  { name: "Déroulage câbles", zone: "Zone B", phase: "Phase 1", progress: 42 },
  { name: "Contrôle installation", zone: "Zone C", phase: "Phase 3", progress: 15 }
];

export default function ActivitiesPage() {
  return (
    <>
      <PageHeader
        title="Activités"
        description="Le point central reliant planning, documents, matériels, photos et qualité."
        action={<button className="primaryButton">+ Nouvelle activité</button>}
      />
      <section className="panel">
        <div className="tableWrap">
          <table>
            <thead>
              <tr><th>Activité</th><th>Zone</th><th>Phase</th><th>Avancement</th><th>Relations</th></tr>
            </thead>
            <tbody>
              {activities.map((item) => (
                <tr key={item.name}>
                  <td><strong>{item.name}</strong></td>
                  <td>{item.zone}</td>
                  <td>{item.phase}</td>
                  <td>{item.progress}%</td>
                  <td><span className="pill">Documents</span> <span className="pill">Matériels</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
