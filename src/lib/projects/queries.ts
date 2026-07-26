import { createClient } from "@/lib/supabase/server";

export async function getProjects() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("projects")
    .select("id, code, name")
    .order("name");

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}