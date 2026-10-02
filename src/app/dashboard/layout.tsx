import { PrivacyProvider } from "@/context/privacy-context";
import { AppSidebar } from "@/components/app-sidebar";
import { HelpChatWidget } from "@/components/help-chat-widget";
import { DemoModeProvider } from "@/components/demo-mode";
import { currentUserIsDemo } from "@/lib/demo-server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isDemo = await currentUserIsDemo();
  return (
    <PrivacyProvider>
      <DemoModeProvider isDemo={isDemo}>
        <div className="flex min-h-screen flex-col bg-background md:flex-row">
          <AppSidebar />
          <main className="min-w-0 flex-1">{children}</main>
          <HelpChatWidget />
        </div>
      </DemoModeProvider>
    </PrivacyProvider>
  );
}
