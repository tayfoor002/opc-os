export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type TaskPriority = "low" | "medium" | "high" | "critical";
export type TaskProgressMode = "manual" | "quantity" | "building";
export type TaskWorkType =
  | "standard"
  | "gc_excavation_trench"
  | "gc_concrete_trench"
  | "gc_building";

export type Task = {
  id: string;
  project_id: string;
  activity_id: string | null;
  zone_id: string | null;
  phase_id: string | null;
  zone_element_id: string | null;
  alstom_supervisor_id: string | null;
  avanzit_site_manager_id: string | null;
  title: string;
  description: string | null;
  owner: string | null;
  start_date: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  progress: number;
  progress_mode: TaskProgressMode;
  work_type: TaskWorkType;
  target_quantity: number | null;
  completed_quantity: number;
  progress_unit: string;
  created_at: string;
  updated_at: string;
  activity?: { id: string; code: string; name: string } | null;
  document_ids?: string[];
};

export type TaskFormValues = {
  title: string;
  description: string;
  owner: string;
  start_date: string;
  due_date: string;
  priority: TaskPriority;
  status: TaskStatus;
  progress_mode: TaskProgressMode;
  work_type: TaskWorkType;
  target_quantity: number | null;
  completed_quantity: number;
  progress_unit: string;
  activity_id: string;
  zone_id: string;
  phase_id: string;
  zone_element_id: string;
  alstom_supervisor_id: string;
  avanzit_site_manager_id: string;
  document_ids: string[];
};
