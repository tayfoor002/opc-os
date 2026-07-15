import { AppLayout } from "@/components/layout/AppLayout";
import { Dashboard } from "@/components/dashboard/Dashboard";

export default function HomePage() {
  return (
    <AppLayout>
      <Dashboard />
    </AppLayout>
  );
}
