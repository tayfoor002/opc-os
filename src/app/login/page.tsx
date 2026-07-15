import Image from "next/image";
import {
  Eye,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { login } from "@/app/auth/actions";
import {
  APP_AUTHOR,
  APP_AUTHOR_COMPANY,
  APP_AUTHOR_ROLE,
  APP_COPYRIGHT_YEAR,
  APP_NAME,
  APP_VERSION,
} from "@/constants/app";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="min-h-screen bg-white">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
        <section className="relative min-h-[760px] overflow-hidden bg-[#031f3a] px-8 py-8 text-white sm:px-12 lg:px-14 lg:py-10">
          <Image
            src="/rail-blueprint-final.jpg"
            alt=""
            fill
            priority
            className="object-cover object-center"
          />

          <div className="absolute inset-0 bg-gradient-to-b from-[#021a31]/82 via-[#032744]/44 to-[#011426]/88" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#021b33]/88 via-[#032744]/34 to-transparent" />

          <div className="relative z-10 flex h-full min-h-[680px] flex-col">
            <div className="flex items-center gap-4">
              <span className="h-12 w-1 rounded-full bg-[var(--opc-red)]" />
              <Image
                src="/alstom-logo.png"
                alt="Alstom"
                width={190}
                height={58}
                priority
                className="h-12 w-auto object-contain object-left brightness-0 invert"
              />
              <div className="hidden h-10 w-px bg-white/35 sm:block" />
              <div className="hidden text-sm leading-4 text-white/90 sm:block">
                <p>mobility</p>
                <p>by nature</p>
              </div>
            </div>

            <div className="mt-20 max-w-xl">
              <p className="text-sm font-black uppercase tracking-[0.17em] text-[var(--opc-red)]">
                Projet PDD
              </p>
              <h1 className="mt-4 text-6xl font-black tracking-tight sm:text-7xl">
                OPC OS
              </h1>
              <div className="mt-6 h-1 w-20 rounded-full bg-[var(--opc-red)]" />
              <p className="mt-7 max-w-lg text-xl font-medium leading-8 text-white/95">
                Programme de développement
                <br />
                Génie Civil, Installation &amp; VT
              </p>
            </div>

            <div className="mt-12 w-full max-w-sm rounded-2xl border border-white/20 bg-[#04243e]/78 p-5 shadow-2xl backdrop-blur-md">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/5">
                  <ShieldCheck className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-base font-black uppercase tracking-wide">
                    Espace sécurisé
                  </p>
                  <p className="mt-2 text-sm leading-6 text-blue-100/90">
                    Authentification Supabase avec session persistante.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-auto pt-10">
              <div className="grid gap-4 border-t border-white/20 pt-6 text-sm text-white/85 sm:grid-cols-[auto_1px_auto_1fr] sm:items-center">
                <p>© {APP_COPYRIGHT_YEAR} {APP_NAME}</p>
                <span className="hidden h-8 w-px bg-white/20 sm:block" />
                <p className="font-black text-white">v{APP_VERSION}</p>
                <div className="sm:text-right">
                  <p>{APP_AUTHOR_ROLE} · {APP_AUTHOR_COMPANY}</p>
                  <p className="mt-1 font-black text-white">{APP_AUTHOR}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative flex items-center justify-center bg-gradient-to-br from-white via-white to-slate-50 px-6 py-14 sm:px-10 lg:px-16">
          <div className="pointer-events-none absolute right-16 top-10 grid grid-cols-3 gap-3 opacity-25">
            {Array.from({ length: 9 }, (_, index) => (
              <span key={index} className="h-1.5 w-1.5 rounded-full bg-slate-300" />
            ))}
          </div>

          <div className="w-full max-w-xl">
            <p className="text-sm font-black uppercase tracking-[0.15em] text-[var(--opc-red)]">
              Connexion
            </p>
            <h2 className="mt-5 text-4xl font-black tracking-tight text-[var(--opc-ink)] sm:text-5xl">
              Bienvenue dans OPC OS
            </h2>
            <div className="mt-5 h-1 w-20 rounded-full bg-[var(--opc-red)]" />
            <p className="mt-7 text-lg text-[var(--opc-muted)]">
              Connecte-toi pour accéder au projet PDD.
            </p>

            {params.error ? (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                {params.error}
              </div>
            ) : null}

            <form action={login} className="mt-12 space-y-7">
              <label className="block">
                <span className="text-sm font-black text-slate-800">
                  Adresse e-mail
                </span>
                <div className="mt-3 flex items-center gap-3 rounded-2xl border border-slate-300 bg-white px-5 py-4 shadow-sm transition focus-within:border-[var(--opc-red)] focus-within:ring-4 focus-within:ring-red-100">
                  <Mail className="h-5 w-5 text-slate-500" />
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="Entrez votre adresse e-mail"
                    className="w-full bg-transparent text-base outline-none placeholder:text-slate-400"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-black text-slate-800">
                  Mot de passe
                </span>
                <div className="mt-3 flex items-center gap-3 rounded-2xl border border-slate-300 bg-white px-5 py-4 shadow-sm transition focus-within:border-[var(--opc-red)] focus-within:ring-4 focus-within:ring-red-100">
                  <LockKeyhole className="h-5 w-5 text-slate-500" />
                  <input
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="Entrez votre mot de passe"
                    className="w-full bg-transparent text-base outline-none placeholder:text-slate-400"
                  />
                  <Eye className="h-5 w-5 text-slate-500" />
                </div>
              </label>

              <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <label className="flex cursor-pointer items-center gap-3 font-medium text-slate-700">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="h-5 w-5 rounded border-slate-300 accent-[var(--opc-red)]"
                  />
                  Se souvenir de moi
                </label>
                <button
                  type="button"
                  className="text-left font-bold text-[var(--opc-blue)] hover:underline"
                >
                  Mot de passe oublié ?
                </button>
              </div>

              <button
                type="submit"
                className="w-full rounded-2xl bg-gradient-to-r from-[#d61124] to-[#f12637] px-5 py-4 text-base font-black text-white shadow-[0_12px_32px_rgba(226,43,58,0.25)] transition hover:brightness-105"
              >
                Se connecter
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
