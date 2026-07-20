import { Suspense } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { TasksWorkspace } from "@/components/tasks/TasksWorkspace";

export default function Page() {
  return <AppLayout><Suspense fallback={<div className="rounded-2xl border bg-white p-6 font-bold text-slate-500">Chargement des tâches...</div>}><TasksWorkspace /></Suspense></AppLayout>;
}
