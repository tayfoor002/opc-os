"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const stepSchema = z.object({
  code: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(160),
  progress: z.number().min(0).max(100),
});

const taskSchema = z.object({
  key: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(250),
  progressMode: z.enum(["manual", "quantity", "building"]),
  workType: z.enum(["standard", "gc_building"]),
  progress: z.number().min(0).max(100),
  targetQuantity: z.number().positive().nullable(),
  completedQuantity: z.number().min(0),
  unit: z.string().trim().min(1).max(20),
  steps: z.array(stepSchema).max(30),
});

const activitySchema = z.object({
  key: z.string().trim().min(1).max(80),
  code: z.string().trim().min(1).max(30),
  title: z.string().trim().min(1).max(250),
  progress: z.number().min(0).max(100),
  tasks: z.array(taskSchema).min(1).max(40),
});

const importSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  globalProgress: z.number().min(0).max(100),
  activities: z.array(activitySchema).length(6),
});

export type CasaportImportResult =
  | {
      success: true;
      activitiesUpdated: number;
      tasksUpdated: number;
      reportDate: string;
    }
  | { success: false; error: string };

function taskStatus(progress: number) {
  if (progress >= 100) return "done";
  if (progress > 0) return "in_progress";
  return "todo";
}

function activityStatus(progress: number) {
  if (progress >= 100) return "completed";
  if (progress > 0) return "in_progress";
  return "not_started";
}

function migrationError(message: string) {
  return (
    message.includes("external_progress_key") ||
    message.includes("progress_imports") ||
    message.includes("source_file_name") ||
    message.includes("schema cache")
  );
}

function normalizedLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function activityMatches(existingName: string, targetKey: string) {
  const value = normalizedLabel(existingName);
  const tokens: Record<string, string[]> = {
    buildings: ["batiment", "genie civil"],
    arteries: ["artere", "cable"],
    massifs: ["massif"],
    masts: ["mat", "potence", "portique"],
    campaign: ["campagne", "installation sol"],
    posts: ["poste technique", "equipement interieur"],
  };
  return (tokens[targetKey] ?? []).some((token) => value.includes(token));
}

function collaboratorMatches(actualName: string, expectedTokens: string[]) {
  const actualTokens = normalizedLabel(actualName)
    .replace(/(.)\1+/g, "$1")
    .split(" ");
  return expectedTokens.every((expected) =>
    actualTokens.some(
      (actual) => actual.startsWith(expected) || expected.startsWith(actual),
    ),
  );
}

export async function applyCasaportProgressImport(
  input: unknown,
): Promise<CasaportImportResult> {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Les données détectées dans le rapport sont incomplètes ou invalides.",
    };
  }

  const data = parsed.data;
  const supabase = await createClient();
  const projectResult = await supabase
    .from("projects")
    .select("id")
    .eq("code", "PDD")
    .maybeSingle();
  if (projectResult.error || !projectResult.data) {
    return { success: false, error: "Le projet PDD est introuvable." };
  }
  const projectId = projectResult.data.id;

  const collaboratorsResult = await supabase
    .from("collaborators")
    .select("id,full_name,company")
    .eq("project_id", projectId)
    .eq("active", true);
  if (collaboratorsResult.error) {
    return { success: false, error: collaboratorsResult.error.message };
  }
  const alstomSupervisor = (collaboratorsResult.data ?? []).find(
    (person) =>
      normalizedLabel(person.company).includes("alstom") &&
      collaboratorMatches(person.full_name, ["ahmed", "adar"]),
  );
  const alstomSupervisorId = alstomSupervisor?.id;
  const avanzitSiteManagerId = (collaboratorsResult.data ?? []).find(
    (person) =>
      normalizedLabel(person.company).includes("avanzit") &&
      collaboratorMatches(person.full_name, ["soufiane", "ait", "taleb"]),
  )?.id;

  const zoneResult = await supabase
    .from("zones")
    .select("id")
    .eq("project_id", projectId)
    .eq("code", "Z1")
    .maybeSingle();
  if (zoneResult.error || !zoneResult.data) {
    return { success: false, error: "La zone Casa (Z1) est introuvable." };
  }
  const zoneId = zoneResult.data.id;

  const [phaseResult, elementResult] = await Promise.all([
    supabase
      .from("phases")
      .select("id")
      .eq("project_id", projectId)
      .eq("zone_id", zoneId)
      .eq("code", "PH1")
      .maybeSingle(),
    supabase
      .from("zone_elements")
      .select("id")
      .eq("project_id", projectId)
      .eq("zone_id", zoneId)
      .eq("code", "CASA-PORT")
      .maybeSingle(),
  ]);
  if (phaseResult.error || !phaseResult.data) {
    return { success: false, error: "La Phase 1 de la zone Casa est introuvable." };
  }
  if (elementResult.error || !elementResult.data) {
    return { success: false, error: "L’élément de zone Casa-Port est introuvable." };
  }
  const phaseId = phaseResult.data.id;
  const zoneElementId = elementResult.data.id;

  const existingActivities = await supabase
    .from("activities")
    .select("id,name,external_progress_key")
    .eq("project_id", projectId)
    .eq("zone_element_id", zoneElementId);
  if (existingActivities.error) {
    return {
      success: false,
      error: migrationError(existingActivities.error.message)
        ? "Exécutez d’abord la migration 016_casaport_progress_import.sql dans Supabase."
        : existingActivities.error.message,
    };
  }
  for (const target of data.activities) {
    const reusable = (existingActivities.data ?? []).find(
      (activity) =>
        !activity.external_progress_key &&
        activityMatches(activity.name, target.key),
    );
    if (!reusable) continue;
    const adopted = await supabase
      .from("activities")
      .update({
        external_progress_key: `casaport:${target.key}`,
        code: target.code,
        name: target.title,
      })
      .eq("id", reusable.id);
    if (adopted.error) {
      return { success: false, error: adopted.error.message };
    }
    reusable.external_progress_key = `casaport:${target.key}`;
  }

  const activityRows = data.activities.map((activity) => ({
    project_id: projectId,
    zone_id: zoneId,
    phase_id: phaseId,
    zone_element_id: zoneElementId,
    external_progress_key: `casaport:${activity.key}`,
    code: activity.code,
    name: activity.title,
    zone: "Casa-Port",
    progress: activity.progress,
    status: activityStatus(activity.progress),
    critical: false,
  }));
  const activitiesResult = await supabase
    .from("activities")
    .upsert(activityRows, {
      onConflict: "project_id,external_progress_key",
    })
    .select("id,external_progress_key");
  if (activitiesResult.error) {
    return {
      success: false,
      error: migrationError(activitiesResult.error.message)
        ? "Exécutez d’abord la migration 016_casaport_progress_import.sql dans Supabase."
        : activitiesResult.error.message,
    };
  }
  const activityIds = new Map(
    (activitiesResult.data ?? []).map((activity) => [
      activity.external_progress_key,
      activity.id,
    ]),
  );
  const importedActivityIds = [...activityIds.values()];
  if (alstomSupervisorId && importedActivityIds.length) {
    const assignment = await supabase
      .from("activities")
      .update({ alstom_supervisor_id: alstomSupervisorId })
      .in("id", importedActivityIds)
      .is("alstom_supervisor_id", null);
    if (assignment.error) return { success: false, error: assignment.error.message };
  }
  if (avanzitSiteManagerId && importedActivityIds.length) {
    const assignment = await supabase
      .from("activities")
      .update({ avanzit_site_manager_id: avanzitSiteManagerId })
      .in("id", importedActivityIds)
      .is("avanzit_site_manager_id", null);
    if (assignment.error) return { success: false, error: assignment.error.message };
  }

  const taskRows = data.activities.flatMap((activity) => {
    const activityId = activityIds.get(`casaport:${activity.key}`);
    if (!activityId) return [];
    return activity.tasks.map((task) => ({
      project_id: projectId,
      activity_id: activityId,
      zone_id: zoneId,
      phase_id: phaseId,
      zone_element_id: zoneElementId,
      external_progress_key: `casaport:${activity.key}:${task.key}`,
      progress_source: "casaport_pdf",
      last_external_update_at: `${data.reportDate}T12:00:00Z`,
      title: task.title,
      description: `Tâche pilotée par le rapport d’avancement global Casa-Port (${activity.title}).`,
      priority: "medium",
      status: taskStatus(task.progress),
      progress: task.progress,
      progress_mode: task.progressMode,
      work_type: task.workType,
      target_quantity: task.targetQuantity,
      completed_quantity:
        task.progressMode === "quantity" ? task.completedQuantity : 0,
      progress_unit: task.unit,
    }));
  });
  const tasksResult = await supabase
    .from("tasks")
    .upsert(taskRows, {
      onConflict: "project_id,external_progress_key",
    })
    .select("id,external_progress_key,progress");
  if (tasksResult.error) {
    return {
      success: false,
      error: migrationError(tasksResult.error.message)
        ? "Exécutez d’abord la migration 016_casaport_progress_import.sql dans Supabase."
        : tasksResult.error.message,
    };
  }
  const taskIds = new Map(
    (tasksResult.data ?? []).map((task) => [task.external_progress_key, task.id]),
  );
  const assignedTaskIds = [...taskIds.values()];
  if (alstomSupervisorId && assignedTaskIds.length) {
    const assignment = await supabase
      .from("tasks")
      .update({
        alstom_supervisor_id: alstomSupervisorId,
        owner: alstomSupervisor?.full_name ?? "Ahmed Adar",
      })
      .in("id", assignedTaskIds)
      .is("alstom_supervisor_id", null);
    if (assignment.error) return { success: false, error: assignment.error.message };
  }
  if (avanzitSiteManagerId && assignedTaskIds.length) {
    const assignment = await supabase
      .from("tasks")
      .update({ avanzit_site_manager_id: avanzitSiteManagerId })
      .in("id", assignedTaskIds)
      .is("avanzit_site_manager_id", null);
    if (assignment.error) return { success: false, error: assignment.error.message };
  }

  for (const activity of data.activities) {
    for (const task of activity.tasks) {
      if (task.progressMode !== "building") continue;
      const taskId = taskIds.get(`casaport:${activity.key}:${task.key}`);
      if (!taskId) continue;
      const phaseRows = task.steps.map((step, index) => ({
        task_id: taskId,
        code: step.code,
        label: step.label,
        weight: 1,
        progress: step.progress,
        sort_order: (index + 1) * 10,
      }));
      const phaseSave = await supabase
        .from("task_building_phases")
        .upsert(phaseRows, { onConflict: "task_id,code" });
      if (phaseSave.error) {
        return { success: false, error: phaseSave.error.message };
      }
      const keepCodes = task.steps.map((step) => step.code);
      const existingPhases = await supabase
        .from("task_building_phases")
        .select("id,code")
        .eq("task_id", taskId);
      if (existingPhases.error) {
        return { success: false, error: existingPhases.error.message };
      }
      const obsoletePhaseIds = (existingPhases.data ?? [])
        .filter((phase) => !keepCodes.includes(phase.code))
        .map((phase) => phase.id);
      if (obsoletePhaseIds.length) {
        const phaseDelete = await supabase
          .from("task_building_phases")
          .delete()
          .in("id", obsoletePhaseIds);
        if (phaseDelete.error) {
          return { success: false, error: phaseDelete.error.message };
        }
      }
    }
  }

  const importedTaskIds = [...taskIds.values()];
  const refreshedTasks = importedTaskIds.length
    ? await supabase
        .from("tasks")
        .select("id,external_progress_key,progress,target_quantity,completed_quantity,progress_unit")
        .in("id", importedTaskIds)
    : { data: [], error: null };
  if (refreshedTasks.error) {
    return { success: false, error: refreshedTasks.error.message };
  }
  const refreshedByKey = new Map(
    (refreshedTasks.data ?? []).map((task) => [task.external_progress_key, task]),
  );

  for (const activity of data.activities) {
    for (const task of activity.tasks) {
      const externalKey = `casaport:${activity.key}:${task.key}`;
      const savedTask = refreshedByKey.get(externalKey);
      if (!savedTask) continue;
      const quantitySummary = savedTask.target_quantity
        ? `${Number(savedTask.completed_quantity)} / ${Number(savedTask.target_quantity)} ${savedTask.progress_unit}`
        : `${Number(savedTask.progress)}%`;
      const existingUpdate = await supabase
        .from("task_progress_updates")
        .select("id")
        .eq("task_id", savedTask.id)
        .eq("update_date", data.reportDate)
        .eq("source", "casaport_pdf")
        .maybeSingle();
      if (existingUpdate.error) {
        return {
          success: false,
          error: migrationError(existingUpdate.error.message)
            ? "Exécutez d’abord la migration 016_casaport_progress_import.sql dans Supabase."
            : existingUpdate.error.message,
        };
      }
      const progressPayload = {
        project_id: projectId,
        task_id: savedTask.id,
        update_date: data.reportDate,
        progress: Number(savedTask.progress),
        completed_quantity: savedTask.target_quantity
          ? Number(savedTask.completed_quantity)
          : null,
        work_done: `Relevé d’avancement Casa-Port : ${quantitySummary}.`,
        ongoing_work: null,
        comment: `Import automatique depuis ${data.fileName}`,
        source: "casaport_pdf",
        source_file_name: data.fileName,
      };
      const progressSave = existingUpdate.data
        ? await supabase
            .from("task_progress_updates")
            .update(progressPayload)
            .eq("id", existingUpdate.data.id)
        : await supabase.from("task_progress_updates").insert(progressPayload);
      if (progressSave.error) {
        return { success: false, error: progressSave.error.message };
      }
    }
  }

  const importLog = await supabase.from("progress_imports").insert({
    project_id: projectId,
    zone_element_id: zoneElementId,
    report_date: data.reportDate,
    source_file_name: data.fileName,
    global_progress: data.globalProgress,
    parsed_payload: data,
    activities_updated: data.activities.length,
    tasks_updated: taskRows.length,
  });
  if (importLog.error) {
    return {
      success: false,
      error: migrationError(importLog.error.message)
        ? "Exécutez d’abord la migration 016_casaport_progress_import.sql dans Supabase."
        : importLog.error.message,
    };
  }

  revalidatePath("/");
  revalidatePath("/activities");
  revalidatePath("/tasks");
  revalidatePath("/progress");
  revalidatePath("/reporting");
  return {
    success: true,
    activitiesUpdated: data.activities.length,
    tasksUpdated: taskRows.length,
    reportDate: data.reportDate,
  };
}
