import { AppLayout } from "@/components/layout/AppLayout";

export default function Page() {
  return (
    <AppLayout>
      <section className="rounded-2xl border border-[var(--opc-border)] bg-white p-8 shadow-sm">
        <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--opc-blue)]">Prochain sprint</p>
        <h1 className="mt-2 text-4xl font-black">Tasks</h1>
        <p className="mt-3 text-[var(--opc-muted)]">Ce module sera construit dans un prochain sprint.</p>
      </section>
    </AppLayout>
  );
}
