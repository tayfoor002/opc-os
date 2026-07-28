export type ActivityStatus = "not_started" | "in_progress" | "blocked" | "completed";

export type Activity = {
  id: string;
  project_id: string;
  zone_id: string | null;
  phase_id: string | null;
  zone_element_id: string | null;
  alstom_supervisor_id: string | null;
  avanzit_site_manager_id: string | null;
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
  start_date: string;
  finish_date: string;
  progress: number;
  status: ActivityStatus;
  critical: boolean;
  zone_id: string;
  phase_id: string;
  zone_element_id: string;
};
