import { notFound } from "next/navigation";

import { DocumentDetailsView } from "@/components/documents/DocumentDetailsView";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  getDocumentAccess,
  getDocumentById,
  getDocumentRelationOptions,
} from "@/lib/documents/queries";
import { getProjects } from "@/lib/projects/queries";

type DocumentDetailsPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function DocumentDetailsPage({
  params,
}: DocumentDetailsPageProps) {
  const { id } = await params;
  const document = await getDocumentById(id);

  if (!document) {
    notFound();
  }

  const [access, projects, initialOptions] = await Promise.all([
    getDocumentAccess(document),
    getProjects(),
    getDocumentRelationOptions(document.project_id),
  ]);

  return (
    <AppLayout>
      <DocumentDetailsView
        document={document}
        access={access}
        projects={projects}
        initialOptions={initialOptions}
      />
    </AppLayout>
  );
}
