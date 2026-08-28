import { createClient } from "@/lib/supabase/server";
import { getDocumentStoragePathCandidates } from "@/lib/documents/storage";
import type {
  ActivityOption,
  DocumentRelationOptions,
  PhaseOption,
  ZoneOption,
} from "@/lib/documents/types";

export type DocumentListItem = {
  id: string;
  project_id: string;
  reference: string | null;
  title: string;
  revision: string | null;
  status: string | null;
  category: string | null;
  document_type: string;
  document_subcategory: string | null;
  execution_status: string;
  company: string | null;
  comments: string | null;
  document_date: string | null;
  zone_id: string | null;
  file_url: string | null;
  created_at: string;
};

export type DocumentProject = {
  id: string;
  code: string | null;
  name: string;
};

type RelatedEntity = {
  id: string;
  code: string | null;
  name: string;
};

export type DocumentDetails = DocumentListItem & {
  project_id: string;
  company: string | null;
  comments: string | null;
  document_date: string | null;
  zone_id: string | null;
  phase_id: string | null;
  activity_id: string | null;
  file_url: string | null;
  created_at: string;
  updated_at: string | null;
  project: DocumentProject | null;
  zone: RelatedEntity | null;
  phase: RelatedEntity | null;
  activity: RelatedEntity | null;
};

export type DocumentAccess = {
  previewUrl: string | null;
  downloadUrl: string | null;
  error: string | null;
};

const DOCUMENT_COLUMNS =
  "id, project_id, reference, title, revision, status, category, document_type, document_subcategory, execution_status, company, comments, document_date, zone_id, file_url, created_at";

const DOCUMENT_DETAILS_COLUMNS = `
  id,
  project_id,
  title,
  reference,
  revision,
  status,
  category,
  document_type,
  document_subcategory,
  execution_status,
  company,
  comments,
  document_date,
  zone_id,
  phase_id,
  activity_id,
  file_url,
  created_at,
  updated_at,
  project:projects(id, code, name),
  zone:zones(id, code, name),
  phase:phases(id, code, name),
  activity:activities(id, code, name)
`;

export async function getDocuments(): Promise<DocumentListItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("documents")
    .select(DOCUMENT_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Unable to load documents:", error.message);
    return [];
  }

  return (data ?? []) as DocumentListItem[];
}

function normalizeRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function getDocumentById(
  id: string,
): Promise<DocumentDetails | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("documents")
    .select(DOCUMENT_DETAILS_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Impossible de charger le document : ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    ...data,
    project: normalizeRelation(data.project),
    zone: normalizeRelation(data.zone),
    phase: normalizeRelation(data.phase),
    activity: normalizeRelation(data.activity),
  } as DocumentDetails;
}

export async function getDocumentRelationOptions(
  projectId: string,
): Promise<DocumentRelationOptions> {
  const supabase = await createClient();
  const [zones, phases, activities] = await Promise.all([
    supabase
      .from("zones")
      .select("id,project_id,code,name")
      .eq("project_id", projectId)
      .order("name"),
    supabase
      .from("phases")
      .select("id,project_id,zone_id,code,name")
      .eq("project_id", projectId)
      .order("name"),
    supabase
      .from("activities")
      .select("id,project_id,code,name")
      .eq("project_id", projectId)
      .order("name"),
  ]);

  const firstError = [zones.error, phases.error, activities.error].find(
    Boolean,
  );

  if (firstError) {
    throw new Error(firstError.message);
  }

  return {
    zones: (zones.data ?? []) as ZoneOption[],
    phases: (phases.data ?? []) as PhaseOption[],
    activities: (activities.data ?? []) as ActivityOption[],
  };
}

function getFileName(filePath: string, fallbackTitle: string): string {
  const pathWithoutQuery = filePath.split("?")[0];
  const encodedName = pathWithoutQuery.split("/").at(-1);

  if (!encodedName) {
    return `${fallbackTitle}.pdf`;
  }

  try {
    return decodeURIComponent(encodedName);
  } catch {
    return encodedName;
  }
}

export async function getDocumentAccess(
  document: Pick<DocumentDetails, "file_url" | "title">,
): Promise<DocumentAccess> {
  if (!document.file_url) {
    return {
      previewUrl: null,
      downloadUrl: null,
      error: "Aucun fichier PDF n’est associé à ce document.",
    };
  }

  const supabase = await createClient();
  const storage = supabase.storage.from("documents");
  const fileName = getFileName(document.file_url, document.title);
  const candidates = getDocumentStoragePathCandidates(document.file_url);

  for (const storagePath of candidates) {
    const previewResult = await storage.createSignedUrl(storagePath, 60 * 10);

    if (previewResult.error || !previewResult.data) {
      continue;
    }

    const downloadResult = await storage.createSignedUrl(
      storagePath,
      60 * 10,
      { download: fileName },
    );

    if (downloadResult.error || !downloadResult.data) {
      return {
        previewUrl: previewResult.data.signedUrl,
        downloadUrl: null,
        error: `Aperçu disponible, mais téléchargement impossible : ${
          downloadResult.error?.message ?? "lien indisponible"
        }`,
      };
    }

    return {
      previewUrl: previewResult.data.signedUrl,
      downloadUrl: downloadResult.data.signedUrl,
      error: null,
    };
  }

  return {
    previewUrl: null,
    downloadUrl: null,
    error:
      "Le fichier enregistré est introuvable dans le bucket privé « documents ». Vérifie que l’objet n’a pas été déplacé ou supprimé.",
  };
}
