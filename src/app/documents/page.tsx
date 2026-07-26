import { AppLayout } from "@/components/layout/AppLayout";
import { DocumentsView } from "@/components/documents/DocumentsView";
import { getDocuments } from "@/lib/documents/queries";
import { getProjects } from "@/lib/projects/queries";

export default async function DocumentsPage() {
  const [documents, projects] = await Promise.all([
    getDocuments(),
    getProjects(),
  ]);

  return (
    <AppLayout>
      <DocumentsView
        documents={documents}
        projects={projects}
      />
    </AppLayout>
  );
}