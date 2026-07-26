export type ProjectOption = {
  id: string;
  code: string | null;
  name: string;
};

export type ZoneOption = {
  id: string;
  project_id: string;
  code: string | null;
  name: string;
};

export type PhaseOption = {
  id: string;
  project_id: string;
  zone_id: string | null;
  code: string | null;
  name: string;
};

export type ActivityOption = {
  id: string;
  project_id: string;
  code: string | null;
  name: string;
};

export type DocumentRelationOptions = {
  zones: ZoneOption[];
  phases: PhaseOption[];
  activities: ActivityOption[];
};

export type DocumentEditValues = {
  title: string;
  reference: string;
  revision: string;
  status: string;
  category: string;
  company: string;
  comments: string;
  document_date: string;
  project_id: string;
  zone_id: string;
  phase_id: string;
  activity_id: string;
};

export type DocumentActionResult =
  | { success: true }
  | {
      success: false;
      error: string;
      fieldErrors?: Record<string, string[] | undefined>;
    };

export type DocumentRelationOptionsResult =
  | {
      success: true;
      options: DocumentRelationOptions;
    }
  | {
      success: false;
      error: string;
    };
