import Image from "next/image";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  APP_AUTHOR,
  APP_AUTHOR_COMPANY,
  APP_AUTHOR_ROLE,
  APP_COPYRIGHT_YEAR,
  APP_NAME,
  APP_VERSION,
} from "@/constants/app";

export default function AboutPage() {
  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl">
        <section className="overflow-hidden rounded-3xl border border-[var(--opc-border)] bg-white shadow-sm">
          <div className="border-b border-[var(--opc-border)] bg-slate-50 px-8 py-6">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--opc-red)]">
              À propos
            </p>
            <h1 className="mt-2 text-4xl font-black text-[var(--opc-ink)]">
              {APP_NAME}
            </h1>
          </div>

          <div className="p-8">
            <Image
              src="/alstom-logo.png"
              alt="Alstom"
              width={120}
              height={36}
              className="h-8 w-auto object-contain"
              priority
            />

            <p className="mt-8 text-sm font-black uppercase tracking-[0.22em] text-[var(--opc-blue)]">
              Project Operations Control System
            </p>
            <p className="mt-3 text-[var(--opc-muted)]">
              Projet PDD — Programme de développement - Génie Civil, Installation & VT.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <Info label="Version" value={APP_VERSION} />
              <Info label="Projet" value="PDD" />
              <Info label="Développé par" value={APP_AUTHOR} />
              <Info label="Profil" value={`${APP_AUTHOR_ROLE} · ${APP_AUTHOR_COMPANY}`} />
            </div>

            <div className="mt-8 rounded-2xl bg-slate-50 p-5">
              <h2 className="font-black">Technologies</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--opc-muted)]">
                Next.js · TypeScript · Tailwind CSS · Supabase
              </p>
            </div>

            <p className="mt-8 text-center text-xs text-slate-400">
              © {APP_COPYRIGHT_YEAR} {APP_NAME}. Tous droits réservés.
            </p>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--opc-border)] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-sm font-black text-[var(--opc-ink)]">{value}</p>
    </div>
  );
}
