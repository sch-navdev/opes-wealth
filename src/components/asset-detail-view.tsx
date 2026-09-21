"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2, RefreshCw } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddAssetDialog } from "@/components/add-asset-dialog";
import { DeleteAssetButton } from "@/components/delete-asset-button";
import { updateAssetValuation } from "@/app/dashboard/actions";
import { parseRealEstateMetadata } from "@/lib/real-estate";

export type AssetDetail = {
  id: string;
  name: string;
  category_id: string;
  quantity: number;
  current_value: number;
  currency: string;
  is_liability: boolean;
  metadata: Record<string, unknown> | null;
  images: string[] | null;
  asset_categories: { name: string } | null;
};

export type AssetHistoryPoint = {
  id: string;
  recorded_date: string;
  value: number;
  net_equity: number | null;
  source: string;
};

type Category = { id: string; name: string };

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

export function AssetDetailView({
  asset,
  history,
  categories,
}: {
  asset: AssetDetail;
  history: AssetHistoryPoint[];
  categories: Category[];
}) {
  const router = useRouter();
  const [refreshOpen, setRefreshOpen] = useState(false);
  const [refreshValue, setRefreshValue] = useState("");
  const [refreshSource, setRefreshSource] = useState<
    "manual" | "dari" | "dubailand"
  >("manual");
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const categoryName = asset.asset_categories?.name ?? "—";
  const isRealEstate = categoryName === "Real Estate";
  const metadata = parseRealEstateMetadata(asset.metadata);
  const images = asset.images ?? [];

  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: asset.currency,
  });

  const marketValuation = isRealEstate
    ? metadata.market_valuation ?? asset.current_value
    : asset.current_value;
  const netEquity = asset.current_value;

  const investedCapital = isRealEstate
    ? (metadata.purchasePrice ?? 0) +
      (metadata.agencyFees ?? 0) +
      (metadata.notaryFees ?? 0) +
      (metadata.renovationFees ?? 0) +
      (metadata.furnishingFees ?? 0)
    : null;
  const unrealizedGain =
    isRealEstate && investedCapital != null
      ? marketValuation - investedCapital
      : null;
  const valuePerSqm =
    isRealEstate && metadata.surfaceArea
      ? marketValuation / metadata.surfaceArea
      : null;

  const initials = categoryName !== "—" ? categoryName[0].toUpperCase() : "?";

  const chartData = history.map((h) => ({
    date: h.recorded_date,
    value: h.value,
    netEquity: h.net_equity ?? h.value,
  }));

  function handleRefreshSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRefreshError(null);
    const value = Number(refreshValue);
    if (!Number.isFinite(value)) {
      setRefreshError("Enter a valid number.");
      return;
    }

    startTransition(async () => {
      const result = await updateAssetValuation(asset.id, value, refreshSource);
      if (result?.error) {
        setRefreshError(result.error);
        return;
      }
      setRefreshOpen(false);
      setRefreshValue("");
    });
  }

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
              <Dialog>
                <DialogTrigger asChild disabled={images.length === 0}>
                  <button
                    type="button"
                    className={
                      images.length > 0
                        ? "cursor-pointer"
                        : "cursor-default"
                    }
                    aria-label="View images"
                  >
                    <Avatar size="lg" className="rounded-md">
                      <AvatarImage src={images[0] || undefined} alt="" />
                      <AvatarFallback className="rounded-md">
                        {isRealEstate ? (
                          <Building2 className="size-5" />
                        ) : (
                          initials
                        )}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DialogTrigger>
                <DialogContent className="border-border bg-card sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="text-foreground">
                      {asset.name}
                    </DialogTitle>
                  </DialogHeader>
                  <Carousel>
                    <CarouselContent>
                      {images.map((src, index) => (
                        <CarouselItem key={index}>
                          <img
                            src={src}
                            alt={`${asset.name} ${index + 1}`}
                            className="aspect-square w-full rounded-md object-cover"
                          />
                        </CarouselItem>
                      ))}
                    </CarouselContent>
                    {images.length > 1 && (
                      <>
                        <CarouselPrevious />
                        <CarouselNext />
                      </>
                    )}
                  </Carousel>
                </DialogContent>
              </Dialog>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold text-foreground">
                    {asset.name}
                  </h1>
                  {metadata.is_offplan && isRealEstate && (
                    <Badge variant="secondary">Off-Plan</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {categoryName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-left sm:text-right">
                <p className="text-xs text-muted-foreground">
                  {isRealEstate ? "Net Equity" : "Value"}
                </p>
                <p
                  className={
                    asset.is_liability
                      ? "text-lg font-semibold text-destructive"
                      : "text-lg font-semibold text-foreground"
                  }
                >
                  {asset.is_liability ? "-" : ""}
                  {currencyFormatter.format(netEquity)}
                </p>
              </div>
              <Dialog open={refreshOpen} onOpenChange={setRefreshOpen}>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label="Refresh valuation"
                  >
                    <RefreshCw className="size-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="border-border bg-card">
                  <DialogHeader>
                    <DialogTitle className="text-foreground">
                      Refresh Valuation
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                      Record a new market valuation. This updates the asset
                      and adds a point to the history graph.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleRefreshSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="new_value">New Market Value</Label>
                      <Input
                        id="new_value"
                        type="number"
                        step="any"
                        min="0"
                        value={refreshValue}
                        onChange={(e) => setRefreshValue(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Source</Label>
                      <Select
                        value={refreshSource}
                        onValueChange={(next) =>
                          setRefreshSource(next as typeof refreshSource)
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual">Manual Entry</SelectItem>
                          <SelectItem value="dari">DARI</SelectItem>
                          <SelectItem value="dubailand">
                            Dubai Land Department
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      {refreshSource !== "manual" && (
                        <p className="text-xs text-muted-foreground">
                          No live DARI or Dubai Land Department integration
                          is configured yet — this just tags the source on a
                          manually entered value.
                        </p>
                      )}
                    </div>
                    {refreshError && (
                      <p className="text-sm text-destructive" role="alert">
                        {refreshError}
                      </p>
                    )}
                    <DialogFooter>
                      <Button type="submit" disabled={isPending}>
                        {isPending ? "Saving…" : "Save Valuation"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Aperçu</TabsTrigger>
            <TabsTrigger value="analysis">Analyse</TabsTrigger>
            <TabsTrigger value="settings">Paramètres</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground">
                  Valuation History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No valuation history yet — use &quot;Refresh
                    Valuation&quot; above to record the first data point.
                  </p>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient
                            id="valueGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="var(--color-primary)"
                              stopOpacity={0.4}
                            />
                            <stop
                              offset="95%"
                              stopColor="var(--color-primary)"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--color-border)"
                        />
                        <XAxis
                          dataKey="date"
                          stroke="var(--color-muted-foreground)"
                          fontSize={12}
                        />
                        <YAxis
                          stroke="var(--color-muted-foreground)"
                          fontSize={12}
                          tickFormatter={(v) => currencyFormatter.format(v)}
                          width={90}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--color-card)",
                            border: "1px solid var(--color-border)",
                            color: "var(--color-foreground)",
                          }}
                          formatter={(value) =>
                            currencyFormatter.format(Number(value))
                          }
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          name="Market Value"
                          stroke="var(--color-primary)"
                          fill="url(#valueGradient)"
                          strokeWidth={2}
                        />
                        <Area
                          type="monotone"
                          dataKey="netEquity"
                          name="Net Equity"
                          stroke="var(--color-success)"
                          fill="transparent"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground">Key Metrics</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <DetailField
                  label="Invested Capital"
                  value={
                    investedCapital != null
                      ? currencyFormatter.format(investedCapital)
                      : null
                  }
                />
                <div>
                  <p className="text-xs text-muted-foreground">
                    Unrealized Gain
                  </p>
                  <p
                    className={
                      unrealizedGain != null
                        ? unrealizedGain >= 0
                          ? "text-sm font-medium text-success"
                          : "text-sm font-medium text-destructive"
                        : "text-sm text-foreground"
                    }
                  >
                    {unrealizedGain != null
                      ? currencyFormatter.format(unrealizedGain)
                      : "—"}
                  </p>
                </div>
                <DetailField
                  label="Value / m²"
                  value={
                    valuePerSqm != null
                      ? currencyFormatter.format(valuePerSqm)
                      : null
                  }
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analysis" className="space-y-6">
            {!isRealEstate ? (
              <Card className="border-border bg-card">
                <CardContent className="py-6 text-sm text-muted-foreground">
                  Detailed market analysis is available for Real Estate
                  assets.
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-foreground">
                      Market Performance
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <DetailField
                      label="Price / m²"
                      value={
                        valuePerSqm != null
                          ? currencyFormatter.format(valuePerSqm)
                          : null
                      }
                    />
                    <DetailField
                      label="Estimated Value"
                      value={currencyFormatter.format(marketValuation)}
                    />
                  </CardContent>
                </Card>

                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-foreground">
                      Ownership
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Owner</TableHead>
                          <TableHead className="text-right">%</TableHead>
                          <TableHead className="text-right">
                            Gross Part
                          </TableHead>
                          <TableHead className="text-right">
                            Net Part
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {metadata.ownership.filter((o) => o.name).length ===
                        0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={4}
                              className="text-center text-muted-foreground"
                            >
                              —
                            </TableCell>
                          </TableRow>
                        ) : (
                          metadata.ownership
                            .filter((o) => o.name)
                            .map((owner, index) => (
                              <TableRow key={index}>
                                <TableCell className="text-foreground">
                                  {owner.name}
                                </TableCell>
                                <TableCell className="text-right text-muted-foreground">
                                  {owner.percentage}%
                                </TableCell>
                                <TableCell className="text-right text-foreground">
                                  {currencyFormatter.format(
                                    (owner.percentage / 100) * marketValuation,
                                  )}
                                </TableCell>
                                <TableCell className="text-right text-foreground">
                                  {currencyFormatter.format(
                                    (owner.percentage / 100) * netEquity,
                                  )}
                                </TableCell>
                              </TableRow>
                            ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

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
                    <DetailField
                      label="EPC Rating"
                      value={metadata.epcRating}
                    />
                    <DetailField
                      label="Linked Loan"
                      value={
                        metadata.linked_loan.amount
                          ? `${currencyFormatter.format(metadata.linked_loan.amount)} at ${metadata.linked_loan.interest_rate ?? 0}% / ${metadata.linked_loan.duration_months ?? 0}mo`
                          : null
                      }
                    />
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
                              ? currencyFormatter.format(
                                  metadata.contract_price,
                                )
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
                              <TableHead className="text-right">
                                Amount
                              </TableHead>
                              <TableHead className="text-right">%</TableHead>
                              <TableHead className="text-right">
                                Status
                              </TableHead>
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
                                    {currencyFormatter.format(
                                      milestone.amount,
                                    )}
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
          </TabsContent>

          <TabsContent value="settings">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-foreground">
                  Asset Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center gap-3">
                <AddAssetDialog
                  categories={categories}
                  asset={{
                    id: asset.id,
                    name: asset.name,
                    category_id: asset.category_id,
                    quantity: asset.quantity,
                    current_value: asset.current_value,
                    currency: asset.currency,
                    metadata: asset.metadata,
                    images: asset.images,
                  }}
                />
                <DeleteAssetButton
                  id={asset.id}
                  onSuccess={() => router.push("/dashboard")}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
