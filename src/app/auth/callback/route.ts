import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request:NextRequest){
  const url=new URL(request.url);const code=url.searchParams.get("code");const tokenHash=url.searchParams.get("token_hash");
  const supabase=await createClient();
  if(code){const {error}=await supabase.auth.exchangeCodeForSession(code);if(!error)return NextResponse.redirect(new URL("/auth/reset-password",url.origin));}
  else if(tokenHash&&url.searchParams.get("type")==="recovery"){const {error}=await supabase.auth.verifyOtp({token_hash:tokenHash,type:"recovery"});if(!error)return NextResponse.redirect(new URL("/auth/reset-password",url.origin));}
  return NextResponse.redirect(new URL("/auth/forgot-password?invalid=1",url.origin));
}
