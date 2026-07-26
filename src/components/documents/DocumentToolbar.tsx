type DocumentToolbarProps = {
  onCreate?: () => void;
};

export function DocumentToolbar({
  onCreate,
}: DocumentToolbarProps) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-black">Documents</h1>
        <p className="text-sm text-[var(--opc-muted)]">
          Gestion documentaire du projet
        </p>
      </div>

      <button
        onClick={onCreate}
        className="rounded-xl bg-[var(--opc-blue)] px-5 py-3 text-white font-semibold hover:opacity-90 transition"
      >
        + Nouveau document
      </button>
    </div>
  );
}