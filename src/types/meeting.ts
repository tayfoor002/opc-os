export type MeetingType =
  | "coordination"
  | "site"
  | "technical"
  | "safety"
  | "client"
  | "other";

export type MeetingStatus = "draft" | "finalized";

export type MeetingParticipant = {
  id: string;
  collaborator_id: string | null;
  name: string;
  company: string;
  role: string;
  manual: boolean;
};

export type MeetingAgendaPoint = {
  id: string;
  subject: string;
  discussion: string;
  decision: string;
  owner: string;
  due_date: string;
  status: "open" | "done";
};

export type MeetingCustomTable = {
  id: string;
  title: string;
  columns: string[];
  rows: string[][];
  source?: "manual" | "excel";
  source_file?: string;
  source_sheet?: string;
};

export type MeetingPhoto = {
  id: string;
  file_path: string;
  caption: string;
  url?: string;
};

export type MeetingMinute = {
  id: string;
  project_id: string;
  zone_id: string | null;
  zone_name?: string;
  title: string;
  meeting_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  meeting_type: MeetingType;
  objective: string | null;
  introduction: string | null;
  participants: MeetingParticipant[];
  agenda_points: MeetingAgendaPoint[];
  custom_tables: MeetingCustomTable[];
  photos: MeetingPhoto[];
  general_notes: string | null;
  next_meeting_date: string | null;
  source_file_path: string | null;
  source_original_name: string | null;
  source_mime_type: string | null;
  ocr_confidence: number | null;
  ocr_warnings: string[];
  status: MeetingStatus;
  created_at: string;
  updated_at: string;
};
