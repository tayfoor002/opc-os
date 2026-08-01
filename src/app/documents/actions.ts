"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDocumentRelationOptions } from "@/lib/documents/queries";
import { comparePdfVersions } from "@/lib/documents/pdf-version-comparison";
import { getDocumentStoragePathCandidates } from "@/lib/documents/storage";
import type {
  DocumentActionResult,
  DocumentRelationOptionsResult,
} from "@/lib/documents/types";
import { createClient } from "@/lib/supabase/server";

const nullableText = (maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === ""
        ? null
        : value,
    z.string().trim().max(maximum).nullable(),
  );

const nullableUuid = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? null : value,
  z.string().uuid().nullable(),
);

const documentMetadataSchema = z.object({
  title: z.string().trim().min(1, "Le titre est obligatoire.").max(250),
  reference: nullableText(120),
  revision: nullableText(50),
  status: z.string().trim().min(1, "Le statut est obligatoire.").max(80),
  category: nullableText(120),
  document_type: z.enum([
    "plan",
    "procedure",
    "pv",
    "icp",
    "pvi",
    "ndc",
    "other",
  ]),
  document_subcategory: nullableText(120),
  execution_status: z.enum([
    "not_applicable",
    "pending",
    "approved",
    "rejected",
  ]),
  company: nullableText(160),
  comments: nullableText(4000),
  document_date: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === ""
        ? null
        : value,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "La date est invalide.")
      .nullable(),
  ),
  project_id: z.string().uuid("Le projet est invalide."),
  zone_id: nullableUuid,
  phase_id: nullableUuid,
  activity_id: nullableUuid,
});

const documentIdSchema = z.string().uuid();
const documentIdsSchema = z.array(documentIdSchema).min(1).max(200);

function safeFileName(fileName: string): string {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-");
}

function normalizeDocumentReference(value: string | null): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleUpperCase("fr")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function revisionRank(value: string | null): number | null {
  const matches = (value ?? "").match(/\d+(?:[.,]\d+)?/g);
  if (!matches?.length) {
    return null;
  }
  const parsed = Number(matches.at(-1)?.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

type ExistingDocumentVersion = {
  id: string;
  reference: string | null;
  revision: string | null;
  file_url: string | null;
};

function isMissingDocumentRelationColumn(
  error: { code?: string; message: string },
  table: string,
): boolean {
  const message = error.message.toLocaleLowerCase("en");
  return (
    (error.code === "PGRST204" || message.includes("does not exist")) &&
    message.includes("document_id") &&
    message.includes(table.toLocaleLowerCase("en"))
  );
}

async function transferDocumentRelations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  previousIds: string[],
  nextId: string,
): Promise<string | null> {
  const { data: taskLinks, error: taskLinksError } = await supabase
    .from("task_documents")
    .select("task_id")
    .in("document_id", previousIds);
  if (taskLinksError) {
    return taskLinksError.message;
  }
  if (taskLinks?.length) {
    const { error } = await supabase.from("task_documents").upsert(
      taskLinks.map(({ task_id }) => ({
        task_id,
        document_id: nextId,
      })),
      { onConflict: "task_id,document_id", ignoreDuplicates: true },
    );
    if (error) {
      return error.message;
    }
  }

  for (const table of [
    "task_document_requirements",
    "photos",
    "reservations",
  ] as const) {
    const { error } = await supabase
      .from(table)
      .update({ document_id: nextId })
      .in("document_id", previousIds);
    if (error) {
      // Some existing OPC OS databases were created before `document_id`
      // was added to these optional legacy tables. In that case there is no
      // document relation to transfer, so the replacement can safely proceed.
      if (isMissingDocumentRelationColumn(error, table)) {
        continue;
      }
      return error.message;
    }
  }

  return null;
}

export async function uploadDocument(
  formData: FormData,
): Promise<DocumentActionResult> {
  const supabase = await createClient();
  const fileEntry = formData.get("file");
  const stagedStoragePath = formData.get("storage_path");
  const stagedFileName = formData.get("file_name");
  const stagedFileType = formData.get("file_type");

  const parsed = documentMetadataSchema.safeParse(
    Object.fromEntries(
      [...formData.entries()].filter(([key]) => key !== "file"),
    ),
  );

  if (!parsed.success) {
    return {
      success: false,
      error: "Vérifie les champs du formulaire.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const values = parsed.data;
  const [validZone, validPhase, validActivity] = await Promise.all([
    validateRelatedEntity("zones", values.zone_id, values.project_id),
    validateRelatedEntity("phases", values.phase_id, values.project_id),
    validateRelatedEntity(
      "activities",
      values.activity_id,
      values.project_id,
    ),
  ]);

  if (!validZone || !validPhase || !validActivity) {
    return {
      success: false,
      error:
        "La zone, la phase ou l’activité ne correspond pas au projet sélectionné.",
    };
  }

  const storage = supabase.storage.from("documents");
  let documentId = crypto.randomUUID();
  let storagePath = "";
  let file: File;
  let requiresServerUpload = false;

  if (fileEntry instanceof File) {
    if (fileEntry.type !== "application/pdf") {
      return { success: false, error: "Le fichier doit être un PDF." };
    }
    file = fileEntry;
    storagePath = `${values.project_id}/${documentId}/${safeFileName(
      file.name,
    )}`;
    requiresServerUpload = true;
  } else if (
    typeof stagedStoragePath === "string" &&
    typeof stagedFileName === "string"
  ) {
    const pathParts = stagedStoragePath.split("/");
    const stagedDocumentId = pathParts[1] ?? "";
    const validStagedPath =
      pathParts.length >= 3 &&
      pathParts[0] === values.project_id &&
      documentIdSchema.safeParse(stagedDocumentId).success &&
      !pathParts.some((part) => part === ".." || part === "");
    if (!validStagedPath) {
      return {
        success: false,
        error: "Le chemin temporaire du PDF est invalide.",
      };
    }

    const { data: stagedFile, error: stagedFileError } =
      await storage.download(stagedStoragePath);
    if (stagedFileError || !stagedFile) {
      return {
        success: false,
        error:
          "Le PDF envoyé directement vers Supabase est introuvable : " +
          (stagedFileError?.message ?? "fichier indisponible"),
      };
    }
    const contentType =
      typeof stagedFileType === "string" && stagedFileType
        ? stagedFileType
        : stagedFile.type;
    if (contentType !== "application/pdf") {
      await storage.remove([stagedStoragePath]);
      return { success: false, error: "Le fichier doit être un PDF." };
    }

    documentId = stagedDocumentId;
    storagePath = stagedStoragePath;
    file = new File([stagedFile], stagedFileName, {
      type: "application/pdf",
    });
  } else {
    return { success: false, error: "Aucun fichier sélectionné." };
  }

  const normalizedReference = normalizeDocumentReference(values.reference);
  const nextRevisionRank = revisionRank(values.revision);
  let olderVersions: ExistingDocumentVersion[] = [];
  let comparisonSummary: string | null = null;

  if (normalizedReference && nextRevisionRank !== null) {
    const { data: projectDocuments, error: versionsError } = await supabase
      .from("documents")
      .select("id, reference, revision, file_url")
      .eq("project_id", values.project_id)
      .not("reference", "is", null);

    if (versionsError) {
      return {
        success: false,
        error: `Impossible de vérifier les versions existantes : ${versionsError.message}`,
      };
    }

    const sameReference = (projectDocuments ?? []).filter(
      (document) =>
        normalizeDocumentReference(document.reference) === normalizedReference,
    );
    const blockingVersion = sameReference.find((document) => {
      const rank = revisionRank(document.revision);
      return rank !== null && rank >= nextRevisionRank;
    });

    if (blockingVersion) {
      return {
        success: false,
        error:
          revisionRank(blockingVersion.revision) === nextRevisionRank
            ? `La révision ${values.revision} existe déjà pour cette référence.`
            : `Une révision plus récente (${blockingVersion.revision}) existe déjà. Aucun document n’a été supprimé.`,
      };
    }

    olderVersions = sameReference.filter((document) => {
      const rank = revisionRank(document.revision);
      return rank !== null && rank < nextRevisionRank;
    });
    const latestOlderVersion = olderVersions
      .slice()
      .sort(
        (left, right) =>
          (revisionRank(right.revision) ?? -1) -
          (revisionRank(left.revision) ?? -1),
      )[0];

    if (latestOlderVersion) {
      if (!latestOlderVersion.file_url) {
        return {
          success: false,
          error:
            "L’ancienne version ne contient aucun PDF. Elle a été conservée et le remplacement a été annulé.",
        };
      }
      const previousStorage = supabase.storage.from("documents");
      let previousFile: Blob | null = null;
      let downloadDetail = "fichier indisponible";
      for (const candidate of getDocumentStoragePathCandidates(
        latestOlderVersion.file_url,
      )) {
        const result = await previousStorage.download(candidate);
        if (!result.error && result.data) {
          previousFile = result.data;
          break;
        }
        downloadDetail = result.error?.message ?? downloadDetail;
      }
      if (!previousFile) {
        return {
          success: false,
          error:
            "Impossible de comparer l’ancienne version avant sa suppression. " +
            `Elle a été conservée. Détail : ${downloadDetail}`,
        };
      }

      try {
        comparisonSummary = await comparePdfVersions({
          previousBytes: new Uint8Array(await previousFile.arrayBuffer()),
          nextFile: file,
          previousRevision: latestOlderVersion.revision,
          nextRevision: values.revision,
        });
      } catch (error) {
        return {
          success: false,
          error:
            "La comparaison des deux PDF a échoué. L’ancienne version a été conservée et aucun remplacement n’a été effectué. " +
            (error instanceof Error ? error.message : ""),
        };
      }
    }
  }

  const { error: uploadError } = requiresServerUpload
    ? await storage.upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      })
    : { error: null };

  if (uploadError) {
    return {
      success: false,
      error: `Erreur d’upload : ${uploadError.message}`,
    };
  }

  const signedUrlResult = await storage.createSignedUrl(storagePath, 60);
  if (signedUrlResult.error || !signedUrlResult.data) {
    await storage.remove([storagePath]);
    return {
      success: false,
      error:
        "Le PDF a été envoyé, mais Supabase refuse son accès privé. " +
        "Vérifie les politiques SELECT de storage.objects pour le bucket " +
        "« documents ». Détail : " +
        (signedUrlResult.error?.message ?? "lien signé indisponible"),
    };
  }

  const comments = [values.comments, comparisonSummary]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4000) || null;
  const { error: insertError } = await supabase.from("documents").insert({
    id: documentId,
    ...values,
    comments,
    file_url: storagePath,
  });

  if (insertError) {
    await storage.remove([storagePath]);
    return {
      success: false,
      error: `Erreur d’enregistrement : ${insertError.message}`,
    };
  }

  if (olderVersions.length) {
    const previousIds = olderVersions.map(({ id }) => id);
    const relationError = await transferDocumentRelations(
      supabase,
      previousIds,
      documentId,
    );
    if (relationError) {
      await supabase.from("documents").delete().eq("id", documentId);
      await storage.remove([storagePath]);
      return {
        success: false,
        error:
          "La nouvelle version n’a pas remplacé l’ancienne car ses liaisons n’ont pas pu être transférées. " +
          relationError,
      };
    }

    const { error: deleteError } = await supabase
      .from("documents")
      .delete()
      .in("id", previousIds);
    if (deleteError) {
      return {
        success: false,
        error:
          "La nouvelle version est enregistrée, mais l’ancienne n’a pas pu être supprimée : " +
          deleteError.message,
      };
    }
    for (const oldVersion of olderVersions) {
      if (!oldVersion.file_url) {
        continue;
      }
      for (const candidate of getDocumentStoragePathCandidates(
        oldVersion.file_url,
      )) {
        const signed = await storage.createSignedUrl(candidate, 30);
        if (!signed.error && signed.data) {
          await storage.remove([candidate]);
          break;
        }
      }
    }
  }

  revalidatePath("/documents");
  return { success: true };
}

export async function loadDocumentRelationOptions(
  projectId: string,
): Promise<DocumentRelationOptionsResult> {
  if (!documentIdSchema.safeParse(projectId).success) {
    return { success: false, error: "Le projet sélectionné est invalide." };
  }

  try {
    const options = await getDocumentRelationOptions(projectId);
    return { success: true, options };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Impossible de charger les données du projet.",
    };
  }
}

export async function findProcedureRegisterTitle(
  projectId: string,
  reference: string,
): Promise<
  | { success: true; title: string | null }
  | { success: false; error: string }
> {
  if (
    !documentIdSchema.safeParse(projectId).success ||
    !reference.trim()
  ) {
    return { success: false, error: "Projet ou référence invalide." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("procedure_register_imports")
    .select("headers,rows")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    return { success: false, error: error.message };
  }
  if (!data) {
    return { success: true, title: null };
  }

  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr")
      .replace(/[^a-z0-9]/g, "");
  const headers = Array.isArray(data.headers)
    ? data.headers.filter((header): header is string => typeof header === "string")
    : [];
  const referenceHeader = headers.find((header) => {
    const key = normalize(header);
    return key.includes("ref") && key.includes("groupement");
  });
  const titleHeader = headers.find((header) => normalize(header) === "titre");
  if (!referenceHeader || !titleHeader || !Array.isArray(data.rows)) {
    return { success: true, title: null };
  }

  const expectedReference = normalizeDocumentReference(reference);
  for (const rawRow of data.rows) {
    if (!rawRow || typeof rawRow !== "object" || !("values" in rawRow)) {
      continue;
    }
    const values = rawRow.values;
    if (!values || typeof values !== "object") {
      continue;
    }
    const record = values as Record<string, unknown>;
    if (
      normalizeDocumentReference(String(record[referenceHeader] ?? "")) ===
      expectedReference
    ) {
      const title = String(record[titleHeader] ?? "").trim();
      return { success: true, title: title || null };
    }
  }

  return { success: true, title: null };
}

export async function applySynchronizedDocumentMetadata(
  documentId: string,
  values: { reference: string; revision: string; title: string },
): Promise<DocumentActionResult> {
  if (!documentIdSchema.safeParse(documentId).success) {
    return { success: false, error: "Identifiant de document invalide." };
  }
  const parsed = z
    .object({
      reference: z.string().trim().min(1).max(120),
      revision: z.string().trim().min(1).max(50),
      title: z.string().trim().min(1).max(250),
    })
    .safeParse(values);
  if (!parsed.success) {
    return {
      success: false,
      error: "Les métadonnées détectées sont invalides.",
    };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("documents")
    .update(parsed.data)
    .eq("id", documentId);
  if (error) {
    return {
      success: false,
      error: `Impossible de corriger le document : ${error.message}`,
    };
  }
  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/documents");
  return { success: true };
}

async function validateRelatedEntity(
  table: "zones" | "phases" | "activities",
  id: string | null,
  projectId: string,
): Promise<boolean> {
  if (!id) {
    return true;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("project_id", projectId)
    .maybeSingle();

  return !error && Boolean(data);
}

export async function updateDocument(
  documentId: string,
  formData: FormData,
): Promise<DocumentActionResult> {
  if (!documentIdSchema.safeParse(documentId).success) {
    return { success: false, error: "Identifiant de document invalide." };
  }

  const parsed = documentMetadataSchema.safeParse(
    Object.fromEntries(formData),
  );

  if (!parsed.success) {
    return {
      success: false,
      error: "Vérifie les champs du formulaire.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const values = parsed.data;
  const [validZone, validPhase, validActivity] = await Promise.all([
    validateRelatedEntity("zones", values.zone_id, values.project_id),
    validateRelatedEntity("phases", values.phase_id, values.project_id),
    validateRelatedEntity(
      "activities",
      values.activity_id,
      values.project_id,
    ),
  ]);

  if (!validZone || !validPhase || !validActivity) {
    return {
      success: false,
      error:
        "La zone, la phase ou l’activité ne correspond pas au projet sélectionné.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("documents")
    .update(values)
    .eq("id", documentId);

  if (error) {
    return {
      success: false,
      error: `Impossible de modifier le document : ${error.message}`,
    };
  }

  revalidatePath("/documents");
  revalidatePath(`/documents/${documentId}`);
  return { success: true };
}

export async function attachDocumentFile(
  documentId: string,
  formData: FormData,
): Promise<DocumentActionResult> {
  if (!documentIdSchema.safeParse(documentId).success) {
    return { success: false, error: "Identifiant de document invalide." };
  }

  const file = formData.get("file");
  const stagedStoragePath = formData.get("storage_path");

  const supabase = await createClient();
  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("project_id")
    .eq("id", documentId)
    .maybeSingle();

  if (documentError) {
    return {
      success: false,
      error: `Impossible de charger le document : ${documentError.message}`,
    };
  }

  if (!document) {
    return { success: false, error: "Ce document n’existe plus." };
  }

  const storage = supabase.storage.from("documents");
  let storagePath = "";
  let requiresServerUpload = false;
  if (file instanceof File) {
    if (file.type !== "application/pdf") {
      return { success: false, error: "Le fichier doit être un PDF." };
    }
    storagePath = `${
      document.project_id
    }/${documentId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    requiresServerUpload = true;
  } else if (
    typeof stagedStoragePath === "string" &&
    stagedStoragePath.startsWith(`${document.project_id}/${documentId}/`) &&
    !stagedStoragePath.split("/").some((part) => !part || part === "..")
  ) {
    storagePath = stagedStoragePath;
  } else {
    return { success: false, error: "Sélectionne un fichier PDF." };
  }

  const { error: uploadError } = requiresServerUpload
    ? await storage.upload(storagePath, file as File, {
        contentType: "application/pdf",
        upsert: false,
      })
    : { error: null };

  if (uploadError) {
    return {
      success: false,
      error: `Impossible d’envoyer le PDF : ${uploadError.message}`,
    };
  }

  const signedUrlResult = await storage.createSignedUrl(storagePath, 60);
  if (signedUrlResult.error || !signedUrlResult.data) {
    await storage.remove([storagePath]);
    return {
      success: false,
      error:
        "Le PDF a été envoyé, mais son accès privé ne peut pas être vérifié. " +
        "Exécute la migration des politiques Storage. Détail : " +
        (signedUrlResult.error?.message ?? "lien signé indisponible"),
    };
  }

  const { error: updateError } = await supabase
    .from("documents")
    .update({ file_url: storagePath })
    .eq("id", documentId);

  if (updateError) {
    await storage.remove([storagePath]);
    return {
      success: false,
      error: `Le PDF a été envoyé, mais le document n’a pas pu être mis à jour : ${updateError.message}`,
    };
  }

  revalidatePath("/documents");
  revalidatePath(`/documents/${documentId}`);
  return { success: true };
}

export async function getTaskDocumentPreview(
  documentId: string,
): Promise<
  | { success: true; title: string; url: string }
  | { success: false; error: string }
> {
  if (!documentIdSchema.safeParse(documentId).success) {
    return { success: false, error: "Identifiant de document invalide." };
  }

  const supabase = await createClient();
  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("title,file_url")
    .eq("id", documentId)
    .maybeSingle();

  if (documentError) {
    return {
      success: false,
      error: `Impossible de charger le document : ${documentError.message}`,
    };
  }

  if (!document) {
    return { success: false, error: "Ce document n’existe plus." };
  }

  if (!document.file_url) {
    return {
      success: false,
      error: "Aucun fichier PDF n’est associé à ce document.",
    };
  }

  const storage = supabase.storage.from("documents");
  for (const path of getDocumentStoragePathCandidates(document.file_url)) {
    const signedUrlResult = await storage.createSignedUrl(path, 300);
    if (!signedUrlResult.error && signedUrlResult.data?.signedUrl) {
      return {
        success: true,
        title: document.title,
        url: signedUrlResult.data.signedUrl,
      };
    }
  }

  return {
    success: false,
    error:
      "Le PDF est introuvable dans le stockage privé. Tu peux le remplacer depuis la fiche du document.",
  };
}

export async function deleteDocument(
  documentId: string,
): Promise<DocumentActionResult> {
  if (!documentIdSchema.safeParse(documentId).success) {
    return { success: false, error: "Identifiant de document invalide." };
  }

  const supabase = await createClient();
  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("file_url")
    .eq("id", documentId)
    .maybeSingle();

  if (documentError) {
    return {
      success: false,
      error: `Impossible de charger le document : ${documentError.message}`,
    };
  }

  if (!document) {
    return { success: false, error: "Ce document n’existe plus." };
  }

  if (document.file_url) {
    const storage = supabase.storage.from("documents");
    const candidates = getDocumentStoragePathCandidates(document.file_url);
    let existingPath: string | null = null;

    for (const candidate of candidates) {
      const signed = await storage.createSignedUrl(candidate, 30);
      if (!signed.error && signed.data) {
        existingPath = candidate;
        break;
      }
    }

    if (!existingPath) {
      return {
        success: false,
        error:
          "Le fichier Storage est introuvable. La ligne de base de données n’a pas été supprimée.",
      };
    }

    const { error: storageError } = await storage.remove([existingPath]);
    if (storageError) {
      return {
        success: false,
        error: `Impossible de supprimer le fichier : ${storageError.message}`,
      };
    }
  }

  const { error: deleteError } = await supabase
    .from("documents")
    .delete()
    .eq("id", documentId);

  if (deleteError) {
    return {
      success: false,
      error:
        "Le fichier a été supprimé, mais la ligne du document n’a pas pu être supprimée : " +
        deleteError.message,
    };
  }

  revalidatePath("/documents");
  return { success: true };
}

export async function deleteDocuments(
  documentIds: string[],
): Promise<DocumentActionResult> {
  const parsedIds = documentIdsSchema.safeParse([...new Set(documentIds)]);
  if (!parsedIds.success) {
    return {
      success: false,
      error: "La sélection de documents est invalide.",
    };
  }

  const supabase = await createClient();
  const { data: documents, error: documentsError } = await supabase
    .from("documents")
    .select("id,file_url")
    .in("id", parsedIds.data);

  if (documentsError) {
    return {
      success: false,
      error: `Impossible de charger les documents : ${documentsError.message}`,
    };
  }
  if (!documents?.length) {
    return {
      success: false,
      error: "Les documents sélectionnés n’existent plus.",
    };
  }
  if (documents.length !== parsedIds.data.length) {
    return {
      success: false,
      error:
        "Certains documents sélectionnés n’existent plus. Actualise la page avant de recommencer.",
    };
  }

  const storage = supabase.storage.from("documents");
  const storagePaths: string[] = [];
  for (const document of documents) {
    if (!document.file_url) continue;

    let existingPath: string | null = null;
    for (const candidate of getDocumentStoragePathCandidates(
      document.file_url,
    )) {
      const signed = await storage.createSignedUrl(candidate, 30);
      if (!signed.error && signed.data) {
        existingPath = candidate;
        break;
      }
    }
    if (!existingPath) {
      return {
        success: false,
        error:
          "Au moins un fichier PDF est introuvable dans le Storage. Aucun document n’a été supprimé.",
      };
    }
    storagePaths.push(existingPath);
  }

  if (storagePaths.length) {
    const { error: storageError } = await storage.remove(storagePaths);
    if (storageError) {
      return {
        success: false,
        error: `Impossible de supprimer les fichiers : ${storageError.message}`,
      };
    }
  }

  const { error: deleteError } = await supabase
    .from("documents")
    .delete()
    .in("id", parsedIds.data);
  if (deleteError) {
    return {
      success: false,
      error:
        "Les fichiers ont été supprimés, mais les lignes documentaires n’ont pas pu être supprimées : " +
        deleteError.message,
    };
  }

  revalidatePath("/documents");
  return { success: true };
}
