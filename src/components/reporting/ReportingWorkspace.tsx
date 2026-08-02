"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  FileDown,
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { getTaskProgressPhotoUrls } from "@/app/tasks/actions";
import { createClient } from "@/lib/supabase/client";
import {
  downloadReportWord,
  type ReportExportData,
} from "@/lib/reporting/exports";
import { downloadReportPdf } from "@/lib/reporting/pdf-export";
import type { Activity } from "@/types/activity";
import type {
  CollaboratorOption,
  ZoneElementOption,
  ZoneOption,
} from "@/types/organization";

type ReportType = "daily" | "weekly" | "monthly";
type ReportTask = {
  id: string;
  activity_id: string | null;
  title: string;
  status: "todo" | "in_progress" | "blocked" | "done";
  progress: number;
  progress_mode: "manual" | "quantity" | "building";
  target_quantity: number | null;
  completed_quantity: number;
  progress_unit: string;
  start_date: string | null;
  due_date: string | null;
  alstom_supervisor_id: string | null;
  avanzit_site_manager_id: string | null;
};
type ProgressPhoto = {
  id: string;
  file_path: string;
  caption: string | null;
};
type ProgressUpdate = {
  id: string;
  task_id: string;
  update_date: string;
  progress: number;
  completed_quantity: number | null;
  work_done: string | null;
  ongoing_work: string | null;
  blockers: string | null;
  next_steps: string | null;
  comment: string | null;
  photos: ProgressPhoto[];
};
type ResourceDetails = {
  name: string;
  asset_type: "tool" | "machine";
  condition: string;
  calibration_required: boolean;
  next_calibration_date: string | null;
  technical_sheet_reference: string | null;
  technical_sheet_valid_until: string | null;
  inspection_valid_until: string | null;
  operator_authorization_required: boolean;
};
type TaskResource = {
  task_id: string;
  quality_tools: ResourceDetails | ResourceDetails[] | null;
};
type TaskEquipmentResource = {
  task_id: string;
  usage_status: string;
  project_equipment:
    | { name: string; equipment_type: string; status: string }
    | Array<{ name: string; equipment_type: string; status: string }>
    | null;
};
type TaskPrerequisiteStatus = {
  task_id: string;
  total_requirements: number;
  missing_certifications: number;
  missing_documents: number;
  invalid_tools: number;
  invalid_equipment: number;
  missing_manual_items: number;
};
type ProgressImport = {
  report_date: string;
  global_progress: number;
  source_file_name: string;
  zone_element_id: string | null;
};
type BuildingPhase = {
  task_id: string;
  code: string;
  label: string;
  progress: number;
  sort_order: number;
};

const reportLabels: Record<ReportType, string> = {
  daily: "Rapport journalier",
  weekly: "Rapport hebdomadaire",
  monthly: "Rapport mensuel",
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

function defaultPeriod(type: ReportType, reference: string) {
  if (type === "daily") return { start: reference, end: reference };
  return {
    start: reference,
    end: addDays(reference, type === "weekly" ? 6 : 29),
  };
}

function periodSubtitle(type: ReportType, start: string, end: string) {
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  const formatter = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  if (type === "daily") {
    return new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(startDate);
  }
  const duration = type === "weekly" ? "7 jours" : "30 jours";
  return `Du ${formatter.format(startDate)} au ${formatter.format(endDate)} (${duration})`;
}

export function ReportingWorkspace() {
  const supabase = useMemo(() => createClient(), []);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<ReportTask[]>([]);
  const [updates, setUpdates] = useState<ProgressUpdate[]>([]);
  const [collaborators, setCollaborators] = useState<CollaboratorOption[]>([]);
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [zoneElements, setZoneElements] = useState<ZoneElementOption[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [taskResources, setTaskResources] = useState<TaskResource[]>([]);
  const [taskEquipment, setTaskEquipment] = useState<TaskEquipmentResource[]>([]);
  const [taskPrerequisites, setTaskPrerequisites] =
    useState<TaskPrerequisiteStatus[]>([]);
  const [progressImports, setProgressImports] = useState<ProgressImport[]>([]);
  const [buildingPhases, setBuildingPhases] = useState<BuildingPhase[]>([]);
  const [type, setType] = useState<ReportType>("daily");
  const today = isoDate(new Date());
  const [periodStart, setPeriodStart] = useState(today);
  const [periodEnd, setPeriodEnd] = useState(today);
  const [selectedZoneIds, setSelectedZoneIds] = useState<string[]>([]);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [activityFilter, setActivityFilter] = useState("all");
  const [showOncfLogo, setShowOncfLogo] = useState(false);
  const [showAvanzitLogo, setShowAvanzitLogo] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState<"pdf" | "word" | null>(null);

  async function loadReporting() {
    setLoading(true);
    setError("");
    const project = await supabase
      .from("projects")
      .select("id")
      .eq("code", "PDD")
      .single();
    if (project.error) {
      setError(project.error.message);
      setLoading(false);
      return;
    }

    const [activityResult, taskResult, updateResult, peopleResult, zonesResult, elementsResult, progressImportsResult] =
      await Promise.all([
        supabase.from("activities").select("*").eq("project_id", project.data.id).order("code"),
        supabase
          .from("tasks")
          .select("id,activity_id,title,status,progress,progress_mode,target_quantity,completed_quantity,progress_unit,start_date,due_date,alstom_supervisor_id,avanzit_site_manager_id")
          .eq("project_id", project.data.id)
          .order("due_date"),
        supabase
          .from("task_progress_updates")
          .select("id,task_id,update_date,progress,completed_quantity,work_done,ongoing_work,blockers,next_steps,comment,photos:task_progress_photos(id,file_path,caption)")
          .eq("project_id", project.data.id)
          .order("update_date", { ascending: false }),
        supabase
          .from("collaborators")
          .select("id,full_name,company,role,profile,phone")
          .eq("project_id", project.data.id)
          .eq("active", true),
        supabase
          .from("zones")
          .select("id,code,name")
          .eq("project_id", project.data.id)
          .eq("active", true)
          .order("sort_order"),
        supabase
          .from("zone_elements")
          .select("id,zone_id,code,name,element_type")
          .eq("project_id", project.data.id)
          .eq("active", true),
        supabase
          .from("progress_imports")
          .select("report_date,global_progress,source_file_name,zone_element_id")
          .eq("project_id", project.data.id)
          .order("report_date", { ascending: true })
          .limit(200),
      ]);

    const firstError = [
      activityResult.error,
      taskResult.error,
      updateResult.error,
      peopleResult.error,
      zonesResult.error,
      elementsResult.error,
      progressImportsResult.error,
    ].find(Boolean);
    if (firstError) {
      setError(
        `Le reporting n’est pas encore disponible : ${firstError?.message}`,
      );
    } else {
      setActivities((activityResult.data ?? []) as Activity[]);
      setTasks((taskResult.data ?? []) as ReportTask[]);
      const loadedUpdates = (updateResult.data ?? []) as unknown as ProgressUpdate[];
      setUpdates(loadedUpdates);
      setCollaborators((peopleResult.data ?? []) as CollaboratorOption[]);
      setZones((zonesResult.data ?? []) as ZoneOption[]);
      setZoneElements((elementsResult.data ?? []) as ZoneElementOption[]);
      setProgressImports((progressImportsResult.data ?? []) as ProgressImport[]);
      const taskIds = (taskResult.data ?? []).map((task) => task.id);
      if (taskIds.length) {
        const [resourcesResult, equipmentLinkResult, prerequisiteResult, buildingPhasesResult] =
          await Promise.all([
            supabase
              .from("task_tools")
              .select(
                "task_id,quality_tools(name,asset_type,condition,calibration_required,next_calibration_date,technical_sheet_reference,technical_sheet_valid_until,inspection_valid_until,operator_authorization_required)",
              )
              .in("task_id", taskIds),
            supabase
              .from("task_equipment")
              .select(
                "task_id,usage_status,project_equipment(name,equipment_type,status)",
              )
              .in("task_id", taskIds),
            supabase
              .from("task_prerequisite_status")
              .select(
                "task_id,total_requirements,missing_certifications,missing_documents,invalid_tools,invalid_equipment,missing_manual_items",
              )
              .in("task_id", taskIds),
            supabase
              .from("task_building_phases")
              .select("task_id,code,label,progress,sort_order")
              .in("task_id", taskIds)
              .order("sort_order"),
          ]);
        if (!resourcesResult.error) {
          setTaskResources((resourcesResult.data ?? []) as TaskResource[]);
        }
        if (!equipmentLinkResult.error) {
          setTaskEquipment(
            (equipmentLinkResult.data ?? []) as TaskEquipmentResource[],
          );
        }
        if (!prerequisiteResult.error) {
          setTaskPrerequisites(
            (prerequisiteResult.data ?? []) as TaskPrerequisiteStatus[],
          );
        }
        if (!buildingPhasesResult.error) {
          setBuildingPhases(
            (buildingPhasesResult.data ?? []) as BuildingPhase[],
          );
        }
      }
      const paths = loadedUpdates.flatMap((update) =>
        (update.photos ?? []).map((photo) => photo.file_path),
      );
      setPhotoUrls(await getTaskProgressPhotoUrls(paths));
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial remote synchronization
    void loadReporting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const period = { start: periodStart, end: periodEnd };
  const filteredUpdates = updates.filter(
    (update) =>
      update.update_date >= period.start && update.update_date <= period.end,
  );
  const zoneName = (id: string | null) =>
    zones.find((zone) => zone.id === id)?.name ?? "Zone non définie";
  const selectedActivities = activities
    .filter(
      (activity) =>
        (!selectedZoneIds.length ||
          Boolean(activity.zone_id && selectedZoneIds.includes(activity.zone_id))) &&
        (!selectedElementIds.length ||
          Boolean(
            activity.zone_element_id &&
              selectedElementIds.includes(activity.zone_element_id),
          )) &&
        (activityFilter === "all" || activity.id === activityFilter),
    )
    .sort((left, right) => {
      const zoneOrder = zoneName(left.zone_id).localeCompare(
        zoneName(right.zone_id),
        "fr",
      );
      return zoneOrder || left.code.localeCompare(right.code, "fr");
    });
  const selectedActivityIds = new Set(
    selectedActivities.map((activity) => activity.id),
  );
  const relevantTasks = tasks.filter(
    (task) => Boolean(task.activity_id && selectedActivityIds.has(task.activity_id)),
  );
  const relevantTaskIds = new Set(relevantTasks.map((task) => task.id));
  const reportUpdates = filteredUpdates.filter((update) =>
    relevantTaskIds.has(update.task_id),
  );
  const isAutomaticCasaPortPlaceholder = (value: string | null) =>
    value?.trim() === "Travaux en cours selon le rapport global Casa-Port.";
  const isAutomaticCasaPortProgress = (value: string | null) =>
    value?.trim().startsWith("Relevé d’avancement Casa-Port :") ?? false;
  const completedWorkValues = reportUpdates
    .map((update) => update.work_done)
    .filter(
      (value): value is string =>
        Boolean(value) && !isAutomaticCasaPortProgress(value),
    );
  const ongoingWorkValues = reportUpdates
    .map((update) => update.ongoing_work)
    .filter(
      (value): value is string =>
        Boolean(value) && !isAutomaticCasaPortPlaceholder(value),
    );
  const reportActivities = selectedActivities;
  const photos = reportUpdates.flatMap((update) =>
    (update.photos ?? []).map((photo) => ({ ...photo, update })),
  );
  const completed = relevantTasks.filter((task) => task.status === "done").length;
  const blocked = relevantTasks.filter((task) => task.status === "blocked").length;
  const inProgress = relevantTasks.filter(
    (task) =>
      task.status === "in_progress" ||
      (task.status === "todo" && Number(task.progress) > 0),
  ).length;
  const notStarted = relevantTasks.filter(
    (task) => task.status === "todo" && Number(task.progress) <= 0,
  ).length;
  const averageProgress = relevantTasks.length
    ? Math.round(
        relevantTasks.reduce((total, task) => total + Number(task.progress || 0), 0) /
          relevantTasks.length,
      )
    : 0;
  const taskProgressAnalysis = (task: ReportTask) => {
    const taskUpdates = updates
      .filter((update) => update.task_id === task.id)
      .sort((left, right) =>
        left.update_date.localeCompare(right.update_date),
      );
    const beforePeriod = taskUpdates.filter(
      (update) => update.update_date < period.start,
    );
    const duringPeriod = taskUpdates.filter(
      (update) =>
        update.update_date >= period.start && update.update_date <= period.end,
    );
    const throughPeriod = taskUpdates.filter(
      (update) => update.update_date <= period.end,
    );
    const progressAtPeriodEnd = Number(
      throughPeriod.at(-1)?.progress ?? task.progress ?? 0,
    );
    const baseline = Number(
      beforePeriod.at(-1)?.progress ??
        duringPeriod.at(0)?.progress ??
        progressAtPeriodEnd,
    );
    const periodIncrease = Math.max(0, progressAtPeriodEnd - baseline);
    const targetQuantity = Number(task.target_quantity ?? 0);
    const baselineQuantity =
      task.progress_mode === "quantity"
        ? Number(
            beforePeriod.at(-1)?.completed_quantity ??
              duringPeriod.at(0)?.completed_quantity ??
              (targetQuantity * baseline) / 100,
          )
        : 0;
    const quantityAtPeriodEnd =
      task.progress_mode === "quantity"
        ? Number(
            throughPeriod.at(-1)?.completed_quantity ??
              (targetQuantity * progressAtPeriodEnd) / 100,
          )
        : 0;
    const periodOutput = Math.max(0, quantityAtPeriodEnd - baselineQuantity);
    const parentTaskCount = Math.max(
      1,
      tasks.filter((item) => item.activity_id === task.activity_id).length,
    );
    return {
      current: progressAtPeriodEnd,
      baseline,
      progressAtPeriodEnd,
      periodIncrease,
      quantityAtPeriodEnd,
      periodOutput,
      activityContribution: Number(task.progress || 0) / parentTaskCount,
      periodContribution: periodIncrease / parentTaskCount,
      parentTaskCount,
      hasHistoricalBaseline:
        beforePeriod.length > 0 || duringPeriod.length > 1,
    };
  };
  const averagePeriodIncrease = relevantTasks.length
    ? Math.round(
        (relevantTasks.reduce(
          (total, task) => total + taskProgressAnalysis(task).periodIncrease,
          0,
        ) /
          relevantTasks.length) *
          10,
      ) / 10
    : 0;
  const scopedImports = progressImports.filter((item) => {
    if (selectedElementIds.length) {
      return Boolean(
        item.zone_element_id && selectedElementIds.includes(item.zone_element_id),
      );
    }
    if (!selectedZoneIds.length || !item.zone_element_id) return true;
    const element = zoneElements.find(
      (candidate) => candidate.id === item.zone_element_id,
    );
    return Boolean(element?.zone_id && selectedZoneIds.includes(element.zone_id));
  });
  const importsThroughPeriod = scopedImports.filter(
    (item) => item.report_date <= period.end,
  );
  const latestGlobalImport = importsThroughPeriod.at(-1);
  const importsDuringPeriod = scopedImports.filter(
    (item) =>
      item.report_date >= period.start && item.report_date <= period.end,
  );
  const baselineGlobalImport = scopedImports
    .filter((item) => item.report_date < period.start)
    .at(-1);
  const globalProgress = Number(
    latestGlobalImport?.global_progress ?? averageProgress,
  );
  const globalBaseline = Number(
    baselineGlobalImport?.global_progress ??
      importsDuringPeriod.at(0)?.global_progress ??
      globalProgress,
  );
  const globalGain = Math.max(
    0,
    Math.round((globalProgress - globalBaseline) * 10) / 10,
  );
  const globalGainHasReference = Boolean(
    baselineGlobalImport || importsDuringPeriod.length > 1,
  );
  const activityProgressAnalysis = (activityId: string) => {
    const activityTasks = relevantTasks.filter(
      (task) => task.activity_id === activityId,
    );
    if (!activityTasks.length) {
      const activity = activities.find((item) => item.id === activityId);
      const progress = Number(activity?.progress ?? 0);
      return { baseline: progress, current: progress, gain: 0 };
    }
    const analyses = activityTasks.map(taskProgressAnalysis);
    const baseline =
      analyses.reduce((total, analysis) => total + analysis.baseline, 0) /
      analyses.length;
    const current =
      analyses.reduce(
        (total, analysis) => total + analysis.progressAtPeriodEnd,
        0,
      ) / analyses.length;
    return {
      baseline: Math.round(baseline * 10) / 10,
      current: Math.round(current * 10) / 10,
      gain: Math.round(Math.max(0, current - baseline) * 10) / 10,
    };
  };
  const collaboratorName = (id: string | null) =>
    collaborators.find((person) => person.id === id)?.full_name ?? "À affecter";
  const elementName = (id: string | null) =>
    zoneElements.find((element) => element.id === id)?.name;
  const taskName = (id: string) =>
    tasks.find((task) => task.id === id)?.title ?? "Tâche";
  const activityForTask = (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    return activities.find((activity) => activity.id === task?.activity_id);
  };
  const scopeTitle = selectedElementIds.length
    ? `Secteurs : ${zoneElements
        .filter((element) => selectedElementIds.includes(element.id))
        .map((element) => element.name)
        .join(", ")}`
    : selectedZoneIds.length
    ? `Zones : ${zones
        .filter((zone) => selectedZoneIds.includes(zone.id))
        .map((zone) => zone.name)
        .join(", ")}`
    : "Périmètre global - toutes les zones";
  const distinctLocationNames = [
    ...new Set(
      reportActivities.map(
        (activity) =>
          elementName(activity.zone_element_id) || zoneName(activity.zone_id),
      ),
    ),
  ];
  const locationTitle =
    selectedElementIds.length === 1
      ? elementName(selectedElementIds[0]) || "Secteur sélectionné"
      : distinctLocationNames.length === 1
      ? distinctLocationNames[0]
      : selectedZoneIds.length === 1
        ? zoneName(selectedZoneIds[0])
        : "GLOBAL - TOUTES LES ZONES";
  const taskStatusLabel = (task: ReportTask, progress: number) => {
    if (progress <= 0 && task.status === "todo") return "Non démarrée";
    if (task.status === "todo") return "En cours";
    if (task.status === "in_progress") return "En cours";
    if (task.status === "blocked") return "Bloquée";
    return "Terminée";
  };

  function buildExportData(): ReportExportData {
    return {
      showOncfLogo,
      showAvanzitLogo,
      reportTitle: reportLabels[type],
      periodTitle: periodSubtitle(type, period.start, period.end),
      periodRange: `${period.start} - ${period.end}`,
      scopeTitle,
      locationTitle,
      metrics: {
        completed,
        inProgress,
        blocked,
        notStarted,
        averageProgress,
        periodIncrease: averagePeriodIncrease,
        updates: reportUpdates.length,
        globalProgress,
        globalBaseline,
        globalGain,
        globalSource: latestGlobalImport
          ? `${latestGlobalImport.source_file_name} · ${latestGlobalImport.report_date}`
          : "Calcul OPC OS à partir des tâches",
        globalGainStatus: globalGainHasReference
          ? "Gain calculé depuis le relevé de référence"
          : "État initial - le gain commencera au prochain relevé",
      },
      activities: reportActivities.map((activity) => {
        const activityAnalysis = activityProgressAnalysis(activity.id);
        return {
        zone: zoneName(activity.zone_id),
        code: activity.code,
        name: activity.name,
        location:
          elementName(activity.zone_element_id) ||
          activity.zone ||
          "Zone non définie",
        alstom: collaboratorName(activity.alstom_supervisor_id),
        avanzit: collaboratorName(activity.avanzit_site_manager_id),
        baselineProgress: activityAnalysis.baseline,
        progress: activityAnalysis.current,
        periodIncrease: activityAnalysis.gain,
        tasks: relevantTasks
          .filter((task) => task.activity_id === activity.id)
          .sort((left, right) => left.title.localeCompare(right.title, "fr"))
          .map((task) => {
            const analysis = taskProgressAnalysis(task);
            const taskUpdates = reportUpdates.filter(
              (update) => update.task_id === task.id,
            );
            const prerequisite = taskPrerequisites.find(
              (item) => item.task_id === task.id,
            );
            const missingPrerequisites = prerequisite
              ? Number(prerequisite.missing_certifications) +
                Number(prerequisite.missing_documents) +
                Number(prerequisite.invalid_tools) +
                Number(prerequisite.invalid_equipment) +
                Number(prerequisite.missing_manual_items)
              : 0;
            return {
              title: task.title,
              alstom: collaboratorName(task.alstom_supervisor_id),
              avanzit: collaboratorName(task.avanzit_site_manager_id),
              status: taskStatusLabel(task, analysis.current),
              baselineProgress: analysis.baseline,
              currentProgress: analysis.current,
              periodIncrease: analysis.periodIncrease,
              measurement:
                task.progress_mode === "quantity"
                  ? `Réalisé ${Math.round(analysis.quantityAtPeriodEnd * 100) / 100} ${task.progress_unit || "u"} • Objectif ${Number(task.target_quantity ?? 0)} ${task.progress_unit || "u"}`
                  : task.progress_mode === "building"
                    ? `${buildingPhases.filter((phase) => phase.task_id === task.id).length} étapes de construction`
                    : "Échelle de mesure : 0 à 100 %",
              buildingSteps: buildingPhases
                .filter((phase) => phase.task_id === task.id)
                .sort((left, right) => left.sort_order - right.sort_order)
                .map((phase) => ({
                  label: phase.label,
                  progress: Number(phase.progress ?? 0),
                })),
              activityContribution: analysis.activityContribution,
              periodContribution: analysis.periodContribution,
              workSummary:
                taskUpdates
                  .map(
                    (update) =>
                      (!isAutomaticCasaPortProgress(update.work_done)
                        ? update.work_done
                        : null) ||
                      update.ongoing_work ||
                      update.comment,
                  )
                  .filter(Boolean)
                  .join(" · ") || "Aucune mise à jour saisie sur la période",
              prerequisiteStatus:
                prerequisite?.total_requirements && missingPrerequisites === 0
                  ? "Conforme"
                  : prerequisite?.total_requirements
                    ? "Non conforme"
                    : "À configurer",
              prerequisiteDetails: prerequisite
                ? [
                    prerequisite.missing_certifications
                      ? `${prerequisite.missing_certifications} habilitation(s)`
                      : "",
                    prerequisite.missing_documents
                      ? `${prerequisite.missing_documents} document(s)`
                      : "",
                    prerequisite.invalid_tools
                      ? `${prerequisite.invalid_tools} outil(s)/engin(s)`
                      : "",
                    prerequisite.invalid_equipment
                      ? `${prerequisite.invalid_equipment} équipement(s)`
                      : "",
                    prerequisite.missing_manual_items
                      ? `${prerequisite.missing_manual_items} contrôle(s)`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(", ") || "Tous les contrôles sont satisfaits"
                : "Aucun prérequis configuré",
            };
          }),
        };
      }),
      completedWork: completedWorkValues,
      ongoingWork: ongoingWorkValues,
      blockers: reportUpdates
        .map((update) => update.blockers)
        .filter(Boolean) as string[],
      nextSteps: reportUpdates
        .map((update) => update.next_steps)
        .filter(Boolean) as string[],
      photos: photos
        .filter((photo) => photoUrls[photo.file_path])
        .map((photo) => ({
          url: photoUrls[photo.file_path],
          activity:
            activityForTask(photo.update.task_id)?.name ?? "Activité",
          task: taskName(photo.update.task_id),
          date: photo.update.update_date,
          caption:
            photo.caption ||
            photo.update.comment ||
            (!isAutomaticCasaPortProgress(photo.update.work_done)
              ? photo.update.work_done
              : null) ||
            "Photo d’avancement",
        })),
      resources: {
        tools: [
          ...new Set(
            taskResources
              .filter(
                (link) =>
                  relevantTaskIds.has(link.task_id) &&
                  (Array.isArray(link.quality_tools)
                    ? link.quality_tools[0]?.asset_type
                    : link.quality_tools?.asset_type) === "tool",
              )
              .map((link) =>
                Array.isArray(link.quality_tools)
                  ? link.quality_tools[0]
                  : link.quality_tools,
              )
              .filter(Boolean)
              .map((tool) => {
                const calibration = tool?.calibration_required
                  ? `étalonnage ${tool.next_calibration_date ?? "non renseigné"}`
                  : "étalonnage RAS";
                return `${tool?.name} (${tool?.condition}, ${calibration})`;
              }),
          ),
        ],
        machines: [
          ...new Set(
            taskResources
              .filter(
                (link) =>
                  relevantTaskIds.has(link.task_id) &&
                  (Array.isArray(link.quality_tools)
                    ? link.quality_tools[0]?.asset_type
                    : link.quality_tools?.asset_type) === "machine",
              )
              .map((link) =>
                Array.isArray(link.quality_tools)
                  ? link.quality_tools[0]
                  : link.quality_tools,
              )
              .filter(Boolean)
              .map((machine) => {
                const sheet = machine?.technical_sheet_reference
                  ? `fiche ${machine.technical_sheet_reference}${
                      machine.technical_sheet_valid_until
                        ? ` valide jusqu’au ${machine.technical_sheet_valid_until}`
                        : ""
                    }`
                  : "fiche technique manquante";
                const inspection = machine?.inspection_valid_until
                  ? `inspection valide jusqu’au ${machine.inspection_valid_until}`
                  : "inspection RAS";
                const authorization = machine?.operator_authorization_required
                  ? "habilitation opérateur requise"
                  : "habilitation RAS";
                return `${machine?.name} (${machine?.condition}, ${sheet}, ${inspection}, ${authorization})`;
              }),
          ),
        ],
        equipment: [
          ...new Set(
            taskEquipment
              .filter((link) => relevantTaskIds.has(link.task_id))
              .map((link) => {
                const item = Array.isArray(link.project_equipment)
                  ? link.project_equipment[0]
                  : link.project_equipment;
                return item
                  ? `${item.name} (${link.usage_status}, ${item.status})`
                  : "";
              })
              .filter(Boolean),
          ),
        ],
      },
    };
  }

  async function exportPdf() {
    setExporting("pdf");
    setError("");
    try {
      await downloadReportPdf(
        buildExportData(),
        `rapport-${type}-pdd-${period.start}-${period.end}.pdf`,
      );
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Impossible de générer le PDF.",
      );
    }
    setExporting(null);
  }

  async function exportWord() {
    setExporting("word");
    setError("");
    try {
      await downloadReportWord(
        buildExportData(),
        `rapport-${type}-pdd-${period.start}-${period.end}.docx`,
      );
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Impossible de générer le document Word.",
      );
    }
    setExporting(null);
  }

  function changeReportType(nextType: ReportType) {
    setType(nextType);
    const nextPeriod = defaultPeriod(nextType, periodStart);
    setPeriodStart(nextPeriod.start);
    setPeriodEnd(nextPeriod.end);
  }

  function changePeriodStart(value: string) {
    if (!value) return;
    setPeriodStart(value);
    setPeriodEnd(
      type === "daily" ? value : addDays(value, type === "weekly" ? 6 : 29),
    );
  }

  function changePeriodEnd(value: string) {
    if (!value) return;
    setPeriodEnd(value);
    setPeriodStart(
      type === "daily" ? value : addDays(value, type === "weekly" ? -6 : -29),
    );
  }

  function toggleZone(zoneId: string) {
    setSelectedZoneIds((current) =>
      current.includes(zoneId)
        ? current.filter((id) => id !== zoneId)
        : [...current, zoneId],
    );
    setSelectedElementIds([]);
    setActivityFilter("all");
  }

  function toggleElement(elementId: string) {
    setSelectedElementIds((current) =>
      current.includes(elementId)
        ? current.filter((id) => id !== elementId)
        : [...current, elementId],
    );
    setActivityFilter("all");
  }

  return (
    <div className="mx-auto max-w-[1700px]">
      <div className="no-print flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--opc-red)]">
            Reporting opérationnel
          </p>
          <h1 className="mt-2 text-4xl font-black">Rapports projet PDD</h1>
          <p className="mt-2 text-sm text-[var(--opc-muted)]">
            Génération réactive depuis les activités, les tâches et leurs journaux d’avancement.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowOncfLogo((current) => !current)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-black ${
              showOncfLogo
                ? "border-[var(--opc-blue)] bg-blue-50 text-[var(--opc-blue)]"
                : "border-[var(--opc-border)] bg-white text-slate-600"
            }`}
          >
            {showOncfLogo ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
            Logo ONCF
          </button>
          <button
            type="button"
            onClick={() => setShowAvanzitLogo((current) => !current)}
            className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-black ${
              showAvanzitLogo
                ? "border-[var(--opc-blue)] bg-blue-50 text-[var(--opc-blue)]"
                : "border-[var(--opc-border)] bg-white text-slate-600"
            }`}
          >
            {showAvanzitLogo ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
            Logo AVANZIT
          </button>
          <button type="button" onClick={() => void loadReporting()} className="flex items-center gap-2 rounded-xl border border-[var(--opc-border)] bg-white px-4 py-3 text-sm font-bold">
            <RefreshCw className="h-4 w-4" /> Actualiser
          </button>
          <button type="button" disabled={Boolean(exporting)} onClick={() => void exportPdf()} className="flex items-center gap-2 rounded-xl bg-[var(--opc-red)] px-4 py-3 text-sm font-black text-white disabled:opacity-60">
            {exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Télécharger PDF
          </button>
          <button type="button" disabled={Boolean(exporting)} onClick={() => void exportWord()} className="flex items-center gap-2 rounded-xl bg-[var(--opc-blue)] px-4 py-3 text-sm font-black text-white disabled:opacity-60">
            {exporting === "word" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Télécharger Word
          </button>
        </div>
      </div>

      <section className="no-print mt-6 grid gap-4 rounded-2xl border border-[var(--opc-border)] bg-white p-4 shadow-sm xl:grid-cols-4">
        <label className="block">
          <span className="text-xs font-black uppercase text-slate-500">Type de rapport</span>
          <select value={type} onChange={(event) => changeReportType(event.target.value as ReportType)} className="mt-2 w-full rounded-xl border border-[var(--opc-border)] bg-white px-3 py-3 text-sm font-bold">
            {Object.entries(reportLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-black uppercase text-slate-500">
            {type === "daily" ? "Date du rapport" : "Date de début"}
          </span>
          <input type="date" value={periodStart} onChange={(event) => changePeriodStart(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--opc-border)] px-3 py-3 text-sm font-bold" />
        </label>
        {type !== "daily" ? (
          <label className="block">
            <span className="text-xs font-black uppercase text-slate-500">
              Date de fin ({type === "weekly" ? "7 jours" : "30 jours"})
            </span>
            <input type="date" value={periodEnd} onChange={(event) => changePeriodEnd(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--opc-border)] px-3 py-3 text-sm font-bold" />
          </label>
        ) : null}
        <label className="block">
          <span className="text-xs font-black uppercase text-slate-500">Activité</span>
          <select value={activityFilter} onChange={(event) => setActivityFilter(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--opc-border)] bg-white px-3 py-3 text-sm font-bold">
            <option value="all">Toutes les activités</option>
            {activities
              .filter(
                (activity) =>
                  (!selectedZoneIds.length ||
                    Boolean(activity.zone_id && selectedZoneIds.includes(activity.zone_id))) &&
                  (!selectedElementIds.length ||
                    Boolean(
                      activity.zone_element_id &&
                        selectedElementIds.includes(activity.zone_element_id),
                    )),
              )
              .map((activity) => <option key={activity.id} value={activity.id}>{activity.code} — {activity.name}</option>)}
          </select>
        </label>
        <div className="xl:col-span-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-black uppercase text-slate-500">
              Périmètre des zones
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedZoneIds([]);
                setSelectedElementIds([]);
                setActivityFilter("all");
              }}
              className={`rounded-full px-3 py-1 text-xs font-black ${
                selectedZoneIds.length
                  ? "bg-slate-100 text-slate-600"
                  : "bg-[var(--opc-blue)] text-white"
              }`}
            >
              Global - toutes les zones
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {zones.map((zone) => {
              const selected = selectedZoneIds.includes(zone.id);
              return (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => toggleZone(zone.id)}
                  className={`rounded-xl border px-4 py-2 text-sm font-bold transition ${
                    selected
                      ? "border-[var(--opc-red)] bg-red-50 text-[var(--opc-red)]"
                      : "border-[var(--opc-border)] bg-white text-slate-600"
                  }`}
                >
                  {selected ? "✓ " : ""}
                  {zone.name}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {selectedZoneIds.length
              ? `${selectedZoneIds.length} zone(s) sélectionnée(s).`
              : "Rapport global couvrant toutes les zones."}
          </p>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-black uppercase text-slate-500">
                Secteur / élément de zone
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedElementIds([]);
                  setActivityFilter("all");
                }}
                className={`rounded-full px-3 py-1 text-xs font-black ${
                  selectedElementIds.length
                    ? "bg-slate-100 text-slate-600"
                    : "bg-[var(--opc-blue)] text-white"
                }`}
              >
                Tous les secteurs
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {zoneElements
                .filter(
                  (element) =>
                    !selectedZoneIds.length ||
                    selectedZoneIds.includes(element.zone_id),
                )
                .map((element) => {
                  const selected = selectedElementIds.includes(element.id);
                  return (
                    <button
                      key={element.id}
                      type="button"
                      onClick={() => toggleElement(element.id)}
                      className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                        selected
                          ? "border-[var(--opc-blue)] bg-blue-50 text-[var(--opc-blue)]"
                          : "border-[var(--opc-border)] bg-white text-slate-600"
                      }`}
                    >
                      {selected ? "✓ " : ""}
                      {element.name}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      </section>

      {error ? <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}
      {loading ? <div className="grid min-h-80 place-items-center"><Loader2 className="h-8 w-8 animate-spin text-[var(--opc-blue)]" /></div> : null}

      {!loading ? (
        <article className="report-sheet mt-6 overflow-hidden rounded-2xl border border-[var(--opc-border)] bg-white shadow-lg">
          <header className="grid min-h-28 grid-cols-[180px_1fr_180px] items-center gap-5 bg-[var(--opc-red)] px-6 py-5 text-white">
            <div className="flex h-16 items-center justify-center p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/alstom-logo.png" alt="Alstom" className="h-auto max-h-12 w-auto max-w-full object-contain brightness-0 invert" />
            </div>
            <div className="text-center">
              {showOncfLogo ? (
                <p className="mb-2 text-2xl font-black tracking-[0.12em] text-white">
                  ONCF
                </p>
              ) : null}
              <p className="text-sm font-black uppercase tracking-[0.13em]">
                MARCHÉ N° 625C07
              </p>
              <p className="mt-2 text-lg font-black uppercase leading-tight">
                PROGRAMME DE DÉVELOPPEMENT
              </p>
            </div>
            <div className="flex h-16 items-center justify-center p-2">
              {showAvanzitLogo ? (
                <span className="text-3xl font-black tracking-[0.1em] text-white">
                  AVANZIT
                </span>
              ) : null}
            </div>
          </header>

          <div className="border-b border-[var(--opc-border)] px-8 py-6 text-center">
            <h2 className="text-2xl font-black uppercase text-[var(--opc-ink)]">{reportLabels[type]}</h2>
            <p className="mt-3 text-3xl font-black uppercase tracking-[0.08em] text-[var(--opc-red)]">
              {locationTitle}
            </p>
            <p className="mt-2 font-bold capitalize text-[var(--opc-blue)]">{periodSubtitle(type, period.start, period.end)}</p>
            <p className="mt-1 text-xs text-slate-500">{period.start} → {period.end}</p>
            <p className="mt-2 text-xs font-black uppercase text-[var(--opc-red)]">{scopeTitle}</p>
          </div>

          <div className="p-8">
            <section>
              <h3 className="border-b-2 border-[var(--opc-red)] pb-2 text-lg font-black uppercase">
                1. Synthèse exécutive
              </h3>
              <div className="mt-4 rounded-2xl bg-[var(--opc-ink)] p-6 text-white">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-200">
                      Avancement global
                    </p>
                    <p className="mt-2 text-5xl font-black">{globalProgress}%</p>
                    <p className="mt-2 text-xs text-slate-300">
                      {latestGlobalImport
                        ? `Source : ${latestGlobalImport.source_file_name} · ${latestGlobalImport.report_date}`
                        : "Source : moyenne des tâches OPC OS"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-emerald-400/15 px-5 py-3 text-right">
                    <p className="text-[10px] font-black uppercase tracking-wide text-emerald-200">Gain période</p>
                    <p className="mt-1 text-3xl font-black text-emerald-300">
                      {globalGainHasReference ? `+${globalGain}%` : "État initial"}
                    </p>
                    <p className="mt-1 max-w-56 text-[9px] font-semibold text-emerald-100">
                      {globalGainHasReference
                        ? "Comparé au relevé précédent"
                        : "Le gain commencera au prochain relevé"}
                    </p>
                  </div>
                </div>
                <SegmentedProgressBar
                  baseline={globalBaseline}
                  current={globalProgress}
                  gain={globalGain}
                  dark
                  large
                />
                <div className="mt-3 flex flex-wrap gap-4 text-[10px] font-bold text-slate-300">
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-600" /> Acquis avant période {globalBaseline}%</span>
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-300" /> Gain +{globalGain}%</span>
                  <span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-slate-600" /> Reste {Math.max(0, Math.round((100 - globalProgress) * 10) / 10)}%</span>
                </div>
                <div className="mt-5 grid gap-3 border-t border-white/10 pt-5 md:grid-cols-2">
                  {reportActivities.map((activity) => {
                    const analysis = activityProgressAnalysis(activity.id);
                    return (
                      <div key={activity.id} className="rounded-xl bg-white/5 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="min-w-0 truncate text-[10px] font-black uppercase tracking-wide text-slate-200">
                            {activity.code} · {activity.name}
                          </p>
                          <div className="flex shrink-0 items-center gap-2">
                            <strong className="text-sm text-white">{analysis.current}%</strong>
                            <span className="text-[10px] font-black text-emerald-300">+{analysis.gain}%</span>
                          </div>
                        </div>
                        <SegmentedProgressBar baseline={analysis.baseline} current={analysis.current} gain={analysis.gain} dark compact />
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                <Metric icon={CheckCircle2} label="Terminées" value={completed} tone="green" />
                <Metric icon={Clock3} label="En cours" value={inProgress} tone="blue" />
                <Metric icon={Clock3} label="Non démarrées" value={notStarted} />
                <Metric icon={AlertTriangle} label="Bloquées" value={blocked} tone="red" />
                <Metric icon={CalendarDays} label="Mises à jour" value={reportUpdates.length} />
              </div>
            </section>

            <section className="mt-8">
              <h3 className="border-b-2 border-[var(--opc-red)] pb-2 text-lg font-black uppercase">2. Avancement par activité</h3>
              <div className="mt-4 space-y-5">
                {reportActivities.map((activity) => {
                  const activityTasks = relevantTasks.filter((task) => task.activity_id === activity.id);
                  const activityAnalysis = activityProgressAnalysis(activity.id);
                  return (
                    <div key={activity.id} className="overflow-hidden rounded-2xl border border-[var(--opc-border)] bg-white shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="w-full bg-slate-50 px-5 py-4">
                          <div className="flex flex-wrap items-center justify-between gap-4">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-wide text-[var(--opc-red)]">
                                {activity.code} · {zoneName(activity.zone_id)} · {elementName(activity.zone_element_id) || activity.zone}
                              </p>
                              <h4 className="mt-1 text-base font-black">{activity.name}</h4>
                            </div>
                            <div className="flex items-center gap-5">
                              <p className="text-2xl font-black text-[var(--opc-blue)]">{activityAnalysis.current}%</p>
                              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">+{activityAnalysis.gain}%</span>
                            </div>
                          </div>
                          <SegmentedProgressBar baseline={activityAnalysis.baseline} current={activityAnalysis.current} gain={activityAnalysis.gain} />
                        </div>
                      </div>
                      <div className="divide-y divide-slate-100 px-5">
                            {activityTasks.map((task) => {
                              const analysis = taskProgressAnalysis(task);
                              const prerequisite = taskPrerequisites.find(
                                (item) => item.task_id === task.id,
                              );
                              const prerequisiteMissing = prerequisite
                                ? Number(prerequisite.missing_certifications) +
                                  Number(prerequisite.missing_documents) +
                                  Number(prerequisite.invalid_tools) +
                                  Number(prerequisite.invalid_equipment) +
                                  Number(prerequisite.missing_manual_items)
                                : 0;
                              return (
                                <div key={task.id} className="py-3">
                                  <div className="grid items-center gap-3 md:grid-cols-[minmax(180px,0.85fr)_minmax(260px,1.5fr)_90px]">
                                    <div className="min-w-0">
                                    <p className="truncate text-xs font-black">{task.title}</p>
                                    <p className="mt-1 flex items-center gap-2 text-[9px] font-bold uppercase text-slate-400">
                                      <span className={`h-2 w-2 rounded-full ${task.status === "done" ? "bg-emerald-500" : task.status === "blocked" ? "bg-red-500" : task.status === "todo" && analysis.current <= 0 ? "bg-slate-400" : "bg-blue-500"}`} />
                                      {taskStatusLabel(task, analysis.current)}
                                      <span className={prerequisite?.total_requirements && prerequisiteMissing === 0 ? "text-emerald-600" : "text-amber-600"}>
                                        · {prerequisite?.total_requirements && prerequisiteMissing === 0 ? "Prérequis OK" : "Prérequis à vérifier"}
                                      </span>
                                    </p>
                                    <p className="mt-2 inline-flex rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-800">
                                      {task.progress_mode === "quantity"
                                        ? `Réalisé ${Math.round(analysis.quantityAtPeriodEnd * 100) / 100} ${task.progress_unit || "u"} / ${Number(task.target_quantity ?? 0)} ${task.progress_unit || "u"}`
                                        : task.progress_mode === "building"
                                          ? `${buildingPhases.filter((phase) => phase.task_id === task.id).length} étapes de construction`
                                          : "Mesure en pourcentage"}
                                    </p>
                                    </div>
                                    <SegmentedProgressBar baseline={analysis.baseline} current={analysis.current} gain={analysis.periodIncrease} compact />
                                    <div className="text-right">
                                      <p className="text-2xl font-black text-emerald-700">{analysis.current}%</p>
                                      <p className="text-xs font-black text-emerald-600">+{analysis.periodIncrease}%</p>
                                    </div>
                                  </div>
                                  {task.progress_mode === "building" ? (
                                    <div className="mt-3 grid gap-x-5 gap-y-2 rounded-xl bg-slate-50 p-3 md:grid-cols-2">
                                      {buildingPhases
                                        .filter((phase) => phase.task_id === task.id)
                                        .sort((left, right) => left.sort_order - right.sort_order)
                                        .map((phase) => (
                                          <div key={phase.code} className="grid grid-cols-[minmax(120px,1fr)_minmax(100px,1.2fr)_46px] items-center gap-2 rounded-lg bg-white px-2 py-1.5">
                                            <span className="truncate text-[11px] font-black text-slate-700">{phase.label}</span>
                                            <SegmentedProgressBar baseline={Number(phase.progress)} current={Number(phase.progress)} gain={0} compact />
                                            <span className="text-right text-xs font-black text-emerald-700">{Number(phase.progress)}%</span>
                                          </div>
                                        ))}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                      </div>
                    </div>
                  );
                })}
                {!reportActivities.length ? (
                  <div className="rounded-xl border border-dashed border-[var(--opc-border)] p-10 text-center text-sm font-bold text-slate-400">
                    Aucune activité dans le périmètre sélectionné.
                  </div>
                ) : null}
              </div>
            </section>

            <section className="mt-8">
              <h3 className="border-b-2 border-[var(--opc-red)] pb-2 text-lg font-black uppercase">
                3. Ressources mobilisées
              </h3>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <ReportList
                  title="Outillages"
                  values={buildExportData().resources.tools}
                />
                <ReportList
                  title="Engins"
                  values={buildExportData().resources.machines}
                />
                <ReportList
                  title="Équipements / matériaux"
                  values={buildExportData().resources.equipment}
                />
              </div>
            </section>

            <section className="mt-8">
              <h3 className="border-b-2 border-[var(--opc-red)] pb-2 text-lg font-black uppercase">
                4. Production, contraintes et prévisions
              </h3>
              <div className="mt-4">
                <ReportList title="4.1 Travaux réalisés" values={completedWorkValues} />
                <div className="mt-5 break-before-page rounded-2xl border border-[var(--opc-border)] bg-slate-50 p-5">
                  <h4 className="text-sm font-black uppercase text-[var(--opc-ink)]">Photos des travaux réalisés</h4>
                  <div className="mt-4 space-y-6">
                  {reportActivities.map((activity) => {
                    const activityTaskIds = new Set(
                      tasks
                        .filter((task) => task.activity_id === activity.id)
                        .map((task) => task.id),
                    );
                    const activityPhotos = photos.filter((photo) =>
                      activityTaskIds.has(photo.update.task_id),
                    );
                    if (!activityPhotos.length) return null;
                    return (
                      <section key={activity.id} className="rounded-xl border border-[var(--opc-border)] p-4">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-black text-[var(--opc-red)]">{activity.code}</p>
                            <h4 className="font-black">{activity.name}</h4>
                          </div>
                          <p className="text-xs text-slate-500">{activityPhotos.length} photo(s)</p>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                          {activityPhotos.map((photo, index) => (
                            <figure key={photo.id} className="overflow-hidden rounded-xl border border-[var(--opc-border)] bg-white">
                              <div className="aspect-[4/3] bg-slate-100">
                                {photoUrls[photo.file_path] ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={photoUrls[photo.file_path]} alt={photo.caption || taskName(photo.update.task_id)} className="h-full w-full object-cover" />
                                ) : null}
                              </div>
                              <figcaption className="border-t border-slate-100 p-3 text-xs">
                                <p className="font-black text-[var(--opc-blue)]">Photo {index + 1} — {taskName(photo.update.task_id)}</p>
                                <p className="mt-1 text-slate-500">{photo.update.update_date}</p>
                                <p className="mt-2 leading-5 text-slate-600">
                                  {photo.caption ||
                                    photo.update.comment ||
                                    (!isAutomaticCasaPortProgress(photo.update.work_done)
                                      ? photo.update.work_done
                                      : null) ||
                                    "Photo d’avancement"}
                                </p>
                              </figcaption>
                            </figure>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                  {!photos.length ? (
                    <div className="rounded-xl border border-dashed border-[var(--opc-border)] p-10 text-center text-sm font-bold text-slate-400">
                      Aucune photo d’avancement enregistrée pour cette période.
                    </div>
                  ) : null}
                  </div>
                </div>
                <div className="mt-5 grid gap-5 md:grid-cols-3">
                  <ReportList title="4.2 Travaux en cours" values={ongoingWorkValues} />
                  <ReportList title="4.3 Blocages / risques / alertes" values={reportUpdates.map((update) => update.blockers).filter(Boolean) as string[]} red />
                  <ReportList title="4.4 Prochaines étapes" values={reportUpdates.map((update) => update.next_steps).filter(Boolean) as string[]} />
                </div>
              </div>
            </section>

            <section className="mt-8">
              <h3 className="border-b-2 border-[var(--opc-red)] pb-2 text-lg font-black uppercase">
                5. Visa et validation
              </h3>
              <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-xl border border-[var(--opc-border)]">
                <div className="border-r border-[var(--opc-border)] p-5">
                  <p className="text-center text-sm font-black text-[var(--opc-blue)]">ALSTOM</p>
                  <div className="mt-16 border-t border-slate-300 pt-2 text-center text-xs text-slate-400">Nom, date et signature</div>
                </div>
                <div className="p-5">
                  <p className="text-center text-sm font-black text-slate-700">AVANZIT</p>
                  <div className="mt-16 border-t border-slate-300 pt-2 text-center text-xs text-slate-400">Nom, date et signature</div>
                </div>
              </div>
            </section>

            <footer className="mt-10 border-t border-slate-200 pt-4 text-center text-[10px] uppercase tracking-wide text-slate-400">
              OPC OS — Rapport généré automatiquement depuis les données opérationnelles du projet PDD
            </footer>
          </div>
        </article>
      ) : null}

      <style jsx global>{`
        @media print {
          body { background: white !important; }
          .no-print, aside, nav { display: none !important; }
          main { padding: 0 !important; margin: 0 !important; }
          .report-sheet { margin: 0 !important; border: 0 !important; box-shadow: none !important; }
          .break-before-page { break-before: page; }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone = "slate",
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: string | number;
  tone?: "slate" | "green" | "blue" | "red";
}) {
  const colors = {
    slate: "bg-slate-50 text-slate-700",
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    red: "bg-red-50 text-red-700",
  };
  return (
    <div className={`rounded-xl p-4 ${colors[tone]}`}>
      <Icon className="h-5 w-5" />
      <p className="mt-3 text-2xl font-black">{value}</p>
      <p className="mt-1 text-[10px] font-black uppercase">{label}</p>
    </div>
  );
}

function SegmentedProgressBar({
  baseline,
  current,
  gain,
  compact = false,
  large = false,
  dark = false,
}: {
  baseline: number;
  current: number;
  gain: number;
  compact?: boolean;
  large?: boolean;
  dark?: boolean;
}) {
  const safeBaseline = Math.max(0, Math.min(100, baseline));
  const safeCurrent = Math.max(safeBaseline, Math.min(100, current));
  const safeGain = Math.max(0, Math.min(safeCurrent - safeBaseline, gain));
  const acquiredWidth = Math.max(0, safeCurrent - safeGain);
  return (
    <div
      className={`${compact ? "mt-0" : "mt-4"} ${large ? "h-5" : compact ? "h-2.5" : "h-3"} flex w-full overflow-hidden rounded-full ${dark ? "bg-slate-700" : "bg-slate-200"}`}
      role="img"
      aria-label={`Avancement ${safeCurrent}%, dont gain de période ${safeGain}%`}
    >
      <span className="h-full bg-emerald-600" style={{ width: `${acquiredWidth}%` }} />
      <span className="h-full bg-emerald-300" style={{ width: `${safeGain}%` }} />
    </div>
  );
}

function ReportList({
  title,
  values,
  red = false,
}: {
  title: string;
  values: string[];
  red?: boolean;
}) {
  return (
    <section className={`rounded-xl border p-4 ${red ? "border-red-200 bg-red-50/50" : "border-[var(--opc-border)]"}`}>
      <h3 className={`text-sm font-black uppercase ${red ? "text-red-700" : ""}`}>{title}</h3>
      {values.length ? (
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">
          {values.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-400">Aucune information saisie.</p>
      )}
    </section>
  );
}
