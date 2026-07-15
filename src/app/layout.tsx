import type { Metadata } from "next";
import "./globals.css";
import { SplashScreen } from "@/components/common/SplashScreen";

export const metadata: Metadata = {
  title: "OPC OS",
  description: "Professional Project Operations System"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body><SplashScreen />{children}</body>
    </html>
  );
}
