export type ActivityStatus = "not_started" | "in_progress" | "blocked" | "completed";

export type Activity = {
  id: string;
  project_id: string;
  code: string;
  name: string;
  zone: string | null;
  responsible: string | null;
  start_date: string | null;
  finish_date: string | null;
  progress: number;
  status: ActivityStatus;
  critical: boolean;
  created_at: string;
};

export type ActivityFormValues = {
  code: string;
  name: string;
  zone: string;
  responsible: string;
  start_date: string;
  finish_date: string;
  progress: number;
  status: ActivityStatus;
  critical: boolean;
};
