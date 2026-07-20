import {
  APP_AUTHOR,
  APP_AUTHOR_COMPANY,
  APP_AUTHOR_ROLE,
  APP_COPYRIGHT_YEAR,
  APP_NAME,
  APP_VERSION,
} from "@/constants/app";

export function AppSignature({
  compact = false,
  dark = false,
}: {
  compact?: boolean;
  dark?: boolean;
}) {
  const muted = dark ? "text-blue-100/70" : "text-slate-400";
  const strong = dark ? "text-white" : "text-[var(--opc-ink)]";
  const accent = "text-[var(--opc-red)]";

  if (compact) {
    return (
      <div className={`text-[10px] leading-4 ${muted}`}>
        <p>{APP_NAME} v{APP_VERSION}</p>
        <p>© {APP_COPYRIGHT_YEAR} <span className={strong}>{APP_AUTHOR}</span></p>
        <p className={accent}>{APP_AUTHOR_ROLE} · {APP_AUTHOR_COMPANY}</p>
      </div>
    );
  }

  return (
    <div className={`text-center text-xs leading-5 ${muted}`}>
      <p>© {APP_COPYRIGHT_YEAR} {APP_NAME}</p>
      <p>Designed &amp; Developed by</p>
      <p className={`font-black ${strong}`}>{APP_AUTHOR}</p>
      <p className={`font-black ${accent}`}>
        {APP_AUTHOR_ROLE} · {APP_AUTHOR_COMPANY}
      </p>
      <p className="mt-2">Version {APP_VERSION}</p>
    </div>
  );
}
