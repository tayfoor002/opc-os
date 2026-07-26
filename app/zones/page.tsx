import { PageHeader } from "@/components/page-header";
import { zones } from "@/lib/data";

export default function ZonesPage() {
  return (
    <>
      <PageHeader
        title="Zones"
        description="Chaque zone contient ses phases, activités et objets liés."
        action={<button className="primaryButton">+ Ajouter une zone</button>}
      />

      <section className="cardsGrid">
        {zones.map((zone) => (
          <article key={zone.id} className="entityCard">
            <div className="entityTop">
              <span className="codeBadge">{zone.code}</span>
              <span>{zone.progress}%</span>
            </div>
            <h2>{zone.name}</h2>
            <p>{zone.phaseCount} phases configurées</p>
            <div className="progressTrack large">
              <div className="progressValue" style={{ width: `${zone.progress}%` }} />
            </div>
            <div className="phaseTags">
              <span>Phase 1</span><span>Phase 2</span><span>Phase 3</span>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
