import { PrivacyProvider } from "@/context/privacy-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PrivacyProvider>{children}</PrivacyProvider>;
}
