"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const updateSchema = z.object({
  task_id: z.string().uuid(),
  update_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  progress: z.coerce.number().min(0).max(100),
  completed_quantity: z.coerce.number().min(0).optional(),
  work_done: z.string().trim().max(5000).optional(),
  ongoing_work: z.string().trim().max(5000).optional(),
  blockers: z.string().trim().max(5000).optional(),
  next_steps: z.string().trim().max(5000).optional(),
  comment: z.string().trim().max(5000).optional(),
});

const editUpdateSchema = updateSchema.extend({
  update_id: z.string().uuid(),
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
    .select(
      "id,project_id,status,progress,progress_mode,target_quantity,completed_quantity",
    )
    .eq("id", parsed.data.task_id)
    .maybeSingle();
  if (taskResult.error || !taskResult.data) {
    return { success: false, error: "La tâche est introuvable." };
  }

  let resolvedProgress = parsed.data.progress;
  const taskProgressUpdate: Record<string, unknown> = {};
  if (taskResult.data.progress_mode === "quantity") {
    const completedQuantity = parsed.data.completed_quantity;
    const targetQuantity = Number(taskResult.data.target_quantity ?? 0);
    if (
      completedQuantity === undefined ||
      targetQuantity <= 0 ||
      completedQuantity > targetQuantity
    ) {
      return {
        success: false,
        error:
          "La quantité réalisée doit être comprise entre 0 et la quantité totale.",
      };
    }
    resolvedProgress = Math.min(
      100,
      Math.round((completedQuantity / targetQuantity) * 10_000) / 100,
    );
    taskProgressUpdate.completed_quantity = completedQuantity;
  } else if (taskResult.data.progress_mode === "building") {
    resolvedProgress = Number(taskResult.data.progress ?? 0);
  }

  const insertResult = await supabase
    .from("task_progress_updates")
    .insert({
      project_id: taskResult.data.project_id,
      task_id: parsed.data.task_id,
      update_date: parsed.data.update_date,
      progress: resolvedProgress,
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
    resolvedProgress >= 100
      ? "done"
      : resolvedProgress > 0
        ? taskResult.data.status === "blocked"
          ? "blocked"
          : "in_progress"
        : taskResult.data.status;
  const taskUpdate = await supabase
    .from("tasks")
    .update({
      ...taskProgressUpdate,
      progress: resolvedProgress,
      status: nextStatus,
    })
    .eq("id", parsed.data.task_id);
  if (taskUpdate.error) {
    return { success: false, error: taskUpdate.error.message };
  }

  revalidatePath("/tasks");
  revalidatePath("/activities");
  revalidatePath("/reporting");
  return { success: true };
}

export async function updateTaskProgressUpdate(
  formData: FormData,
): Promise<TaskProgressActionResult> {
  const parsed = editUpdateSchema.safeParse(
    Object.fromEntries(
      [...formData.entries()].filter(([key]) => key !== "photos"),
    ),
  );
  if (!parsed.success) {
    return { success: false, error: "Vérifie les informations de cette journée." };
  }

  const photos = formData
    .getAll("photos")
    .filter((item): item is File => item instanceof File && item.size > 0);
  for (const photo of photos) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(photo.type)) {
      return { success: false, error: "Formats acceptés : JPG, PNG et WebP." };
    }
    if (photo.size > 8 * 1024 * 1024) {
      return { success: false, error: "Chaque photo doit faire moins de 8 Mo." };
    }
  }

  const supabase = await createClient();
  const [taskResult, updateResult, photoCountResult] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "id,project_id,status,progress,progress_mode,target_quantity,completed_quantity",
      )
      .eq("id", parsed.data.task_id)
      .maybeSingle(),
    supabase
      .from("task_progress_updates")
      .select("id,task_id")
      .eq("id", parsed.data.update_id)
      .eq("task_id", parsed.data.task_id)
      .maybeSingle(),
    supabase
      .from("task_progress_photos")
      .select("id", { count: "exact", head: true })
      .eq("update_id", parsed.data.update_id),
  ]);
  if (taskResult.error || !taskResult.data) {
    return { success: false, error: "La tâche est introuvable." };
  }
  if (updateResult.error || !updateResult.data) {
    return { success: false, error: "La journée d’avancement est introuvable." };
  }
  if (photoCountResult.error) {
    return { success: false, error: photoCountResult.error.message };
  }
  if ((photoCountResult.count ?? 0) + photos.length > 8) {
    return {
      success: false,
      error: "Maximum 8 photos au total pour une même journée.",
    };
  }

  let resolvedProgress = parsed.data.progress;
  if (taskResult.data.progress_mode === "quantity") {
    const completedQuantity = parsed.data.completed_quantity;
    const targetQuantity = Number(taskResult.data.target_quantity ?? 0);
    if (
      completedQuantity === undefined ||
      targetQuantity <= 0 ||
      completedQuantity > targetQuantity
    ) {
      return {
        success: false,
        error:
          "La quantité réalisée doit être comprise entre 0 et la quantité totale.",
      };
    }
    resolvedProgress = Math.min(
      100,
      Math.round((completedQuantity / targetQuantity) * 10_000) / 100,
    );
  } else if (taskResult.data.progress_mode === "building") {
    resolvedProgress = Number(taskResult.data.progress ?? 0);
  }

  const saveResult = await supabase
    .from("task_progress_updates")
    .update({
      update_date: parsed.data.update_date,
      progress: resolvedProgress,
      work_done: parsed.data.work_done || null,
      ongoing_work: parsed.data.ongoing_work || null,
      blockers: parsed.data.blockers || null,
      next_steps: parsed.data.next_steps || null,
      comment: parsed.data.comment || null,
    })
    .eq("id", parsed.data.update_id)
    .eq("task_id", parsed.data.task_id);
  if (saveResult.error) {
    return { success: false, error: saveResult.error.message };
  }

  const uploadedPaths: string[] = [];
  const storage = supabase.storage.from("task-progress");
  for (const photo of photos) {
    const path = `${taskResult.data.project_id}/${parsed.data.task_id}/${
      parsed.data.update_id
    }/${crypto.randomUUID()}-${safeFileName(photo.name)}`;
    const uploadResult = await storage.upload(path, photo, {
      contentType: photo.type,
      upsert: false,
    });
    if (uploadResult.error) {
      if (uploadedPaths.length) await storage.remove(uploadedPaths);
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
        update_id: parsed.data.update_id,
        file_path: filePath,
      })),
    );
    if (photoResult.error) {
      await storage.remove(uploadedPaths);
      return { success: false, error: photoResult.error.message };
    }
  }

  if (taskResult.data.progress_mode !== "building") {
    const latestResult = await supabase
      .from("task_progress_updates")
      .select("progress")
      .eq("task_id", parsed.data.task_id)
      .order("update_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestResult.error) {
      return { success: false, error: latestResult.error.message };
    }

    const latestProgress = Number(latestResult.data?.progress ?? 0);
    const taskPatch: Record<string, unknown> = {
      progress: latestProgress,
      status:
        latestProgress >= 100
          ? "done"
          : latestProgress > 0
            ? taskResult.data.status === "blocked"
              ? "blocked"
              : "in_progress"
            : taskResult.data.status === "blocked"
              ? "blocked"
              : "todo",
    };
    if (taskResult.data.progress_mode === "quantity") {
      taskPatch.completed_quantity =
        Math.round(
          (Number(taskResult.data.target_quantity ?? 0) * latestProgress) / 100 *
            100,
        ) / 100;
    }
    const taskUpdateResult = await supabase
      .from("tasks")
      .update(taskPatch)
      .eq("id", parsed.data.task_id);
    if (taskUpdateResult.error) {
      return { success: false, error: taskUpdateResult.error.message };
    }
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

export async function deleteTaskProgressPhoto(
  photoId: string,
): Promise<TaskProgressActionResult> {
  const parsedId = z.string().uuid().safeParse(photoId);
  if (!parsedId.success) {
    return { success: false, error: "Photo invalide." };
  }

  const supabase = await createClient();
  const photoResult = await supabase
    .from("task_progress_photos")
    .select("id,file_path")
    .eq("id", parsedId.data)
    .maybeSingle();
  if (photoResult.error || !photoResult.data) {
    return { success: false, error: "La photo est introuvable." };
  }

  const deleteResult = await supabase
    .from("task_progress_photos")
    .delete()
    .eq("id", parsedId.data);
  if (deleteResult.error) {
    return { success: false, error: deleteResult.error.message };
  }

  await supabase.storage
    .from("task-progress")
    .remove([photoResult.data.file_path]);

  revalidatePath("/tasks");
  revalidatePath("/reporting");
  return { success: true };
}
