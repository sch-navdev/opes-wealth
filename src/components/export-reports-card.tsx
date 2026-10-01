"use client";

import { Download } from "lucide-react";
import { DccDialog, type DccProfilePrefill } from "@/components/dcc-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/context/language-context";
import type { DccPortfolio } from "@/lib/dcc";

/** Dashboard card: full portfolio spreadsheet download + the Client Knowledge Document (DCC) PDF builder. */
export function ExportReportsCard({
  baseCurrency,
  portfolio,
  profile,
}: {
  baseCurrency: string;
  portfolio: DccPortfolio;
  profile: DccProfilePrefill;
}) {
  const { t } = useLanguage();
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground">{t("reports_title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("reports_desc")}</p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Button asChild variant="outline">
            {/* A plain link: the route streams the file with a Content-Disposition attachment header. */}
            <a href={`/dashboard/export?currency=${encodeURIComponent(baseCurrency)}`} download>
              <Download className="size-4" />
              {t("export_xlsx")}
            </a>
          </Button>
          <p className="text-xs text-muted-foreground">{t("export_xlsx_desc")}</p>
        </div>
        <div className="space-y-2">
          <DccDialog portfolio={portfolio} profile={profile} />
          <p className="text-xs text-muted-foreground">{t("dcc_open_desc")}</p>
        </div>
      </CardContent>
    </Card>
  );
}
