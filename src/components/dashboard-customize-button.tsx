"use client";

import { LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOptionalDashboardLayout } from "@/components/dashboard-layout-provider";
import { useDashboardLayoutText } from "@/components/dashboard-layout-text";

/**
 * Header button that puts the dashboard into edit mode. Renders nothing outside a
 * `DashboardLayoutProvider`; while editing it stays visible but disabled (the edit banner
 * above the blocks holds Done / Cancel / Reset).
 */
export function DashboardCustomizeButton() {
  const layout = useOptionalDashboardLayout();
  const text = useDashboardLayoutText();
  if (!layout) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={layout.editing}
      aria-label={text("dlayout_customize_aria")}
      disabled={layout.editing}
      onClick={layout.startEditing}
      data-testid="customize-dashboard"
    >
      <LayoutDashboard aria-hidden="true" />
      {text("dlayout_customize")}
    </Button>
  );
}
