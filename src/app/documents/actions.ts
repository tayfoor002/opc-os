"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type UploadResult =
  | { success: true }
  | { success: false; error: string };

export async function uploadDocument(
  formData: FormData
): Promise<UploadResult> {
  const supabase = await createClient();

  const file = formData.get("file");
  const projectId = formData.get("projectId");

  if (!(file instanceof File)) {
    return { success: false, error: "Aucun fichier sélectionné." };
  }

  if (!projectId || typeof projectId !== "string") {
    return { success: false, error: "Sélectionne un projet." };
  }

  if (file.type !== "application/pdf") {
    return { success: false, error: "Le fichier doit être un PDF." };
  }

  const safeName = file.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-");

  const storagePath = `${projectId}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return {
      success: false,
      error: `Erreur d'upload : ${uploadError.message}`,
    };
  }

  const title = file.name.replace(/\.pdf$/i, "");

  const { error: insertError } = await supabase.from("documents").insert({
    project_id: projectId,
    title,
    file_url: storagePath,
    status: "Draft",
  });

  if (insertError) {
    await supabase.storage.from("documents").remove([storagePath]);

    return {
      success: false,
      error: `Erreur d'enregistrement : ${insertError.message}`,
    };
  }

  revalidatePath("/documents");

  return { success: true };
}