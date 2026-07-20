"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  APP_AUTHOR,
  APP_AUTHOR_COMPANY,
  APP_AUTHOR_ROLE,
  APP_COPYRIGHT_YEAR,
  APP_NAME,
} from "@/constants/app";

export function SplashScreen() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const alreadyShown = sessionStorage.getItem("opc-os-splash-shown");
    if (alreadyShown) {
      setVisible(false);
      return;
    }

    const timer = window.setTimeout(() => {
      sessionStorage.setItem("opc-os-splash-shown", "true");
      setVisible(false);
    }, 1600);

    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[var(--opc-blue)] text-white">
      <div className="relative flex w-full max-w-xl flex-col items-center px-6 text-center">
        <div className="absolute -top-32 right-0 h-64 w-64 rounded-full bg-white/5" />
        <Image
          src="/alstom-logo.png"
          alt="Alstom"
          width={125}
          height={38}
          className="h-8 w-auto object-contain brightness-0 invert"
          priority
        />
        <h1 className="mt-8 text-5xl font-black tracking-tight">{APP_NAME}</h1>
        <p className="mt-3 text-xs font-black uppercase tracking-[0.26em] text-blue-100">
          Project Operations Control System
        </p>

        <div className="mt-10 h-1.5 w-56 overflow-hidden rounded-full bg-white/15">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-[var(--opc-red)]" />
        </div>
        <p className="mt-3 text-xs text-blue-100">Chargement...</p>

        <div className="mt-12 text-xs leading-5 text-blue-100/75">
          <p>Designed &amp; Developed by</p>
          <p className="font-black text-white">{APP_AUTHOR}</p>
          <p className="font-black text-red-200">
            {APP_AUTHOR_ROLE} · {APP_AUTHOR_COMPANY}
          </p>
          <p className="mt-2">© {APP_COPYRIGHT_YEAR} {APP_NAME}</p>
        </div>
      </div>
    </div>
  );
}
