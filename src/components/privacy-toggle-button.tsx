"use client";

import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePrivacy } from "@/context/privacy-context";

export function PrivacyToggleButton() {
  const { isPrivate, togglePrivacy } = usePrivacy();

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      aria-label={isPrivate ? "Show values" : "Hide values"}
      aria-pressed={isPrivate}
      onClick={togglePrivacy}
    >
      {isPrivate ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
    </Button>
  );
}
