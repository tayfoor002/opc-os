"use client";

import { FileType2, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function WordPreview({ url, title }: { url: string; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function renderWord() {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Téléchargement temporaire impossible.");
        const content = await response.arrayBuffer();
        const { renderAsync } = await import("docx-preview");
        if (!active || !containerRef.current) return;
        containerRef.current.replaceChildren();
        await renderAsync(content, containerRef.current, undefined, {
          className: "opc-word", inWrapper: true, breakPages: true, useBase64URL: true,
        });
        if (active) setLoading(false);
      } catch (previewError) {
        if (active) {
          setError(previewError instanceof Error ? previewError.message : "Aperçu Word impossible.");
          setLoading(false);
        }
      }
    }
    void renderWord();
    return () => { active = false; };
  }, [url]);

  if (error) {
    return <div className="flex min-h-[560px] items-center justify-center p-8 text-center"><div>
      <FileType2 className="mx-auto size-12 text-blue-300" />
      <p className="mt-3 font-black">Aperçu Word indisponible</p>
      <p className="mt-1 text-sm text-slate-500">{error}</p>
    </div></div>;
  }

  return <div className="relative min-h-[560px] overflow-auto bg-slate-200 p-4" aria-label={`Aperçu Word de ${title}`}>
    {loading ? <div className="absolute left-1/2 top-10 -translate-x-1/2 text-slate-500"><Loader2 className="size-6 animate-spin" /></div> : null}
    <div ref={containerRef} className="relative z-10 [&_.opc-word-wrapper]:bg-transparent [&_.opc-word]:mx-auto [&_.opc-word]:shadow-xl" />
  </div>;
}
