import { cookies } from "next/headers";
import { TierProvider } from "@/components/tier-provider";
import { UI_TIER_COOKIE, parseExpertiseLevel } from "@/stores/useUiTierStore";
import { PrivacyProvider } from "@/context/privacy-context";
import { AppSidebar } from "@/components/app-sidebar";
import { HelpChatWidget } from "@/components/help-chat-widget";
import { DemoModeProvider } from "@/components/demo-mode";
import { currentUserIsDemo } from "@/lib/demo-server";
import { CommandMenu } from "@/components/command-menu";
import { loadCommandHoldings } from "@/lib/command-menu-data";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isDemo, commandHoldings] = await Promise.all([currentUserIsDemo(), loadCommandHoldings()]);
  // UI preference mirror (not access control): lets the first render match the stored tier.
  const initialTier = parseExpertiseLevel((await cookies()).get(UI_TIER_COOKIE)?.value);
  return (
    <PrivacyProvider>
      <DemoModeProvider isDemo={isDemo}>
        <TierProvider initialTier={initialTier}>
        <div className="flex min-h-screen flex-col bg-background md:flex-row">
          <AppSidebar />
          <main className="min-w-0 flex-1">{children}</main>
          <HelpChatWidget />
          <CommandMenu holdings={commandHoldings} />
        </div>
      </TierProvider>
      </DemoModeProvider>
    </PrivacyProvider>
  );
}
