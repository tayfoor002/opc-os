import { createClient } from "@/lib/supabase/server";

export async function getDocuments() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }

  return data;
}