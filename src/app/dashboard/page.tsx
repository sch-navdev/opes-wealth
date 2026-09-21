import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { logout } from "@/app/auth/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddAssetDialog } from "@/components/add-asset-dialog";
import { CurrencySwitcher } from "@/components/currency-switcher";
import { DeleteAssetButton } from "@/components/delete-asset-button";
import { convertAmount, getExchangeRatesFromUsd } from "@/lib/fx";
import { cn } from "@/lib/utils";

type AssetRow = {
  id: string;
  name: string;
  category_id: string;
  quantity: number;
  current_value: number;
  currency: string;
  is_liability: boolean;
  metadata: Record<string, unknown> | null;
  asset_categories: { name: string } | null;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ currency?: string }>;
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (await needsMfaStepUp(supabase)) {
    redirect("/login/mfa");
  }

  const [{ data: categories }, { data: assets }, { data: profile }, rates] =
    await Promise.all([
      supabase.from("asset_categories").select("id, name").order("name"),
      supabase
        .from("assets")
        .select(
          "id, name, category_id, quantity, current_value, currency, is_liability, metadata, asset_categories(name)",
        )
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false })
        .returns<AssetRow[]>(),
      supabase
        .from("profiles")
        .select("first_name, avatar_base64, default_currency")
        .eq("id", user.id)
        .single(),
      getExchangeRatesFromUsd(),
    ]);

  const { currency: currencyParam } = await searchParams;
  const displayCurrency =
    currencyParam || profile?.default_currency || "USD";

  const initials =
    profile?.first_name?.[0]?.toUpperCase() ??
    user.email?.[0]?.toUpperCase() ??
    "?";

  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: displayCurrency,
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="flex flex-col gap-4 border-b border-border px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-3">
          <Avatar size="lg">
            <AvatarImage src={profile?.avatar_base64 || undefined} alt="" />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm text-muted-foreground">Welcome back</p>
            <h1 className="text-xl font-semibold text-foreground">
              {profile?.first_name || user.email}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/settings"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Profile Settings
          </Link>
          <form action={logout}>
            <Button type="submit" variant="outline">
              Sign Out
            </Button>
          </form>
        </div>
      </header>

      <main className="space-y-6 px-4 py-10 sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Portfolio
            </h2>
            <p className="text-sm text-muted-foreground">
              Every asset and liability you&apos;re tracking.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CurrencySwitcher value={displayCurrency} />
            <AddAssetDialog categories={categories ?? []} />
          </div>
        </div>

        <div className="border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">
                  Value ({displayCurrency})
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!assets || assets.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground"
                  >
                    No assets yet. Add your first one to get started.
                  </TableCell>
                </TableRow>
              ) : (
                assets.map((asset) => {
                  const convertedValue = convertAmount(
                    asset.current_value,
                    asset.currency,
                    displayCurrency,
                    rates,
                  );

                  return (
                    <TableRow key={asset.id}>
                      <TableCell className="font-medium text-foreground">
                        {asset.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {asset.asset_categories?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {asset.quantity}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right",
                          asset.is_liability
                            ? "text-destructive"
                            : "text-foreground",
                        )}
                      >
                        {asset.is_liability ? "-" : ""}
                        {currencyFormatter.format(convertedValue)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <AddAssetDialog
                            categories={categories ?? []}
                            asset={{
                              id: asset.id,
                              name: asset.name,
                              category_id: asset.category_id,
                              quantity: asset.quantity,
                              current_value: asset.current_value,
                              currency: asset.currency,
                              metadata: asset.metadata,
                            }}
                          />
                          <DeleteAssetButton id={asset.id} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}
