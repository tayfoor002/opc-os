"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDocumentRelationOptions } from "@/lib/documents/queries";
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

function safeFileName(fileName: string): string {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-");
}

export async function uploadDocument(
  formData: FormData,
): Promise<DocumentActionResult> {
  const supabase = await createClient();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return { success: false, error: "Aucun fichier sélectionné." };
  }

  if (file.type !== "application/pdf") {
    return { success: false, error: "Le fichier doit être un PDF." };
  }

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

  const documentId = crypto.randomUUID();
  const storagePath = `${values.project_id}/${documentId}/${safeFileName(
    file.name,
  )}`;
  const storage = supabase.storage.from("documents");

  const { error: uploadError } = await storage.upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

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

  const { error: insertError } = await supabase.from("documents").insert({
    id: documentId,
    ...values,
    file_url: storagePath,
  });

  if (insertError) {
    await storage.remove([storagePath]);
    return {
      success: false,
      error: `Erreur d’enregistrement : ${insertError.message}`,
    };
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
