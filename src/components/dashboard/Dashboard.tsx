import {
  AlertTriangle,
  FileText,
  ListTodo,
  Play,
  TrendingUp,
} from "lucide-react";

import { KpiCard } from "@/components/dashboard/KpiCard";
import { createClient } from "@/lib/supabase/server";

type DashboardStats = {
  progress: number;
  total: number;
  active: number;
  critical: number;
  documents: number;
};

const EMPTY_STATS: DashboardStats = {
  progress: 0,
  total: 0,
  active: 0,
  critical: 0,
  documents: 0,
};

async function getDashboardStats(): Promise<DashboardStats> {
  try {
    const supabase = await createClient();
    const [activitiesResult, documentsResult] = await Promise.all([
      supabase.from("activities").select("progress,status,critical"),
      supabase.from("documents").select("id", {
        count: "exact",
        head: true,
      }),
    ]);

    if (activitiesResult.error) {
      return EMPTY_STATS;
    }

    const activities = activitiesResult.data ?? [];
    const progress = activities.length
      ? Math.round(
          activities.reduce(
            (total, activity) => total + Number(activity.progress ?? 0),
            0,
          ) / activities.length,
        )
      : 0;

    return {
      progress,
      total: activities.length,
      active: activities.filter(
        (activity) => activity.status === "in_progress",
      ).length,
      critical: activities.filter((activity) => activity.critical).length,
      documents: documentsResult.count ?? 0,
    };
  } catch {
    return EMPTY_STATS;
  }
}

export async function Dashboard() {
  const stats = await getDashboardStats();

  return (
    <div className="mx-auto max-w-[1700px]">
      <div className="flex flex-col justify-between gap-4 xl:flex-row">
        <div>
          <h1 className="text-4xl font-black">Project Delivery Dashboard</h1>
          <p className="mt-2 text-base font-bold text-[var(--opc-blue)]">
            Programme de développement - Génie Civil, Installation &amp; VT
          </p>
          <p className="mt-2 text-sm text-[var(--opc-muted)]">
            Données chargées depuis Supabase pour le projet PDD.
          </p>
        </div>
        <button className="rounded-xl bg-[var(--opc-red)] px-5 py-3 text-sm font-black text-white">
          ＋ Nouvelle activité
        </button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard
          title="Avancement global"
          value={`${stats.progress}%`}
          subtitle="Moyenne"
          icon={TrendingUp}
        />
        <KpiCard
          title="Activités totales"
          value={String(stats.total)}
          subtitle="Supabase"
          icon={ListTodo}
        />
        <KpiCard
          title="Activités en cours"
          value={String(stats.active)}
          subtitle="in_progress"
          icon={Play}
        />
        <KpiCard
          title="Activités critiques"
          value={String(stats.critical)}
          subtitle="Chemin critique"
          icon={AlertTriangle}
        />
        <KpiCard
          title="Retard cumulé"
          value="0 j"
          subtitle="Sprint 007"
          icon={AlertTriangle}
        />
        <KpiCard
          title="Documents"
          value={String(stats.documents)}
          subtitle="Enregistrés"
          icon={FileText}
        />
      </div>

      <div className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-black">Connexion active</h2>
        <p className="mt-2 text-sm text-[var(--opc-muted)]">
          Après exécution du script SQL, les indicateurs afficheront les vraies
          données du projet PDD.
        </p>
      </div>
    </div>
  );
}
