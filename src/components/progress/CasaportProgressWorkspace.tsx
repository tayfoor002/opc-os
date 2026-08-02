"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  FileUp,
  History,
  Loader2,
  MapPin,
  RefreshCw,
} from "lucide-react";

import { applyCasaportProgressImport } from "@/app/progress/actions";
import {
  parseCasaportProgressReport,
  type CasaportReportReading,
} from "@/lib/progress/casaport-report";
import { createClient } from "@/lib/supabase/client";

type ImportHistory = {
  id: string;
  report_date: string;
  source_file_name: string;
  global_progress: number;
  activities_updated: number;
  tasks_updated: number;
  created_at: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function recalculate(report: CasaportReportReading): CasaportReportReading {
  const activities = report.activities.map((activity) => ({
    ...activity,
    progress: activity.tasks.length
      ? Math.round(
          (activity.tasks.reduce((sum, task) => sum + task.progress, 0) /
            activity.tasks.length) *
            10,
        ) / 10
      : 0,
  }));
  return {
    ...report,
    activities,
    globalProgress: activities.length
      ? Math.round(
          activities.reduce((sum, activity) => sum + activity.progress, 0) /
            activities.length,
        )
      : 0,
  };
}

export function CasaportProgressWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = useMemo(() => createClient(), []);
  const [reportDate, setReportDate] = useState(today());
  const [report, setReport] = useState<CasaportReportReading | null>(null);
  const [history, setHistory] = useState<ImportHistory[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [historyWarning, setHistoryWarning] = useState("");

  async function loadHistory() {
    const project = await supabase
      .from("projects")
      .select("id")
      .eq("code", "PDD")
      .maybeSingle();
    if (project.error || !project.data) return;
    const result = await supabase
      .from("progress_imports")
      .select(
        "id,report_date,source_file_name,global_progress,activities_updated,tasks_updated,created_at",
      )
      .eq("project_id", project.data.id)
      .order("report_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(12);
    if (result.error) {
      setHistoryWarning(
        result.error.message.includes("progress_imports") ||
          result.error.message.includes("schema cache")
          ? "L’historique sera disponible après la migration 016_casaport_progress_import.sql."
          : result.error.message,
      );
      return;
    }
    setHistory((result.data ?? []) as ImportHistory[]);
    setHistoryWarning("");
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial remote synchronization
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function analyze(file: File) {
    setParsing(true);
    setError("");
    setSuccess("");
    try {
      setReport(await parseCasaportProgressReport(file));
    } catch (analysisError) {
      setReport(null);
      setError(
        analysisError instanceof Error
          ? analysisError.message
          : "Impossible d’analyser ce rapport PDF.",
      );
    }
    setParsing(false);
  }

  function updateProgress(
    activityIndex: number,
    taskIndex: number,
    progress: number,
  ) {
    if (!report) return;
    const next = structuredClone(report);
    const task = next.activities[activityIndex].tasks[taskIndex];
    task.progress = Math.max(0, Math.min(100, progress || 0));
    if (task.progressMode === "quantity" && task.targetQuantity) {
      task.completedQuantity = Math.round(
        (task.targetQuantity * task.progress) / 100,
      );
    }
    setReport(recalculate(next));
  }

  function updateQuantity(
    activityIndex: number,
    taskIndex: number,
    completedQuantity: number,
  ) {
    if (!report) return;
    const next = structuredClone(report);
    const task = next.activities[activityIndex].tasks[taskIndex];
    const maximum = task.targetQuantity ?? 0;
    task.completedQuantity = Math.max(
      0,
      Math.min(maximum, completedQuantity || 0),
    );
    task.progress = maximum
      ? Math.round((task.completedQuantity / maximum) * 10_000) / 100
      : 0;
    setReport(recalculate(next));
  }

  function updateStep(
    activityIndex: number,
    taskIndex: number,
    stepIndex: number,
    progress: number,
  ) {
    if (!report) return;
    const next = structuredClone(report);
    const task = next.activities[activityIndex].tasks[taskIndex];
    task.steps[stepIndex].progress = Math.max(
      0,
      Math.min(100, progress || 0),
    );
    task.progress = task.steps.length
      ? Math.round(
          (task.steps.reduce((sum, step) => sum + step.progress, 0) /
            task.steps.length) *
            10,
        ) / 10
      : 0;
    setReport(recalculate(next));
  }

  async function applyImport() {
    if (!report) return;
    setApplying(true);
    setError("");
    setSuccess("");
    const result = await applyCasaportProgressImport({
      fileName: report.fileName,
      reportDate,
      globalProgress: report.globalProgress,
      activities: report.activities,
    });
    if (!result.success) {
      setError(result.error);
    } else {
      setSuccess(
        `${result.activitiesUpdated} activités et ${result.tasksUpdated} tâches Casa-Port mises à jour au ${result.reportDate}.`,
      );
      await loadHistory();
    }
    setApplying(false);
  }

  return (
    <div className="mx-auto max-w-[1700px]">
      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--opc-red)]">
            Mise à jour automatisée
          </p>
          <h1 className="mt-2 text-4xl font-black">Avancement Casa-Port</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--opc-muted)]">
            Importez le rapport PDF global de la gare. OPC OS lit les barres,
            prépare les 6 activités et leurs tâches, puis enregistre une mise à
            jour datée après votre validation.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-black text-blue-800">
          <MapPin className="size-4" /> Zone Casa / Casa-Port uniquement
        </div>
      </header>

      <section className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-[var(--opc-border)] bg-white p-5 shadow-sm">
          <div
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void analyze(file);
            }}
            className={`grid min-h-56 place-items-center rounded-2xl border-2 border-dashed p-7 text-center transition ${
              dragActive
                ? "border-[var(--opc-blue)] bg-blue-50"
                : "border-slate-300 bg-slate-50"
            }`}
          >
            <div>
              {parsing ? (
                <Loader2 className="mx-auto size-9 animate-spin text-[var(--opc-blue)]" />
              ) : (
                <FileUp className="mx-auto size-10 text-[var(--opc-blue)]" />
              )}
              <p className="mt-4 text-lg font-black">
                {parsing ? "Lecture des barres d’avancement…" : "Déposer le rapport PDF Casa-Port"}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Rapport image de 4 pages, jusqu’à 35 Mo
              </p>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void analyze(file);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={parsing}
                onClick={() => inputRef.current?.click()}
                className="mt-5 rounded-xl bg-[var(--opc-blue)] px-5 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                Choisir le PDF
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--opc-border)] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <History className="size-5 text-[var(--opc-blue)]" />
            <h2 className="text-lg font-black">Derniers imports</h2>
          </div>
          {historyWarning ? (
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800">
              {historyWarning}
            </p>
          ) : null}
          <div className="mt-4 space-y-2">
            {history.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-black">{item.source_file_name}</p>
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-black text-blue-700">
                    {item.global_progress}%
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {item.report_date} · {item.activities_updated} activités · {item.tasks_updated} tâches
                </p>
              </div>
            ))}
            {!history.length && !historyWarning ? (
              <p className="py-8 text-center text-sm text-slate-400">Aucun import enregistré.</p>
            ) : null}
          </div>
        </div>
      </section>

      {error ? (
        <div className="mt-5 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" /> {error}
        </div>
      ) : null}
      {success ? (
        <div className="mt-5 flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" /> {success}
        </div>
      ) : null}

      {report ? (
        <section className="mt-6 space-y-5">
          <div className="sticky top-20 z-20 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-blue-200 bg-white p-4 shadow-lg">
            <div className="flex flex-wrap items-center gap-4">
              <div className="rounded-xl bg-[var(--opc-blue)] px-4 py-3 text-white">
                <p className="text-[10px] font-black uppercase tracking-wide">Avancement global calculé</p>
                <p className="mt-1 text-2xl font-black">{report.globalProgress}%</p>
              </div>
              <label className="text-xs font-black uppercase text-slate-500">
                Date du relevé
                <input
                  type="date"
                  value={reportDate}
                  onChange={(event) => setReportDate(event.target.value)}
                  className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold normal-case text-slate-800"
                />
              </label>
              <div className="max-w-xl text-xs font-semibold text-amber-800">
                {report.warnings.map((warning) => <p key={warning}>• {warning}</p>)}
              </div>
            </div>
            <button
              type="button"
              disabled={applying || !reportDate}
              onClick={() => void applyImport()}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--opc-red)] px-5 py-3 text-sm font-black text-white disabled:opacity-50"
            >
              {applying ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Valider et mettre à jour Casa-Port
            </button>
          </div>

          {report.activities.map((activity, activityIndex) => (
            <article key={activity.key} className="overflow-hidden rounded-2xl border border-[var(--opc-border)] bg-white shadow-sm">
              <header className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 px-5 py-4 text-white">
                <div>
                  <p className="text-xs font-black text-orange-300">{activity.code}</p>
                  <h2 className="mt-1 text-xl font-black">{activity.title}</h2>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-2.5 w-36 overflow-hidden rounded-full bg-white/20">
                    <div className="h-full rounded-full bg-emerald-400" style={{ width: `${activity.progress}%` }} />
                  </div>
                  <span className="text-lg font-black">{activity.progress}%</span>
                </div>
              </header>
              <div className="grid gap-4 p-5 xl:grid-cols-2">
                {activity.tasks.map((task, taskIndex) => (
                  <div key={task.key} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-slate-900">{task.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {task.progressMode === "building"
                            ? `${task.steps.length} étapes de construction`
                            : task.progressMode === "quantity"
                              ? `Suivi quantitatif en ${task.unit}`
                              : "Suivi en pourcentage"}
                        </p>
                      </div>
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-black text-blue-700">
                        {task.progress}%
                      </span>
                    </div>

                    {task.progressMode === "building" ? (
                      <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-2">
                        {task.steps.map((step, stepIndex) => (
                          <label key={step.code} className="grid grid-cols-[1fr_90px] items-center gap-3 text-xs font-bold text-slate-600">
                            <span>{step.label}</span>
                            <div className="relative">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={5}
                                value={step.progress}
                                onChange={(event) => updateStep(activityIndex, taskIndex, stepIndex, Number(event.target.value))}
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 pr-7 text-right font-black text-slate-900"
                              />
                              <span className="pointer-events-none absolute right-2 top-2 text-slate-400">%</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    ) : task.progressMode === "quantity" ? (
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <label className="text-xs font-black uppercase text-slate-500">
                          Réalisé
                          <input
                            type="number"
                            min={0}
                            max={task.targetQuantity ?? undefined}
                            value={task.completedQuantity}
                            onChange={(event) => updateQuantity(activityIndex, taskIndex, Number(event.target.value))}
                            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-black normal-case text-slate-900"
                          />
                        </label>
                        <div className="text-xs font-black uppercase text-slate-500">
                          Total
                          <div className="mt-1 rounded-lg bg-slate-100 px-3 py-2 text-sm font-black normal-case text-slate-900">
                            {task.targetQuantity} {task.unit}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <label className="mt-4 block text-xs font-black uppercase text-slate-500">
                        Pourcentage détecté
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={task.progress}
                          onChange={(event) => updateProgress(activityIndex, taskIndex, Number(event.target.value))}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-black normal-case text-slate-900"
                        />
                      </label>
                    )}
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${task.progress}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          <InfoCard icon={Building2} title="6 activités" text="Les grands titres du PDF deviennent les activités Casa-Port." />
          <InfoCard icon={BarChart3} title="Tâches détaillées" text="Chaque ligne devient une tâche, quantitative ou calculée par étapes." />
          <InfoCard icon={CheckCircle2} title="Validation avant écriture" text="Aucune donnée Supabase n’est modifiée avant votre confirmation." />
        </section>
      )}
    </div>
  );
}

function InfoCard({ icon: Icon, title, text }: { icon: typeof Building2; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-[var(--opc-border)] bg-white p-5 shadow-sm">
      <Icon className="size-6 text-[var(--opc-blue)]" />
      <p className="mt-3 font-black">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-500">{text}</p>
    </div>
  );
}
