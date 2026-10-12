import { PasswordForm } from "@/components/auth/PasswordForm";
export default async function ForgotPasswordPage({searchParams}:{searchParams:Promise<{invalid?:string}>}){const params=await searchParams;return <PasswordForm initialError={params.invalid?"Le lien est expiré ou ne correspond pas à ce navigateur. Demande un nouveau lien.":undefined}/>;}
