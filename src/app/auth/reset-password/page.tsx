import Link from "next/link";
import { PasswordForm } from "@/components/auth/PasswordForm";
import { createClient } from "@/lib/supabase/server";
export default async function ResetPasswordPage(){
  const supabase=await createClient();const {data}=await supabase.auth.getUser();
  if(data.user)return <PasswordForm reset/>;
  return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><section className="max-w-md rounded-xl border bg-white p-8"><h1 className="text-xl font-bold">Lien expiré ou invalide</h1><p className="my-4 text-sm">Ouvre le lien reçu par e-mail dans le navigateur où tu as demandé la réinitialisation.</p><Link className="font-bold text-blue-700" href="/auth/forgot-password">Demander un nouveau lien</Link></section></main>;
}
