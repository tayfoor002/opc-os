import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { documents, materials, zones } from "@/lib/data";

export default function DashboardPage() {
  const avgProgress = Math.round(zones.reduce((sum, zone) => sum + zone.progress, 0) / zones.length);

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        description="Vue générale du projet, des zones et des objets liés."
        action={<button className="primaryButton">+ Nouvel objet</button>}
      />

      <section className="statsGrid">
        <StatCard label="Zones" value={zones.length} detail="4 zones configurées" />
        <StatCard label="Avancement moyen" value={`${avgProgress}%`} detail="Toutes zones confondues" />
        <StatCard label="Documents" value={documents.length} detail="Documents actifs" />
        <StatCard label="Matériels" value={materials.length} detail="Objets suivis" />
      </section>

      <section className="contentGrid">
        <article className="panel">
          <div className="panelHeader">
            <h2>Avancement par zone</h2>
            <Link href="/zones">Voir les zones</Link>
          </div>
          <div className="zoneList">
            {zones.map((zone) => (
              <div key={zone.id} className="zoneRow">
                <div>
                  <strong>{zone.name}</strong>
                  <span>{zone.phaseCount} phases</span>
                </div>
                <div className="progressTrack">
                  <div className="progressValue" style={{ width: `${zone.progress}%` }} />
                </div>
                <strong>{zone.progress}%</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panelHeader">
            <h2>Objets récents</h2>
          </div>
          <div className="activityFeed">
            <div><span className="dot" /><p><strong>Plan de pose T01</strong><br />lié à Zone A · Phase 2</p></div>
            <div><span className="dot" /><p><strong>Transformateur T01</strong><br />statut : livré</p></div>
            <div><span className="dot" /><p><strong>PVI câbles signalisation</strong><br />en revue</p></div>
          </div>
        </article>
      </section>
    </>
  );
}
