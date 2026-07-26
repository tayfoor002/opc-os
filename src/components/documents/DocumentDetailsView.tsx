import Link from "next/link";
import { ArrowLeft, CalendarDays, FileText } from "lucide-react";

import { DocumentDetailsActions } from "@/components/documents/DocumentDetailsActions";
import type {
  DocumentAccess,
  DocumentDetails,
} from "@/lib/documents/queries";
import type {
  DocumentRelationOptions,
  ProjectOption,
} from "@/lib/documents/types";

type DocumentDetailsViewProps = {
  document: DocumentDetails;
  access: DocumentAccess;
  projects: ProjectOption[];
  initialOptions: DocumentRelationOptions;
};

type MetadataItemProps = {
  label: string;
  value: string | null;
};

function MetadataItem({ label, value }: MetadataItemProps) {
  return (
    <div className="border-b border-slate-100 py-3 last:border-b-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--opc-muted)]">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold text-[var(--opc-ink)]">
        {value || "—"}
      </dd>
    </div>
  );
}

function formatDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(value));
}

function relationLabel(
  relation: { code: string | null; name: string } | null,
  fallbackId: string | null,
): string | null {
  if (!relation) {
    return fallbackId;
  }

  return [relation.code, relation.name].filter(Boolean).join(" — ");
}

export function DocumentDetailsView({
  document,
  access,
  projects,
  initialOptions,
}: DocumentDetailsViewProps) {
  const projectName = document.project
    ? [document.project.code, document.project.name].filter(Boolean).join(" — ")
    : null;

  return (
    <div className="mx-auto max-w-[1700px]">
      <Link
        href="/documents"
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--opc-blue)] hover:underline"
      >
        <ArrowLeft className="size-4" />
        Retour aux documents
      </Link>

      <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[var(--opc-blue-soft)] px-3 py-1 text-xs font-bold text-[var(--opc-blue)]">
              {document.status ?? "Non défini"}
            </span>
            {document.reference ? (
              <span className="text-sm font-semibold text-[var(--opc-muted)]">
                {document.reference}
              </span>
            ) : null}
          </div>
          <h1 className="break-words text-3xl font-black text-[var(--opc-ink)]">
            {document.title}
          </h1>
          <p className="mt-2 text-sm text-[var(--opc-muted)]">
            {projectName ?? "Projet non renseigné"}
          </p>
        </div>

        <DocumentDetailsActions
          documentId={document.id}
          title={document.title}
          downloadUrl={access.downloadUrl}
          projects={projects}
          initialOptions={initialOptions}
          initialValues={{
            title: document.title,
            reference: document.reference ?? "",
            revision: document.revision ?? "",
            status: document.status ?? "Draft",
            category: document.category ?? "",
            company: document.company ?? "",
            comments: document.comments ?? "",
            document_date: document.document_date ?? "",
            project_id: document.project_id,
            zone_id: document.zone_id ?? "",
            phase_id: document.phase_id ?? "",
            activity_id: document.activity_id ?? "",
          }}
        />
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
        <aside className="self-start rounded-2xl border border-[var(--opc-border)] bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <FileText className="size-5 text-[var(--opc-blue)]" />
            <h2 className="text-lg font-black">Métadonnées</h2>
          </div>
          <dl>
            <MetadataItem label="Projet" value={projectName} />
            <MetadataItem label="Référence" value={document.reference} />
            <MetadataItem label="Révision" value={document.revision} />
            <MetadataItem label="Statut" value={document.status} />
            <MetadataItem label="Catégorie" value={document.category} />
            <MetadataItem label="Entreprise" value={document.company} />
            <MetadataItem
              label="Date du document"
              value={formatDate(document.document_date)}
            />
            <MetadataItem
              label="Zone"
              value={relationLabel(document.zone, document.zone_id)}
            />
            <MetadataItem
              label="Phase"
              value={relationLabel(document.phase, document.phase_id)}
            />
            <MetadataItem
              label="Activité"
              value={relationLabel(document.activity, document.activity_id)}
            />
            <MetadataItem label="Commentaires" value={document.comments} />
          </dl>
          <div className="mt-4 flex items-center gap-2 text-xs text-[var(--opc-muted)]">
            <CalendarDays className="size-4" />
            Ajouté le {formatDate(document.created_at)}
          </div>
        </aside>

        <section className="min-h-[65vh] overflow-hidden rounded-2xl border border-[var(--opc-border)] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[var(--opc-border)] px-5 py-4">
            <h2 className="font-black">Aperçu PDF</h2>
            <span className="text-xs text-[var(--opc-muted)]">
              Lien sécurisé temporaire
            </span>
          </div>

          {access.previewUrl ? (
            <iframe
              src={access.previewUrl}
              title={`Aperçu PDF de ${document.title}`}
              className="h-[75vh] min-h-[560px] w-full bg-slate-100"
            />
          ) : (
            <div className="flex min-h-[560px] items-center justify-center p-8 text-center">
              <div className="max-w-md">
                <FileText className="mx-auto mb-4 size-12 text-slate-300" />
                <p className="font-bold">Aperçu indisponible</p>
                <p className="mt-2 text-sm text-[var(--opc-muted)]">
                  {access.error ?? "Le fichier PDF ne peut pas être affiché."}
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
