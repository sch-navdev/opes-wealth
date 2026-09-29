import { PrivacyProvider } from "@/context/privacy-context";
import { AppSidebar } from "@/components/app-sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PrivacyProvider>
      <div className="flex min-h-screen flex-col bg-background md:flex-row">
        <AppSidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </PrivacyProvider>
  );
}
