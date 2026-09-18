import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { needsMfaStepUp } from "@/utils/supabase/mfa";
import { logout } from "@/app/auth/actions";
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

type AssetRow = {
  id: string;
  name: string;
  quantity: number;
  current_value: number;
  currency: string;
  is_liability: boolean;
  asset_categories: { name: string } | null;
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (await needsMfaStepUp(supabase)) {
    redirect("/login/mfa");
  }

  const [{ data: categories }, { data: assets }] = await Promise.all([
    supabase.from("asset_categories").select("id, name").order("name"),
    supabase
      .from("assets")
      .select(
        "id, name, quantity, current_value, currency, is_liability, asset_categories(name)",
      )
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .returns<AssetRow[]>(),
  ]);

  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-8 py-6">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back</p>
          <h1 className="text-xl font-semibold text-foreground">
            {user.email}
          </h1>
        </div>
        <form action={logout}>
          <Button type="submit" variant="outline">
            Sign Out
          </Button>
        </form>
      </header>

      <main className="space-y-6 px-8 py-10">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Portfolio
            </h2>
            <p className="text-sm text-muted-foreground">
              Every asset and liability you&apos;re tracking.
            </p>
          </div>
          <AddAssetDialog categories={categories ?? []} />
        </div>

        <div className="border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!assets || assets.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-muted-foreground"
                  >
                    No assets yet. Add your first one to get started.
                  </TableCell>
                </TableRow>
              ) : (
                assets.map((asset) => (
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
                      className={
                        "text-right " +
                        (asset.is_liability
                          ? "text-destructive"
                          : "text-foreground")
                      }
                    >
                      {asset.is_liability ? "-" : ""}
                      {currencyFormatter.format(asset.current_value)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Link
          href="/dashboard/mfa"
          className="inline-block text-sm text-primary underline-offset-4 hover:underline"
        >
          Manage two-factor authentication
        </Link>
      </main>
    </div>
  );
}
