"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type PasswordResult = {error?:string;message?:string};
export async function requestPasswordReset(_state:PasswordResult,form:FormData):Promise<PasswordResult> {
  const email=z.string().trim().email().safeParse(form.get("email"));
  if(!email.success)return {error:"Saisis une adresse e-mail valide."};
  const origin=(await headers()).get("origin");
  const allowed=["http://127.0.0.1:3000","http://localhost:3000","https://opc-os.vercel.app"];
  const base=origin&&allowed.includes(origin)?origin:"https://opc-os.vercel.app";
  const supabase=await createClient();
  const {error}=await supabase.auth.resetPasswordForEmail(email.data,{redirectTo:`${base}/auth/callback`});
  if(error)return {error:error.status===429?"Trop de demandes. Patiente quelques minutes avant de réessayer.":"L’envoi n’a pas abouti. Réessaie dans quelques minutes ou contacte l’administrateur."};
  return {message:"Si cette adresse correspond à un compte, un lien de réinitialisation a été envoyé. Vérifie aussi les courriers indésirables. Ouvre le lien dans le même navigateur que cette demande."};
}
export async function changePassword(_state:PasswordResult,form:FormData):Promise<PasswordResult> {
  const password=z.string().min(8).max(128).safeParse(form.get("password"));
  if(!password.success)return {error:"Choisis un mot de passe de 8 à 128 caractères."};
  if(password.data!==form.get("confirm"))return {error:"Les deux mots de passe ne correspondent pas."};
  const supabase=await createClient();
  const {data}=await supabase.auth.getUser();
  if(!data.user)return {error:"Le lien est expiré ou invalide. Demande un nouveau lien."};
  const {error}=await supabase.auth.updateUser({password:password.data});
  if(error)return {error:"Le mot de passe n’a pas pu être enregistré. Vérifie les exigences de sécurité ou demande un nouveau lien."};
  await supabase.auth.signOut();
  redirect("/auth/password-updated");
}
