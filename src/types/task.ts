export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type TaskPriority = "low" | "medium" | "high" | "critical";

export type Task = {
  id: string;
  project_id: string;
  activity_id: string | null;
  title: string;
  description: string | null;
  owner: string | null;
  due_date: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
  activity?: { id: string; code: string; name: string } | null;
};

export type TaskFormValues = {
  title: string;
  description: string;
  owner: string;
  due_date: string;
  priority: TaskPriority;
  status: TaskStatus;
  activity_id: string;
};
