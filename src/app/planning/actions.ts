"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validDate } from "@/lib/planning/schedule";

const date = z.string().refine(validDate, "Date invalide");
const schema = z.object({
  projectId: z.string().uuid(), source: z.string().trim().min(1).max(200),
  rows: z.array(z.object({
    task_id: z.string().uuid().nullable(), activity_id: z.string().uuid().nullable(),
    title: z.string().trim().min(1).max(250), start: date, finish: date,
    expected_start: date.nullable(), expected_finish: date.nullable(),
    source_key: z.string().max(1000).optional(),
    metadata: z.object({predecessors: z.array(z.string().max(250)).max(100), parent: z.string().max(250)}).optional(),
  }).refine(row => row.start <= row.finish, "La fin précède le début").refine(row => row.task_id || row.activity_id, "Activité requise")).min(1).max(1000),
});

export async function saveScheduleChanges(input: unknown): Promise<{success: true; count: number} | {success: false; error: string}> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return {success: false, error: parsed.error.issues[0]?.message ?? "Planning invalide"};
  const supabase = await createClient();
  const user = await supabase.auth.getUser();
  if (!user.data.user) return {success:false,error:"Reconnecte-toi pour enregistrer le planning."};
  const result = await supabase.rpc("apply_schedule_changes", {p_project_id: parsed.data.projectId, p_source_name: parsed.data.source, p_rows: parsed.data.rows});
  if (result.error) return {success: false, error: result.error.message.includes("schema cache") || result.error.message.includes("does not exist") ? "La migration Planning 019 doit être installée avant l’enregistrement." : result.error.message};
  for (const path of ["/planning", "/tasks", "/activities", "/"]) revalidatePath(path);
  return {success:true,count:Number(result.data?.count ?? 0)};
}
