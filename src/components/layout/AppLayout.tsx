import type { ReactNode } from "react";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { GlobalScopeBar } from "@/components/scope/GlobalScopeBar";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[var(--opc-bg)]">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <Header />
        <GlobalScopeBar />
        <main className="px-5 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
