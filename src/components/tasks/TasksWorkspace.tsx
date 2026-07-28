"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownAZ,
  CalendarClock,
  Camera,
  CheckCircle2,
  CirclePlus,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  Link2,
  ListChecks,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { getTaskDocumentPreview } from "@/app/documents/actions";
import {
  createTaskProgressUpdate,
  deleteTaskProgressPhoto,
  getTaskProgressPhotoUrls,
} from "@/app/tasks/actions";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { TaskPrerequisitesPanel } from "@/components/tasks/TaskPrerequisitesPanel";
import { createClient } from "@/lib/supabase/client";
import type { Activity } from "@/types/activity";
import type {
  CollaboratorOption,
  PhaseOption,
  ZoneElementOption,
  ZoneOption,
} from "@/types/organization";
import type { Task, TaskFormValues, TaskPriority, TaskStatus } from "@/types/task";

const emptyForm: TaskFormValues = {
  title: "",
  description: "",
  owner: "",
  start_date: "",
  due_date: "",
  priority: "medium",
  status: "todo",
  progress_mode: "manual",
  work_type: "standard",
  target_quantity: null,
  completed_quantity: 0,
  progress_unit: "%",
  activity_id: "",
  zone_id: "",
  phase_id: "",
  zone_element_id: "",
  alstom_supervisor_id: "",
  avanzit_site_manager_id: "",
  document_ids: [],
};

type TaskDocumentOption = {
  id: string;
  title: string;
  reference: string | null;
  status: string;
};

type TaskDocumentLink = {
  task_id: string;
  document_id: string;
};

type TaskProgressPhoto = {
  id: string;
  file_path: string;
  caption: string | null;
};

type TaskProgressUpdate = {
  id: string;
  update_date: string;
  progress: number;
  work_done: string | null;
  ongoing_work: string | null;
  blockers: string | null;
  next_steps: string | null;
  comment: string | null;
  photos: TaskProgressPhoto[];
};

type TaskBuildingPhase = {
  id: string;
  code: string;
  label: string;
  weight: number;
  progress: number;
  sort_order: number;
};

type TaskPrerequisiteSummary = {
  total_requirements: number;
  missing_certifications: number;
  missing_documents: number;
  invalid_tools: number;
  invalid_equipment: number;
  missing_manual_items: number;
};

const statusLabels: Record<TaskStatus, string> = {
  todo: "À faire",
  in_progress: "En cours",
  blocked: "Bloquée",
  done: "Terminée",
};

const priorityLabels: Record<TaskPriority, string> = {
  low: "Basse",
  medium: "Moyenne",
  high: "Haute",
  critical: "Critique",
};

type SortOption = "due_asc" | "due_desc" | "priority" | "title" | "created_desc";

const priorityRank: Record<TaskPriority, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function TasksWorkspace() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [documents, setDocuments] = useState<TaskDocumentOption[]>([]);
  const [collaborators, setCollaborators] = useState<CollaboratorOption[]>([]);
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [phases, setPhases] = useState<PhaseOption[]>([]);
  const [zoneElements, setZoneElements] = useState<ZoneElementOption[]>([]);
  const [prerequisiteByTask, setPrerequisiteByTask] = useState<
    Record<string, TaskPrerequisiteSummary>
  >({});
  const [projectId, setProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState(() => searchParams.get("activity") || "all");
  const [sortBy, setSortBy] = useState<SortOption>("due_asc");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState<TaskFormValues>(emptyForm);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [documentQuery, setDocumentQuery] = useState("");
  const [previewDocument, setPreviewDocument] =
    useState<TaskDocumentOption | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [progressUpdates, setProgressUpdates] = useState<TaskProgressUpdate[]>([]);
  const [progressPhotoUrls, setProgressPhotoUrls] = useState<Record<string, string>>({});
  const [progressSaving, setProgressSaving] = useState(false);
  const [progressDate, setProgressDate] = useState(new Date().toISOString().slice(0, 10));
  const [progressValue, setProgressValue] = useState(0);
  const [progressQuantity, setProgressQuantity] = useState(0);
  const [buildingPhases, setBuildingPhases] = useState<TaskBuildingPhase[]>([]);
  const [workDone, setWorkDone] = useState("");
  const [ongoingWork, setOngoingWork] = useState("");
  const [blockers, setBlockers] = useState("");
  const [nextSteps, setNextSteps] = useState("");
  const [progressComment, setProgressComment] = useState("");
  const [progressPhotos, setProgressPhotos] = useState<File[]>([]);
  const [photoToDelete, setPhotoToDelete] = useState<TaskProgressPhoto | null>(
    null,
  );
  const [photoDeleting, setPhotoDeleting] = useState(false);

  async function loadData(silent = false) {
    if (!silent) setLoading(true);
    setError("");

    const projectResult = await supabase.from("projects").select("id").eq("code", "PDD").single();
    if (projectResult.error) {
      setError(projectResult.error.message);
      setLoading(false);
      return;
    }

    const id = projectResult.data.id;
    setProjectId(id);

    const [
      activitiesResult,
      tasksResult,
      documentsResult,
      linksResult,
      collaboratorsResult,
      zonesResult,
      phasesResult,
      zoneElementsResult,
      prerequisiteResult,
    ] = await Promise.all([
      supabase.from("activities").select("*").eq("project_id", id).order("code"),
      supabase
        .from("tasks")
        .select("*, activity:activities(id,code,name)")
        .eq("project_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("documents")
        .select("id,title,reference,status")
        .eq("project_id", id)
        .order("title"),
      supabase
        .from("task_documents")
        .select("task_id,document_id,tasks!inner(project_id)")
        .eq("tasks.project_id", id),
      supabase
        .from("collaborators")
        .select("id,full_name,company,role,profile,phone")
        .eq("project_id", id)
        .eq("active", true)
        .order("sort_order"),
      supabase
        .from("zones")
        .select("id,code,name")
        .eq("project_id", id)
        .eq("active", true)
        .order("sort_order"),
      supabase
        .from("phases")
        .select("id,zone_id,code,name")
        .eq("project_id", id)
        .eq("active", true)
        .order("sort_order"),
      supabase
        .from("zone_elements")
        .select("id,zone_id,code,name,element_type")
        .eq("project_id", id)
        .eq("active", true)
        .order("sort_order"),
      supabase
        .from("task_prerequisite_status")
        .select(
          "task_id,total_requirements,missing_certifications,missing_documents,invalid_tools,invalid_equipment,missing_manual_items",
        ),
    ]);

    if (activitiesResult.error) setError(activitiesResult.error.message);
    else setActivities((activitiesResult.data ?? []) as Activity[]);

    if (documentsResult.error) setError(documentsResult.error.message);
    else setDocuments((documentsResult.data ?? []) as TaskDocumentOption[]);

    if (collaboratorsResult.error) setError(collaboratorsResult.error.message);
    else setCollaborators((collaboratorsResult.data ?? []) as CollaboratorOption[]);
    if (zonesResult.error) setError(zonesResult.error.message);
    else setZones((zonesResult.data ?? []) as ZoneOption[]);
    if (phasesResult.error) setError(phasesResult.error.message);
    else setPhases((phasesResult.data ?? []) as PhaseOption[]);
    if (zoneElementsResult.error) setError(zoneElementsResult.error.message);
    else setZoneElements((zoneElementsResult.data ?? []) as ZoneElementOption[]);
    if (!prerequisiteResult.error) {
      setPrerequisiteByTask(
        Object.fromEntries(
          (prerequisiteResult.data ?? []).map((item) => [
            item.task_id,
            {
              total_requirements: Number(item.total_requirements),
              missing_certifications: Number(item.missing_certifications),
              missing_documents: Number(item.missing_documents),
              invalid_tools: Number(item.invalid_tools),
              invalid_equipment: Number(item.invalid_equipment),
              missing_manual_items: Number(item.missing_manual_items),
            },
          ]),
        ),
      );
    }

    if (tasksResult.error) {
      setError(tasksResult.error.message);
    } else {
      const links = linksResult.error
        ? []
        : ((linksResult.data ?? []) as TaskDocumentLink[]);
      const documentIdsByTask = links.reduce<Record<string, string[]>>(
        (result, link) => {
          (result[link.task_id] ??= []).push(link.document_id);
          return result;
        },
        {},
      );
      setTasks(
        ((tasksResult.data ?? []) as Task[]).map((task) => ({
          ...task,
          document_ids: documentIdsByTask[task.id] ?? [],
        })),
      );
    }

    if (linksResult.error) {
      setError(
        "La liaison tâches-documents n’est pas encore disponible. Exécute la migration 003_task_documents.sql dans Supabase.",
      );
    }

    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial remote data synchronization
    void loadData();

    const channel = supabase
      .channel("tasks-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => void loadData(true))
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // loadData intentionally remains local to keep the realtime refresh behavior stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const owners = useMemo(
    () => Array.from(new Set(tasks.map((task) => task.owner).filter(Boolean) as string[])).sort(),
    [tasks],
  );
  const alstomCollaborators = collaborators.filter(
    (person) => person.company === "ALSTOM",
  );
  const avanzitCollaborators = collaborators.filter(
    (person) => person.company === "AVANZIT",
  );
  const collaboratorName = (id: string | null) =>
    collaborators.find((person) => person.id === id)?.full_name;
  const editingActivityTaskCount = editing?.activity_id
    ? Math.max(
        1,
        tasks.filter((task) => task.activity_id === editing.activity_id).length,
      )
    : 1;
  const currentTaskProgress = Number(
    progressUpdates[0]?.progress ?? editing?.progress ?? 0,
  );
  const quantityProgress =
    form.progress_mode === "quantity" && Number(form.target_quantity) > 0
      ? Math.min(
          100,
          Math.round(
            (progressQuantity / Number(form.target_quantity)) * 10_000,
          ) / 100,
        )
      : 0;
  const buildingProgress = buildingPhases.length
    ? Math.round(
        (buildingPhases.reduce(
          (sum, phase) => sum + phase.progress * phase.weight,
          0,
        ) /
          buildingPhases.reduce((sum, phase) => sum + phase.weight, 0)) *
          100,
      ) / 100
    : currentTaskProgress;
  const effectiveProgress =
    form.progress_mode === "quantity"
      ? quantityProgress
      : form.progress_mode === "building"
        ? buildingProgress
        : currentTaskProgress;
  const previousTaskProgress = Number(progressUpdates[1]?.progress ?? 0);
  const latestProgressIncrease = Math.max(
    0,
    currentTaskProgress - previousTaskProgress,
  );
  const activityProgressContribution =
    effectiveProgress / editingActivityTaskCount;

  const visibleDocuments = useMemo(() => {
    const normalizedQuery = documentQuery.trim().toLowerCase();
    if (!normalizedQuery) return documents;

    return documents.filter((document) =>
      `${document.title} ${document.reference ?? ""} ${document.status}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [documentQuery, documents]);

  const today = new Date().toISOString().slice(0, 10);

  const visibleTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const result = tasks.filter((task) => {
      const searchable = `${task.title} ${task.description ?? ""} ${task.owner ?? ""} ${task.activity?.code ?? ""} ${task.activity?.name ?? ""}`.toLowerCase();
      const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
      const matchesStatus = statusFilter === "all" || task.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
      const matchesOwner = ownerFilter === "all" || task.owner === ownerFilter;
      const matchesActivity = activityFilter === "all" || task.activity_id === activityFilter;
      return matchesQuery && matchesStatus && matchesPriority && matchesOwner && matchesActivity;
    });

    return [...result].sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title, "fr");
      if (sortBy === "priority") return priorityRank[b.priority] - priorityRank[a.priority];
      if (sortBy === "created_desc") return (b.created_at ?? "").localeCompare(a.created_at ?? "");

      const aDate = a.due_date ?? "9999-12-31";
      const bDate = b.due_date ?? "9999-12-31";
      return sortBy === "due_desc" ? bDate.localeCompare(aDate) : aDate.localeCompare(bDate);
    });
  }, [tasks, query, statusFilter, priorityFilter, ownerFilter, activityFilter, sortBy]);

  const stats = {
    total: tasks.length,
    open: tasks.filter((task) => task.status !== "done").length,
    active: tasks.filter((task) => task.status === "in_progress").length,
    blocked: tasks.filter((task) => task.status === "blocked").length,
    overdue: tasks.filter((task) => task.due_date && task.due_date < today && task.status !== "done").length,
    done: tasks.filter((task) => task.status === "done").length,
  };

  function openCreate(activityId = "") {
    setEditing(null);
    const activity = activities.find((item) => item.id === activityId);
    setForm({
      ...emptyForm,
      activity_id: activityId,
      zone_id: activity?.zone_id ?? "",
      phase_id: activity?.phase_id ?? "",
      zone_element_id: activity?.zone_element_id ?? "",
      alstom_supervisor_id: activity?.alstom_supervisor_id ?? "",
      avanzit_site_manager_id: activity?.avanzit_site_manager_id ?? "",
    });
    setDocumentQuery("");
    setProgressUpdates([]);
    setBuildingPhases([]);
    setDrawerOpen(true);
  }

  async function loadTaskProgress(taskId: string) {
    const [result, phasesResult] = await Promise.all([
      supabase
        .from("task_progress_updates")
        .select("id,update_date,progress,work_done,ongoing_work,blockers,next_steps,comment,photos:task_progress_photos(id,file_path,caption)")
        .eq("task_id", taskId)
        .order("update_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("task_building_phases")
        .select("id,code,label,weight,progress,sort_order")
        .eq("task_id", taskId)
        .order("sort_order"),
    ]);
    if (result.error) {
      setError(`Journal d’avancement indisponible : ${result.error.message}`);
      return;
    }
    if (!phasesResult.error) {
      setBuildingPhases(
        (phasesResult.data ?? []).map((phase) => ({
          ...phase,
          weight: Number(phase.weight),
          progress: Number(phase.progress),
        })) as TaskBuildingPhase[],
      );
    }
    const loaded = (result.data ?? []) as unknown as TaskProgressUpdate[];
    setProgressUpdates(loaded);
    const paths = loaded.flatMap((update) =>
      (update.photos ?? []).map((photo) => photo.file_path),
    );
    setProgressPhotoUrls(await getTaskProgressPhotoUrls(paths));
  }

  function resetProgressForm(progress = 0, quantity = 0) {
    setProgressDate(new Date().toISOString().slice(0, 10));
    setProgressValue(progress);
    setProgressQuantity(quantity);
    setWorkDone("");
    setOngoingWork("");
    setBlockers("");
    setNextSteps("");
    setProgressComment("");
    setProgressPhotos([]);
  }

  function openEdit(task: Task) {
    setEditing(task);
    setForm({
      title: task.title,
      description: task.description ?? "",
      owner: task.owner ?? "",
      start_date: task.start_date ?? "",
      due_date: task.due_date ?? "",
      priority: task.priority,
      status: task.status,
      progress_mode: task.progress_mode ?? "manual",
      work_type: task.work_type ?? "standard",
      target_quantity: task.target_quantity,
      completed_quantity: Number(task.completed_quantity ?? 0),
      progress_unit: task.progress_unit ?? "%",
      activity_id: task.activity_id ?? "",
      zone_id: task.zone_id ?? "",
      phase_id: task.phase_id ?? "",
      zone_element_id: task.zone_element_id ?? "",
      alstom_supervisor_id: task.alstom_supervisor_id ?? "",
      avanzit_site_manager_id: task.avanzit_site_manager_id ?? "",
      document_ids: task.document_ids ?? [],
    });
    setDocumentQuery("");
    resetProgressForm(
      Number(task.progress ?? 0),
      Number(task.completed_quantity ?? 0),
    );
    void loadTaskProgress(task.id);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    if (saving || progressSaving) return;
    setDrawerOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setDocumentQuery("");
    setProgressUpdates([]);
    setBuildingPhases([]);
  }

  async function openDocumentPreview(document: TaskDocumentOption) {
    setPreviewDocument(document);
    setPreviewUrl("");
    setPreviewError("");
    setPreviewLoading(true);

    const result = await getTaskDocumentPreview(document.id);
    if (result.success) {
      setPreviewUrl(result.url);
    } else {
      setPreviewError(result.error);
    }
    setPreviewLoading(false);
  }

  function closeDocumentPreview() {
    setPreviewDocument(null);
    setPreviewUrl("");
    setPreviewError("");
    setPreviewLoading(false);
  }

  function resetFilters() {
    setQuery("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setOwnerFilter("all");
    setActivityFilter("all");
    setSortBy("due_asc");
  }

  async function saveTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId || !form.title.trim()) return;
    if (
      form.progress_mode === "quantity" &&
      Number(form.target_quantity) <= 0
    ) {
      setError("Renseignez une longueur totale supérieure à zéro.");
      return;
    }
    await persistTask();
  }

  async function persistTask() {
    if (!projectId || !form.title.trim()) return;

    setSaving(true);
    setError("");

    const alstomSupervisor = collaborators.find(
      (person) => person.id === form.alstom_supervisor_id,
    );
    const payload = {
      project_id: projectId,
      activity_id: form.activity_id || null,
      title: form.title.trim(),
      description: form.description.trim() || null,
      owner: alstomSupervisor?.full_name ?? (form.owner.trim() || null),
      zone_id: form.zone_id || null,
      phase_id: form.phase_id || null,
      zone_element_id: form.zone_element_id || null,
      alstom_supervisor_id: form.alstom_supervisor_id || null,
      avanzit_site_manager_id: form.avanzit_site_manager_id || null,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      priority: form.priority,
      status: form.status,
      progress_mode: form.progress_mode,
      work_type: form.work_type,
      target_quantity:
        form.progress_mode === "quantity"
          ? Number(form.target_quantity)
          : null,
      completed_quantity:
        form.progress_mode === "quantity"
          ? Number(form.completed_quantity)
          : 0,
      progress_unit: form.progress_mode === "quantity" ? "m" : "%",
    };

    const result = editing
      ? await supabase
          .from("tasks")
          .update(payload)
          .eq("id", editing.id)
          .select("id")
          .single()
      : await supabase.from("tasks").insert(payload).select("id").single();

    if (result.error) {
      setError(result.error.message);
    } else {
      const taskId = result.data.id;
      const deleteLinksResult = await supabase
        .from("task_documents")
        .delete()
        .eq("task_id", taskId);

      if (deleteLinksResult.error) {
        setError(deleteLinksResult.error.message);
        setSaving(false);
        return;
      }

      if (form.document_ids.length > 0) {
        const linkResult = await supabase.from("task_documents").insert(
          form.document_ids.map((documentId) => ({
            task_id: taskId,
            document_id: documentId,
          })),
        );

        if (linkResult.error) {
          setError(linkResult.error.message);
          setSaving(false);
          return;
        }
      }

      setSaving(false);
      closeDrawer();
      await loadData(true);
      return;
    }

    setSaving(false);
  }

  async function saveProgressUpdate() {
    if (!editing) return;
    setProgressSaving(true);
    setError("");
    const data = new FormData();
    const resolvedProgress =
      form.progress_mode === "quantity"
        ? quantityProgress
        : form.progress_mode === "building"
          ? buildingProgress
          : progressValue;
    data.set("task_id", editing.id);
    data.set("update_date", progressDate);
    data.set("progress", String(resolvedProgress));
    if (form.progress_mode === "quantity") {
      data.set("completed_quantity", String(progressQuantity));
    }
    data.set("work_done", workDone);
    data.set("ongoing_work", ongoingWork);
    data.set("blockers", blockers);
    data.set("next_steps", nextSteps);
    data.set("comment", progressComment);
    progressPhotos.forEach((photo) => data.append("photos", photo));
    const result = await createTaskProgressUpdate(data);
    if (!result.success) {
      setError(result.error);
    } else {
      resetProgressForm(resolvedProgress, progressQuantity);
      await Promise.all([loadTaskProgress(editing.id), loadData(true)]);
    }
    setProgressSaving(false);
  }

  async function saveBuildingProgress() {
    if (!editing || !buildingPhases.length) return;
    setProgressSaving(true);
    setError("");
    let firstError: { message: string } | null = null;
    for (const phase of buildingPhases) {
      const result = await supabase
        .from("task_building_phases")
        .update({ progress: phase.progress })
        .eq("id", phase.id);
      if (result.error) {
        firstError = result.error;
        break;
      }
    }
    if (firstError) {
      setError(firstError.message);
    } else {
      await Promise.all([loadTaskProgress(editing.id), loadData(true)]);
    }
    setProgressSaving(false);
  }

  async function confirmPhotoDelete() {
    if (!photoToDelete || !editing) return;
    setPhotoDeleting(true);
    setError("");
    const result = await deleteTaskProgressPhoto(photoToDelete.id);
    if (!result.success) {
      setError(result.error);
    } else {
      setPhotoToDelete(null);
      await loadTaskProgress(editing.id);
    }
    setPhotoDeleting(false);
  }

  async function confirmDelete() {
    if (!taskToDelete) return;
    setDeleting(true);
    setError("");

    const result = await supabase.from("tasks").delete().eq("id", taskToDelete.id);
    if (result.error) setError(result.error.message);
    else {
      setTaskToDelete(null);
      if (editing?.id === taskToDelete.id) closeDrawer();
      await loadData(true);
    }

    setDeleting(false);
  }

  async function quickStatus(task: Task, status: TaskStatus) {
    const result = await supabase.from("tasks").update({ status }).eq("id", task.id);
    if (result.error) setError(result.error.message);
    else setTasks((current) => current.map((item) => (item.id === task.id ? { ...item, status } : item)));
  }

  return (
    <div className="mx-auto max-w-[1700px]">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-[var(--opc-ink)]">Tasks Control Center</h1>
          <p className="mt-2 text-base font-bold text-[var(--opc-blue)]">Actions opérationnelles connectées aux activités du projet PDD</p>
          <p className="mt-2 text-sm text-[var(--opc-muted)]">Créer, affecter, filtrer, modifier et clôturer les tâches depuis un espace unique.</p>
        </div>

        <button
          type="button"
          onClick={() => openCreate()}
          className="flex items-center justify-center gap-2 rounded-xl bg-[var(--opc-red)] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-[var(--opc-red-dark)]"
        >
          <CirclePlus className="h-4 w-4" /> Nouvelle tâche
        </button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat icon={<ListChecks className="h-5 w-5" />} label="Ouvertes" value={String(stats.open)} />
        <Stat icon={<CalendarClock className="h-5 w-5" />} label="En cours" value={String(stats.active)} />
        <Stat icon={<AlertTriangle className="h-5 w-5" />} label="Bloquées" value={String(stats.blocked)} amber />
        <Stat icon={<AlertTriangle className="h-5 w-5" />} label="En retard" value={String(stats.overdue)} red />
        <Stat icon={<CheckCircle2 className="h-5 w-5" />} label="Terminées" value={String(stats.done)} green />
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--opc-border)] bg-white shadow-sm">
        <div className="border-b border-[var(--opc-border)] p-4">
          <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-[var(--opc-border)] bg-slate-50 px-4 py-2.5">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher une tâche, activité ou responsable..."
                className="w-full bg-transparent text-sm outline-none"
              />
              {query ? (
                <button type="button" onClick={() => setQuery("")} className="text-slate-400 hover:text-slate-700" aria-label="Effacer la recherche">
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <FilterSelect value={statusFilter} onChange={(value) => setStatusFilter(value as TaskStatus | "all")}>
                <option value="all">Tous les statuts</option>
                {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </FilterSelect>

              <FilterSelect value={priorityFilter} onChange={(value) => setPriorityFilter(value as TaskPriority | "all")}>
                <option value="all">Toutes les priorités</option>
                {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </FilterSelect>

              <FilterSelect value={ownerFilter} onChange={setOwnerFilter}>
                <option value="all">Tous les responsables</option>
                {owners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
              </FilterSelect>

              <FilterSelect value={activityFilter} onChange={setActivityFilter}>
                <option value="all">Toutes les activités</option>
                {activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.code}</option>)}
              </FilterSelect>

              <div className="flex items-center gap-2 rounded-xl border border-[var(--opc-border)] bg-white px-3">
                <ArrowDownAZ className="h-4 w-4 text-slate-400" />
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)} className="bg-transparent py-2.5 text-sm font-bold text-slate-600 outline-none">
                  <option value="due_asc">Échéance croissante</option>
                  <option value="due_desc">Échéance décroissante</option>
                  <option value="priority">Priorité</option>
                  <option value="title">Titre</option>
                  <option value="created_desc">Plus récentes</option>
                </select>
              </div>

              <button type="button" onClick={resetFilters} className="rounded-xl border border-[var(--opc-border)] px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">
                Réinitialiser
              </button>

              <button type="button" onClick={() => void loadData()} className="flex items-center gap-2 rounded-xl border border-[var(--opc-border)] px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">
                <RefreshCw className="h-4 w-4" /> Actualiser
              </button>
            </div>
          </div>

          <div className="mt-3 text-xs font-bold text-slate-500">
            {visibleTasks.length} tâche{visibleTasks.length > 1 ? "s" : ""} affichée{visibleTasks.length > 1 ? "s" : ""} sur {stats.total}
          </div>
        </div>

        {error ? <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div> : null}

        {loading ? (
          <div className="grid min-h-72 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[var(--opc-blue)]" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1320px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--opc-border)] bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-4">Tâche</th>
                  <th className="px-5 py-4">Documents</th>
                  <th className="px-5 py-4">Activité liée</th>
                  <th className="px-5 py-4">Responsable</th>
                  <th className="px-5 py-4">Dates</th>
                  <th className="px-5 py-4">Avancement</th>
                  <th className="px-5 py-4">Priorité</th>
                  <th className="px-5 py-4">Statut</th>
                  <th className="px-5 py-4">Prérequis</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleTasks.map((task) => {
                  const overdue = Boolean(task.due_date && task.due_date < today && task.status !== "done");
                  const prerequisite = prerequisiteByTask[task.id];
                  const missingPrerequisites = prerequisite
                    ? prerequisite.missing_certifications +
                      prerequisite.missing_documents +
                      prerequisite.invalid_tools +
                      prerequisite.invalid_equipment +
                      prerequisite.missing_manual_items
                    : 0;
                  const prerequisiteConfigured =
                    (prerequisite?.total_requirements ?? 0) > 0;
                  const prerequisiteCompliant =
                    prerequisiteConfigured && missingPrerequisites === 0;
                  return (
                    <tr
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openEdit(task)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openEdit(task);
                        }
                      }}
                      className={`cursor-pointer border-b border-slate-100 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--opc-blue)] ${
                        prerequisiteCompliant
                          ? "bg-emerald-50/70 hover:bg-emerald-100/70"
                          : "bg-red-50/60 hover:bg-red-100/60"
                      }`}
                      aria-label={`Voir le contenu de la tâche ${task.title}`}
                    >
                      <td className="px-5 py-4">
                        <div className="font-black text-[var(--opc-ink)]">{task.title}</div>
                        {task.description ? <div className="mt-1 max-w-md truncate text-xs text-slate-500">{task.description}</div> : null}
                      </td>
                      <td className="px-5 py-4">
                        {task.document_ids?.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {task.document_ids.map((documentId) => {
                              const document = documents.find(
                                (item) => item.id === documentId,
                              );
                              return document ? (
                                <span
                                  key={documentId}
                                  className="inline-flex items-center rounded-lg bg-blue-50 text-xs font-bold text-[var(--opc-blue)]"
                                  title={document.title}
                                >
                                  <a
                                    href={`/documents/${documentId}`}
                                    onClick={(event) => event.stopPropagation()}
                                    className="inline-flex items-center gap-1 rounded-l-lg px-2 py-1 hover:bg-blue-100"
                                  >
                                    <FileText className="h-3.5 w-3.5" />
                                    {document.reference || document.title}
                                  </a>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void openDocumentPreview(document);
                                    }}
                                    className="border-l border-blue-100 p-1.5 hover:bg-blue-100"
                                    aria-label={`Prévisualiser ${document.title}`}
                                    title="Prévisualiser le PDF"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </button>
                                </span>
                              ) : null;
                            })}
                          </div>
                        ) : (
                          <span className="text-slate-400">Aucun</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {task.activity ? (
                          <div className="flex items-center gap-2">
                            <Link2 className="h-4 w-4 text-[var(--opc-blue)]" />
                            <span className="font-black text-[var(--opc-blue)]">{task.activity.code}</span>
                            <span className="max-w-48 truncate text-xs text-slate-500">{task.activity.name}</span>
                          </div>
                        ) : <span className="text-slate-400">Non liée</span>}
                      </td>
                      <td className="px-5 py-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 font-bold">
                            <UserRound className="h-4 w-4 text-[var(--opc-blue)]" />
                            {collaboratorName(task.alstom_supervisor_id) || task.owner || "—"}
                          </div>
                          <div className="text-xs text-slate-500">
                            Avanzit : {collaboratorName(task.avanzit_site_manager_id) || "À affecter"}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-2 font-bold ${overdue ? "text-[var(--opc-red)]" : "text-slate-600"}`}>
                          <CalendarClock className="h-4 w-4" />
                          {task.start_date || "—"} → {task.due_date || "—"}
                          {overdue ? " · En retard" : ""}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="min-w-32">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-black text-[var(--opc-ink)]">
                              {Math.round(Number(task.progress ?? 0) * 100) / 100}%
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              {task.progress_mode === "quantity"
                                ? `${Number(task.completed_quantity ?? 0)} / ${Number(task.target_quantity ?? 0)} ${task.progress_unit || "m"}`
                                : task.progress_mode === "building"
                                  ? "Étapes GC"
                                  : "Manuel"}
                            </span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full bg-[var(--opc-blue)] transition-[width] duration-300"
                              style={{
                                width: `${Math.min(100, Math.max(0, Number(task.progress ?? 0)))}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4"><PriorityBadge priority={task.priority} /></td>
                      <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                        <select
                          value={task.status}
                          onChange={(event) => void quickStatus(task, event.target.value as TaskStatus)}
                          className="rounded-lg border border-[var(--opc-border)] bg-white px-2.5 py-2 text-xs font-black outline-none"
                        >
                          {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${
                            prerequisiteCompliant
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {prerequisiteCompliant
                            ? "Conforme"
                            : prerequisiteConfigured
                              ? `${missingPrerequisites} anomalie(s)`
                              : "À configurer"}
                        </span>
                      </td>
                      <td className="px-5 py-4" onClick={(event) => event.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => openEdit(task)} className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--opc-border)] text-slate-600 hover:bg-slate-50" aria-label="Modifier">
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => setTaskToDelete(task)} className="grid h-9 w-9 place-items-center rounded-lg border border-red-200 text-[var(--opc-red)] hover:bg-red-50" aria-label="Supprimer">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {visibleTasks.length === 0 ? (
                  <tr><td colSpan={10} className="px-5 py-16 text-center text-sm text-slate-400">Aucune tâche ne correspond aux filtres.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-[1px]" onMouseDown={closeDrawer}>
          <aside className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[var(--opc-border)] bg-white px-6 py-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--opc-red)]">{editing ? "Détails de la tâche" : "Création"}</p>
                <h2 className="mt-2 text-2xl font-black text-[var(--opc-ink)]">{editing ? editing.title : "Nouvelle tâche"}</h2>
              </div>
              <button type="button" onClick={closeDrawer} className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--opc-border)] text-slate-500 hover:bg-slate-50">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={saveTask} className="p-6">
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Titre">
                  <input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Vérifier le plan EXE" className="input" />
                </Field>

                <Field label="Activité liée">
                  <select
                    value={form.activity_id}
                    onChange={(event) => {
                      const activity = activities.find((item) => item.id === event.target.value);
                      setForm({
                        ...form,
                        activity_id: event.target.value,
                        zone_id: activity?.zone_id ?? form.zone_id,
                        phase_id: activity?.phase_id ?? form.phase_id,
                        zone_element_id: activity?.zone_element_id ?? form.zone_element_id,
                      });
                    }}
                    className="input"
                  >
                    <option value="">Aucune activité</option>
                    {activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.code} — {activity.name}</option>)}
                  </select>
                </Field>

                <Field label="Superviseur Alstom">
                  <select value={form.alstom_supervisor_id} onChange={(event) => setForm({ ...form, alstom_supervisor_id: event.target.value })} className="input">
                    <option value="">À affecter</option>
                    {alstomCollaborators.map((person) => <option key={person.id} value={person.id}>{person.full_name} — {person.role}</option>)}
                  </select>
                </Field>

                <Field label="Chef de chantier Avanzit">
                  <select value={form.avanzit_site_manager_id} onChange={(event) => setForm({ ...form, avanzit_site_manager_id: event.target.value })} className="input">
                    <option value="">{avanzitCollaborators.length ? "À affecter" : "À compléter dans Organisation"}</option>
                    {avanzitCollaborators.map((person) => <option key={person.id} value={person.id}>{person.full_name} — {person.role}</option>)}
                  </select>
                </Field>

                <Field label="Zone">
                  <select value={form.zone_id} onChange={(event) => setForm({ ...form, zone_id: event.target.value, phase_id: "", zone_element_id: "" })} className="input">
                    <option value="">Toutes les zones</option>
                    {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
                  </select>
                </Field>

                <Field label="Phase">
                  <select value={form.phase_id} onChange={(event) => setForm({ ...form, phase_id: event.target.value })} className="input" disabled={!form.zone_id}>
                    <option value="">Toutes les phases</option>
                    {phases.filter((phase) => phase.zone_id === form.zone_id).map((phase) => <option key={phase.id} value={phase.id}>{phase.code} — {phase.name}</option>)}
                  </select>
                </Field>

                <Field label="Élément de zone / BAL">
                  <select value={form.zone_element_id} onChange={(event) => setForm({ ...form, zone_element_id: event.target.value })} className="input" disabled={!form.zone_id}>
                    <option value="">Tout l’axe</option>
                    {zoneElements.filter((element) => element.zone_id === form.zone_id).map((element) => <option key={element.id} value={element.id}>{element.element_type === "bal" ? "BAL — " : ""}{element.name}</option>)}
                  </select>
                </Field>

                <Field label="Date de début">
                  <input type="date" max={form.due_date || undefined} value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} className="input" />
                </Field>

                <Field label="Date de fin">
                  <input type="date" min={form.start_date || undefined} value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} className="input" />
                </Field>

                <Field label="Priorité">
                  <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as TaskPriority })} className="input">
                    {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>

                <Field label="Statut">
                  <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as TaskStatus })} className="input">
                    {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>

                <Field label="Type d’avancement GC">
                  <select
                    value={form.work_type}
                    onChange={(event) => {
                      const workType = event.target.value as TaskFormValues["work_type"];
                      setForm({
                        ...form,
                        work_type: workType,
                        progress_mode:
                          workType === "gc_building"
                            ? "building"
                            : workType === "gc_excavation_trench" ||
                                workType === "gc_concrete_trench"
                              ? "quantity"
                              : "manual",
                        target_quantity:
                          workType === "gc_excavation_trench" ||
                          workType === "gc_concrete_trench"
                            ? form.target_quantity
                            : null,
                        progress_unit:
                          workType === "gc_excavation_trench" ||
                          workType === "gc_concrete_trench"
                            ? "m"
                            : "%",
                      });
                    }}
                    className="input"
                  >
                    <option value="standard">Standard — pourcentage manuel</option>
                    <option value="gc_excavation_trench">GC — excavation de tranchée</option>
                    <option value="gc_concrete_trench">GC — coulage béton de tranchée</option>
                    <option value="gc_building">GC — construction guérite / local technique</option>
                  </select>
                </Field>

                {form.progress_mode === "quantity" ? (
                  <Field label="Longueur totale à réaliser (m)">
                    <input
                      type="number"
                      required
                      min={0.01}
                      step={0.01}
                      value={form.target_quantity ?? ""}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          target_quantity: event.target.value
                            ? Number(event.target.value)
                            : null,
                        })
                      }
                      className="input"
                    />
                  </Field>
                ) : null}
              </div>

              <div className="mt-5">
                <Field label="Description">
                  <textarea rows={7} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Détails, résultat attendu, blocage éventuel..." className="input resize-none" />
                </Field>
              </div>

              {editing ? (
                <section className="mt-5 rounded-2xl border border-[var(--opc-border)] bg-slate-50/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black text-[var(--opc-ink)]">Journal d’avancement</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Ces informations et photos alimentent automatiquement les rapports.
                      </p>
                    </div>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-[var(--opc-blue)]">
                      {progressUpdates.length} mise{progressUpdates.length > 1 ? "s" : ""} à jour
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-blue-50 p-3">
                      <p className="text-[10px] font-black uppercase text-blue-500">État actuel</p>
                      <p className="mt-1 text-2xl font-black text-blue-700">{effectiveProgress}%</p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 p-3">
                      <p className="text-[10px] font-black uppercase text-emerald-600">Dernière hausse</p>
                      <p className="mt-1 text-2xl font-black text-emerald-700">+{latestProgressIncrease} pts</p>
                    </div>
                    <div className="rounded-xl bg-violet-50 p-3">
                      <p className="text-[10px] font-black uppercase text-violet-600">Part activité</p>
                      <p className="mt-1 text-2xl font-black text-violet-700">{activityProgressContribution.toFixed(1)} pts</p>
                      <p className="mt-1 text-[10px] text-violet-500">Poids 1/{editingActivityTaskCount}</p>
                    </div>
                  </div>

                  {form.progress_mode === "building" ? (
                    <div className="mt-4 rounded-2xl border border-blue-100 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h4 className="font-black">
                            Phases de construction guérite / LT
                          </h4>
                          <p className="text-xs text-slate-500">
                            L’avancement de la tâche est la moyenne pondérée de
                            ces phases.
                          </p>
                        </div>
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                          {buildingProgress}%
                        </span>
                      </div>
                      <div className="mt-4 space-y-4">
                        {buildingPhases.map((phase) => (
                          <label key={phase.id} className="block">
                            <span className="flex items-center justify-between gap-3 text-xs font-bold">
                              <span>{phase.label}</span>
                              <span>
                                {phase.progress}% · poids {phase.weight}%
                              </span>
                            </span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={5}
                              value={phase.progress}
                              onChange={(event) =>
                                setBuildingPhases((current) =>
                                  current.map((item) =>
                                    item.id === phase.id
                                      ? {
                                          ...item,
                                          progress: Number(event.target.value),
                                        }
                                      : item,
                                  ),
                                )
                              }
                              className="mt-2 w-full accent-[var(--opc-blue)]"
                            />
                          </label>
                        ))}
                      </div>
                      <button
                        type="button"
                        disabled={progressSaving || !buildingPhases.length}
                        onClick={() => void saveBuildingProgress()}
                        className="mt-4 w-full rounded-xl bg-blue-50 px-4 py-3 text-sm font-black text-[var(--opc-blue)] disabled:opacity-50"
                      >
                        Enregistrer les phases de construction
                      </button>
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <Field label="Date">
                      <input type="date" value={progressDate} onChange={(event) => setProgressDate(event.target.value)} className="input" />
                    </Field>
                    {form.progress_mode === "quantity" ? (
                      <Field
                        label={`Longueur réalisée — ${progressQuantity} / ${
                          form.target_quantity ?? 0
                        } m (${quantityProgress}%)`}
                      >
                        <input
                          type="number"
                          min={0}
                          max={form.target_quantity ?? undefined}
                          step={0.01}
                          value={progressQuantity}
                          onChange={(event) =>
                            setProgressQuantity(Number(event.target.value))
                          }
                          className="input"
                        />
                      </Field>
                    ) : form.progress_mode === "building" ? (
                      <Field label={`Avancement calculé — ${buildingProgress}%`}>
                        <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-[var(--opc-blue)]"
                            style={{ width: `${buildingProgress}%` }}
                          />
                        </div>
                      </Field>
                    ) : (
                      <Field label={`Avancement — ${progressValue}%`}>
                        <input type="range" min={0} max={100} step={5} value={progressValue} onChange={(event) => setProgressValue(Number(event.target.value))} className="mt-4 w-full accent-[var(--opc-blue)]" />
                      </Field>
                    )}
                    <Field label="Travaux réalisés">
                      <textarea rows={3} value={workDone} onChange={(event) => setWorkDone(event.target.value)} className="input resize-none" placeholder="Ce qui a été terminé aujourd’hui..." />
                    </Field>
                    <Field label="Travaux en cours">
                      <textarea rows={3} value={ongoingWork} onChange={(event) => setOngoingWork(event.target.value)} className="input resize-none" placeholder="Travaux actuellement en cours..." />
                    </Field>
                    <Field label="Blocages / alertes">
                      <textarea rows={3} value={blockers} onChange={(event) => setBlockers(event.target.value)} className="input resize-none" placeholder="Contraintes, sécurité, matériel..." />
                    </Field>
                    <Field label="Prochaines étapes">
                      <textarea rows={3} value={nextSteps} onChange={(event) => setNextSteps(event.target.value)} className="input resize-none" placeholder="Actions prévues ensuite..." />
                    </Field>
                  </div>
                  <div className="mt-4">
                    <Field label="Commentaire">
                      <textarea rows={2} value={progressComment} onChange={(event) => setProgressComment(event.target.value)} className="input resize-none" />
                    </Field>
                  </div>
                  <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-blue-200 bg-blue-50/50 p-4">
                    <Camera className="h-5 w-5 text-[var(--opc-blue)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-black">Joindre les photos du jour</span>
                      <span className="block truncate text-xs text-slate-500">
                        {progressPhotos.length
                          ? `${progressPhotos.length} photo(s) sélectionnée(s)`
                          : "JPG, PNG ou WebP — maximum 8 photos"}
                      </span>
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className="sr-only"
                      onChange={(event) =>
                        setProgressPhotos(Array.from(event.target.files ?? []).slice(0, 8))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    disabled={progressSaving}
                    onClick={() => void saveProgressUpdate()}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--opc-blue)] px-4 py-3 text-sm font-black text-white disabled:opacity-60"
                  >
                    {progressSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    Enregistrer l’avancement du jour
                  </button>

                  {progressUpdates.length ? (
                    <div className="mt-5 space-y-3">
                      {progressUpdates.map((update) => (
                        <article key={update.id} className="rounded-xl border border-[var(--opc-border)] bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-black">{update.update_date}</p>
                            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-[var(--opc-blue)]">{update.progress}%</span>
                          </div>
                          {update.work_done ? <p className="mt-3 text-sm"><strong>Réalisé :</strong> {update.work_done}</p> : null}
                          {update.ongoing_work ? <p className="mt-2 text-sm"><strong>En cours :</strong> {update.ongoing_work}</p> : null}
                          {update.blockers ? <p className="mt-2 text-sm text-red-700"><strong>Blocage :</strong> {update.blockers}</p> : null}
                          {update.comment ? <p className="mt-2 text-sm text-slate-500">{update.comment}</p> : null}
                          {update.photos?.length ? (
                            <div className="mt-3 grid grid-cols-3 gap-2">
                              {update.photos.map((photo) => (
                                <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-lg bg-slate-100">
                                  {progressPhotoUrls[photo.file_path] ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={progressPhotoUrls[photo.file_path]} alt={photo.caption || `Avancement du ${update.update_date}`} className="h-full w-full object-cover" />
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => setPhotoToDelete(photo)}
                                    className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg bg-white/95 text-[var(--opc-red)] opacity-0 shadow-md transition group-hover:opacity-100 focus:opacity-100"
                                    aria-label="Supprimer cette photo"
                                    title="Supprimer la photo"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}

              <div className="mt-5">
                {editing && projectId ? (
                  <TaskPrerequisitesPanel
                    taskId={editing.id}
                    projectId={projectId}
                    alstomSupervisorId={form.alstom_supervisor_id}
                    avanzitSiteManagerId={form.avanzit_site_manager_id}
                    onStatusChange={() => void loadData(true)}
                  />
                ) : null}
              </div>

              <div className="mt-5">
                <Field label="Documents utilisés">
                  <div className="overflow-hidden rounded-xl border border-[var(--opc-border)]">
                    <div className="flex items-center gap-2 border-b border-[var(--opc-border)] bg-slate-50 px-3">
                      <Search className="h-4 w-4 shrink-0 text-slate-400" />
                      <input
                        type="search"
                        value={documentQuery}
                        onChange={(event) => setDocumentQuery(event.target.value)}
                        placeholder="Rechercher par titre, référence ou statut..."
                        className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none"
                      />
                      <span className="shrink-0 text-xs font-bold text-slate-500">
                        {form.document_ids.length} sélectionné
                        {form.document_ids.length > 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="max-h-64 space-y-2 overflow-y-auto p-3">
                    {visibleDocuments.length ? (
                      visibleDocuments.map((document) => {
                        const checked = form.document_ids.includes(document.id);
                        return (
                          <div
                            key={document.id}
                            className="flex items-center gap-2 rounded-lg p-2 hover:bg-slate-50"
                          >
                            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setForm({
                                    ...form,
                                    document_ids: checked
                                      ? form.document_ids.filter(
                                          (id) => id !== document.id,
                                        )
                                      : [...form.document_ids, document.id],
                                  })
                                }
                                className="h-4 w-4 accent-[var(--opc-blue)]"
                              />
                              <FileText className="h-4 w-4 shrink-0 text-[var(--opc-blue)]" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-bold">
                                  {document.title}
                                </span>
                                <span className="block text-xs text-slate-500">
                                  {document.reference || "Sans référence"} · {document.status}
                                </span>
                              </span>
                            </label>
                            <button
                              type="button"
                              onClick={() => void openDocumentPreview(document)}
                              className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-[var(--opc-blue)]"
                              aria-label={`Prévisualiser ${document.title}`}
                              title="Prévisualiser le PDF"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <a
                              href={`/documents/${document.id}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(event) => event.stopPropagation()}
                              className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-[var(--opc-blue)]"
                              aria-label={`Voir ${document.title}`}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </div>
                        );
                      })
                    ) : (
                      <p className="p-3 text-center text-sm text-slate-400">
                        {documents.length
                          ? "Aucun document ne correspond à la recherche."
                          : "Aucun document disponible dans le volet Documents."}
                      </p>
                    )}
                    </div>
                  </div>
                </Field>
              </div>

              <div className="mt-7 flex flex-wrap justify-between gap-3 border-t border-[var(--opc-border)] pt-5">
                <div>
                  {editing ? (
                    <button type="button" onClick={() => setTaskToDelete(editing)} className="flex items-center gap-2 rounded-xl border border-red-200 px-5 py-3 text-sm font-black text-[var(--opc-red)] hover:bg-red-50">
                      <Trash2 className="h-4 w-4" /> Supprimer
                    </button>
                  ) : null}
                </div>

                <div className="flex gap-3">
                  <button type="button" onClick={closeDrawer} className="rounded-xl border border-[var(--opc-border)] px-5 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">Annuler</button>
                  <button type="submit" disabled={saving || !form.title.trim()} className="flex items-center gap-2 rounded-xl bg-[var(--opc-blue)] px-5 py-3 text-sm font-black text-white disabled:opacity-60">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{editing ? "Enregistrer" : "Créer la tâche"}
                  </button>
                </div>
              </div>
            </form>
          </aside>
        </div>
      ) : null}

      {previewDocument ? (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onMouseDown={closeDocumentPreview}
        >
          <section
            className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between gap-4 border-b border-[var(--opc-border)] px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wide text-[var(--opc-blue)]">
                  Aperçu du document
                </p>
                <h3 className="truncate text-lg font-black text-[var(--opc-ink)]">
                  {previewDocument.title}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/documents/${previewDocument.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--opc-border)] px-3 py-2 text-sm font-bold text-[var(--opc-blue)] hover:bg-blue-50"
                >
                  <ExternalLink className="h-4 w-4" />
                  Fiche complète
                </a>
                <button
                  type="button"
                  onClick={closeDocumentPreview}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--opc-border)] text-slate-500 hover:bg-slate-50"
                  aria-label="Fermer l’aperçu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>

            <div className="min-h-0 flex-1 bg-slate-100">
              {previewLoading ? (
                <div className="grid h-full place-items-center">
                  <Loader2 className="h-8 w-8 animate-spin text-[var(--opc-blue)]" />
                </div>
              ) : previewUrl ? (
                <iframe
                  src={previewUrl}
                  title={`Aperçu PDF de ${previewDocument.title}`}
                  className="h-full w-full border-0"
                />
              ) : (
                <div className="grid h-full place-items-center p-6 text-center">
                  <div>
                    <FileText className="mx-auto h-12 w-12 text-slate-300" />
                    <p className="mt-4 font-black text-[var(--opc-ink)]">
                      Aperçu indisponible
                    </p>
                    <p className="mt-2 max-w-lg text-sm text-slate-500">
                      {previewError}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {taskToDelete ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-[var(--opc-red)]"><Trash2 className="h-5 w-5" /></div>
            <h3 className="mt-4 text-xl font-black text-[var(--opc-ink)]">Supprimer cette tâche ?</h3>
            <p className="mt-2 text-sm text-slate-600">« {taskToDelete.title} » sera supprimée définitivement. Cette action est irréversible.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" disabled={deleting} onClick={() => setTaskToDelete(null)} className="rounded-xl border border-[var(--opc-border)] px-5 py-3 text-sm font-bold text-slate-600">Annuler</button>
              <button type="button" disabled={deleting} onClick={() => void confirmDelete()} className="flex items-center gap-2 rounded-xl bg-[var(--opc-red)] px-5 py-3 text-sm font-black text-white disabled:opacity-60">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Supprimer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDeleteDialog
        open={Boolean(photoToDelete)}
        title="Supprimer cette photo ?"
        description="La photo sera retirée du journal d’avancement et des prochains rapports."
        subject={photoToDelete?.caption || "Photo d’avancement"}
        deleting={photoDeleting}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPhotoToDelete(null);
        }}
        onConfirm={confirmPhotoDelete}
      />

      <style jsx>{`.input{width:100%;border:1px solid var(--opc-border);border-radius:.75rem;background:white;padding:.75rem .875rem;font-size:.875rem;outline:none}.input:focus{border-color:var(--opc-blue);box-shadow:0 0 0 4px rgba(0,80,164,.08)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-sm font-black text-slate-700">{label}</span><div className="mt-2">{children}</div></label>;
}

function FilterSelect({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[var(--opc-border)] bg-white px-3">
      <Filter className="h-4 w-4 text-slate-400" />
      <select value={value} onChange={(event) => onChange(event.target.value)} className="bg-transparent py-2.5 text-sm font-bold text-slate-600 outline-none">{children}</select>
    </div>
  );
}

function Stat({ icon, label, value, red = false, amber = false, green = false }: { icon: React.ReactNode; label: string; value: string; red?: boolean; amber?: boolean; green?: boolean }) {
  const tone = red ? "text-[var(--opc-red)]" : amber ? "text-amber-600" : green ? "text-emerald-600" : "text-[var(--opc-blue)]";
  return (
    <article className="rounded-2xl border border-[var(--opc-border)] bg-white p-5 shadow-sm">
      <div className={`flex items-center gap-2 ${tone}`}>{icon}<p className="text-sm font-semibold text-[var(--opc-muted)]">{label}</p></div>
      <p className={`mt-3 text-3xl font-black ${tone}`}>{value}</p>
    </article>
  );
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const style = priority === "critical"
    ? "bg-red-50 text-red-700"
    : priority === "high"
      ? "bg-amber-50 text-amber-700"
      : priority === "medium"
        ? "bg-blue-50 text-blue-700"
        : "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black ${style}`}>{priorityLabels[priority]}</span>;
}
