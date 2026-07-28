"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const updateSchema = z.object({
  task_id: z.string().uuid(),
  update_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  progress: z.coerce.number().min(0).max(100),
  work_done: z.string().trim().max(5000).optional(),
  ongoing_work: z.string().trim().max(5000).optional(),
  blockers: z.string().trim().max(5000).optional(),
  next_steps: z.string().trim().max(5000).optional(),
  comment: z.string().trim().max(5000).optional(),
});

function safeFileName(fileName: string) {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-");
}

export type TaskProgressActionResult =
  | { success: true }
  | { success: false; error: string };

export async function createTaskProgressUpdate(
  formData: FormData,
): Promise<TaskProgressActionResult> {
  const parsed = updateSchema.safeParse(
    Object.fromEntries(
      [...formData.entries()].filter(([key]) => key !== "photos"),
    ),
  );
  if (!parsed.success) {
    return { success: false, error: "Vérifie les informations d’avancement." };
  }

  const photos = formData
    .getAll("photos")
    .filter((item): item is File => item instanceof File && item.size > 0);
  if (photos.length > 8) {
    return { success: false, error: "Maximum 8 photos par mise à jour." };
  }
  for (const photo of photos) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(photo.type)) {
      return { success: false, error: "Formats acceptés : JPG, PNG et WebP." };
    }
    if (photo.size > 8 * 1024 * 1024) {
      return { success: false, error: "Chaque photo doit faire moins de 8 Mo." };
    }
  }

  const supabase = await createClient();
  const taskResult = await supabase
    .from("tasks")
    .select("id,project_id,status")
    .eq("id", parsed.data.task_id)
    .maybeSingle();
  if (taskResult.error || !taskResult.data) {
    return { success: false, error: "La tâche est introuvable." };
  }

  const insertResult = await supabase
    .from("task_progress_updates")
    .insert({
      project_id: taskResult.data.project_id,
      task_id: parsed.data.task_id,
      update_date: parsed.data.update_date,
      progress: parsed.data.progress,
      work_done: parsed.data.work_done || null,
      ongoing_work: parsed.data.ongoing_work || null,
      blockers: parsed.data.blockers || null,
      next_steps: parsed.data.next_steps || null,
      comment: parsed.data.comment || null,
    })
    .select("id")
    .single();
  if (insertResult.error) {
    return { success: false, error: insertResult.error.message };
  }

  const uploadedPaths: string[] = [];
  const storage = supabase.storage.from("task-progress");
  for (const photo of photos) {
    const path = `${taskResult.data.project_id}/${parsed.data.task_id}/${
      insertResult.data.id
    }/${crypto.randomUUID()}-${safeFileName(photo.name)}`;
    const uploadResult = await storage.upload(path, photo, {
      contentType: photo.type,
      upsert: false,
    });
    if (uploadResult.error) {
      if (uploadedPaths.length) await storage.remove(uploadedPaths);
      await supabase
        .from("task_progress_updates")
        .delete()
        .eq("id", insertResult.data.id);
      return {
        success: false,
        error: `Impossible d’envoyer les photos : ${uploadResult.error.message}`,
      };
    }
    uploadedPaths.push(path);
  }

  if (uploadedPaths.length) {
    const photoResult = await supabase.from("task_progress_photos").insert(
      uploadedPaths.map((filePath) => ({
        update_id: insertResult.data.id,
        file_path: filePath,
      })),
    );
    if (photoResult.error) {
      await storage.remove(uploadedPaths);
      await supabase
        .from("task_progress_updates")
        .delete()
        .eq("id", insertResult.data.id);
      return { success: false, error: photoResult.error.message };
    }
  }

  const nextStatus =
    parsed.data.progress >= 100
      ? "done"
      : parsed.data.progress > 0
        ? taskResult.data.status === "blocked"
          ? "blocked"
          : "in_progress"
        : taskResult.data.status;
  const taskUpdate = await supabase
    .from("tasks")
    .update({ progress: parsed.data.progress, status: nextStatus })
    .eq("id", parsed.data.task_id);
  if (taskUpdate.error) {
    return { success: false, error: taskUpdate.error.message };
  }

  revalidatePath("/tasks");
  revalidatePath("/activities");
  revalidatePath("/reporting");
  return { success: true };
}

export async function getTaskProgressPhotoUrls(
  paths: string[],
): Promise<Record<string, string>> {
  const uniquePaths = [...new Set(paths)].filter(Boolean).slice(0, 250);
  if (!uniquePaths.length) return {};

  const supabase = await createClient();
  const storage = supabase.storage.from("task-progress");
  const entries = await Promise.all(
    uniquePaths.map(async (path) => {
      const result = await storage.createSignedUrl(path, 60 * 60);
      return [path, result.data?.signedUrl ?? ""] as const;
    }),
  );
  return Object.fromEntries(entries.filter(([, url]) => Boolean(url)));
}
