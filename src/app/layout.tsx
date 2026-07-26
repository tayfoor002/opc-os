import type { Metadata } from "next";
import "./globals.css";
import { SplashScreen } from "@/components/common/SplashScreen";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "OPC OS",
  description: "Professional Project Operations System"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={cn("font-sans", inter.variable)}>
      <body><SplashScreen />{children}</body>
    </html>
  );
}
