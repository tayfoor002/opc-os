"use client";

import Image from "next/image";
import { AppSignature } from "@/components/common/AppSignature";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigationItems } from "@/lib/navigation";

export function Sidebar() {
  const pathname = usePathname();
  const mainItems = navigationItems.filter((item) => !item.footer);
  const footerItems = navigationItems.filter((item) => item.footer);

  return (
    <aside className="hidden h-screen w-[244px] shrink-0 flex-col border-r border-[var(--opc-border)] bg-white lg:flex">
      <div className="border-b border-[var(--opc-border)] px-5 py-5">
        <Image
          src="/alstom-logo.png"
          alt="Alstom"
          width={122}
          height={37}
          priority
          className="h-8 w-auto object-contain object-left"
        />
        <h1 className="mt-6 text-2xl font-black tracking-tight text-[var(--opc-ink)]">OPC OS</h1>
        <div className="mt-5 border-t border-[var(--opc-border)] pt-4">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Projet</p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-lg font-black text-[var(--opc-red)]">PDD</span>
            <span className="text-slate-400">⌄</span>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1.5 overflow-y-auto p-3">
        {mainItems.map(({ label, icon: Icon, href }) => {
          const active = pathname === href;
          return (
            <Link
              key={label}
              href={href}
              className={[
                "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition",
                active
                  ? "bg-[var(--opc-blue)] text-white shadow-sm"
                  : "text-slate-600 hover:bg-[var(--opc-blue-soft)] hover:text-[var(--opc-blue)]",
              ].join(" ")}
            >
              <Icon className={`h-[18px] w-[18px] ${label === "AI Assistant" ? "text-[var(--opc-red)]" : ""}`} />
              <span>{label === "AI Assistant" ? "AI Copilot" : label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[var(--opc-border)] p-3">
        {footerItems.map(({ label, icon: Icon, href }) => (
          <Link
            key={label}
            href={href}
            className="mb-3 flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            <Icon className="h-[18px] w-[18px]" />
            <span>{label}</span>
          </Link>
        ))}

        <div className="flex items-center gap-3 rounded-xl border border-[var(--opc-border)] bg-slate-50 p-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-[var(--opc-blue)] text-xs font-bold text-white">AR</div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">Ayoub Rachidy</p>
            <p className="truncate text-xs text-[var(--opc-muted)]">OPC Travaux</p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-xl bg-[var(--opc-red)] px-4 py-3 text-sm font-black text-white">
          <span>🔔</span>
          <span>1 Alerte</span>
        </div>

        <div className="mt-4 border-t border-[var(--opc-border)] pt-4">
          <AppSignature compact />
        </div>
      </div>
    </aside>
  );
}
