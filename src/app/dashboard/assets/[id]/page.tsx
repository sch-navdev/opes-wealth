import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { parseRealEstateMetadata } from "@/lib/real-estate";

type AssetDetail = {
  id: string;
  name: string;
  quantity: number;
  current_value: number;
  currency: string;
  is_liability: boolean;
  metadata: Record<string, unknown> | null;
  image_base64: string | null;
  asset_categories: { name: string } | null;
};

export default async function AssetDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (await needsMfaStepUp(supabase)) {
    redirect("/login/mfa");
  }

  const { data: asset } = await supabase
    .from("assets")
    .select(
      "id, name, quantity, current_value, currency, is_liability, metadata, image_base64, asset_categories(name)",
    )
    .eq("id", id)
    .eq("profile_id", user.id)
    .single<AssetDetail>();

  if (!asset) {
    notFound();
  }

  const categoryName = asset.asset_categories?.name ?? "—";
  const isRealEstate = categoryName === "Real Estate";
  const metadata = parseRealEstateMetadata(asset.metadata);

  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: asset.currency,
  });

  const marketValuation = metadata.is_offplan
    ? metadata.market_valuation
    : asset.current_value;

  const initials =
    categoryName !== "—" ? categoryName[0].toUpperCase() : "?";

  return (
    <div className="min-h-screen bg-background px-4 py-10 sm:px-8">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Portfolio
      </Link>

      <div className="mx-auto max-w-3xl space-y-6">
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar size="lg" className="rounded-md">
                <AvatarImage src={asset.image_base64 || undefined} alt="" />
                <AvatarFallback className="rounded-md">
                  {isRealEstate ? (
                    <Building2 className="size-5" />
                  ) : (
                    initials
                  )}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold text-foreground">
                    {asset.name}
                  </h1>
                  {metadata.is_offplan && (
                    <Badge variant="secondary">Off-Plan</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {categoryName}
                </p>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-xs text-muted-foreground">
                {metadata.is_offplan ? "Net Equity" : "Value"}
              </p>
              <p
                className={
                  asset.is_liability
                    ? "text-lg font-semibold text-destructive"
                    : "text-lg font-semibold text-foreground"
                }
              >
                {asset.is_liability ? "-" : ""}
                {currencyFormatter.format(asset.current_value)}
              </p>
            </div>
          </CardContent>
        </Card>

        {isRealEstate && (
          <>
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground">
                  Characteristics
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <DetailField label="Address" value={metadata.address} />
                <DetailField label="Type" value={metadata.propertyType} />
                <DetailField
                  label="Surface Area"
                  value={
                    metadata.surfaceArea != null
                      ? `${metadata.surfaceArea} m²`
                      : null
                  }
                />
                <DetailField
                  label="Year of Construction"
                  value={metadata.yearOfConstruction}
                />
                <DetailField label="EPC Rating" value={metadata.epcRating} />
                <DetailField
                  label="Condition"
                  value={[
                    metadata.condition.kitchen && `Kitchen: ${metadata.condition.kitchen}`,
                    metadata.condition.bathrooms && `Bathrooms: ${metadata.condition.bathrooms}`,
                    metadata.condition.flooring && `Flooring: ${metadata.condition.flooring}`,
                    metadata.condition.windows && `Windows: ${metadata.condition.windows}`,
                    metadata.condition.general && `General: ${metadata.condition.general}`,
                  ]
                    .filter(Boolean)
                    .join(" · ") || null}
                />
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground">Financials</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <DetailField
                  label="Total Market Valuation"
                  value={
                    marketValuation != null
                      ? currencyFormatter.format(marketValuation)
                      : null
                  }
                />
                <div>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Ownership
                  </p>
                  <ul className="space-y-1">
                    {metadata.ownership
                      .filter((owner) => owner.name)
                      .map((owner, index) => (
                        <li
                          key={index}
                          className="flex items-center justify-between text-sm text-foreground"
                        >
                          <span>{owner.name}</span>
                          <span className="text-muted-foreground">
                            {owner.percentage}%
                          </span>
                        </li>
                      ))}
                    {metadata.ownership.every((owner) => !owner.name) && (
                      <li className="text-sm text-muted-foreground">—</li>
                    )}
                  </ul>
                </div>
              </CardContent>
            </Card>

            {metadata.is_offplan && (
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-foreground">
                    Off-Plan Payment Tracking
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <DetailField
                      label="Contract Price"
                      value={
                        metadata.contract_price != null
                          ? currencyFormatter.format(metadata.contract_price)
                          : null
                      }
                    />
                    <DetailField
                      label="ADM Fee"
                      value={
                        metadata.adm_fee_amount != null
                          ? `${currencyFormatter.format(metadata.adm_fee_amount)} (${metadata.adm_fee_percent ?? 0}%)`
                          : null
                      }
                    />
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Total Paid to Date
                      </p>
                      <p className="text-sm font-medium text-success">
                        {currencyFormatter.format(metadata.paid_to_date)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Outstanding Balance
                      </p>
                      <p className="text-sm font-medium text-destructive">
                        {currencyFormatter.format(
                          metadata.outstanding_balance,
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Milestone</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">%</TableHead>
                          <TableHead className="text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {metadata.payment_schedule.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className="text-center text-muted-foreground"
                            >
                              No payment milestones recorded.
                            </TableCell>
                          </TableRow>
                        ) : (
                          metadata.payment_schedule.map((milestone) => (
                            <TableRow key={milestone.id}>
                              <TableCell className="text-foreground">
                                {milestone.milestone || "—"}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {milestone.due_date || "—"}
                              </TableCell>
                              <TableCell className="text-right text-foreground">
                                {currencyFormatter.format(milestone.amount)}
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {milestone.percentage}%
                              </TableCell>
                              <TableCell className="text-right">
                                <Badge
                                  variant={
                                    milestone.status === "paid"
                                      ? "default"
                                      : "secondary"
                                  }
                                  className={
                                    milestone.status === "paid"
                                      ? "bg-success text-success-foreground"
                                      : undefined
                                  }
                                >
                                  {milestone.status === "paid"
                                    ? "Paid"
                                    : "Pending"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}
