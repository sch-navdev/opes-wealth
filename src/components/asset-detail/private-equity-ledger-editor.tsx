"use client";

import { moneyFormatter } from "@/lib/money-parts";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { updateAsset } from "@/app/dashboard/actions";
import { OwnerShareNote } from "@/components/owner-share-note";
import { usePeLiquidityText, isPelKey } from "@/components/pe-liquidity-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import type { TranslationKey } from "@/lib/i18n";
import {
  addDistribution,
  addPaidCall,
  ledgerRows,
  removeDistribution,
  removePaidCall,
  updateDistribution,
  updatePaidCall,
  type LedgerResult,
  type LedgerRow,
} from "@/lib/pe-ledger-edit";
import {
  DISTRIBUTION_KINDS,
  parsePrivateEquityMetadata,
  type ActualDistribution,
  type PrivateEquityMetadata,
} from "@/lib/private-equity";
import { cn } from "@/lib/utils";

/** The raw (whole-fund, unscaled) asset row: the editor saves through `updateAsset`, like the edit dialog. */
export type LedgerEditorAsset = {
  id: string;
  name: string;
  category_id: string;
  quantity: number;
  current_value: number;
  currency: string;
  metadata: Record<string, unknown> | null;
  images: string[] | null;
  ticker_symbol: string | null;
  purchase_date: string;
};

type Draft = { id: string | null; type: LedgerRow["type"]; date: string; amount: string; kind: ActualDistribution["kind"] };

const field =
  "h-8 rounded-sm border border-input bg-transparent px-2 font-mono text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Cash-flow ledger of one private-equity fund: add, edit and remove the PAID capital calls and the dated ACTUAL
 * distributions. Rows are saved inside `assets.metadata` through the same `updateAsset` action as the edit
 * dialog, so a co-owned fund goes through the same approval request (the change is staged until a co-owner agrees).
 * Pattern: dense inline-editable table with row actions (21st.dev "Table Edit" / "Editable Data Table"),
 * restyled as a Chronograph terminal table.
 */
export function PrivateEquityLedgerEditor({
  asset,
  shareFactor = 1,
}: {
  asset: LedgerEditorAsset;
  /** The viewer's ownership share (0-1); below 1 the amounts below are for the whole fund. */
  shareFactor?: number;
}) {
  const pt = usePeLiquidityText();
  const { t, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const md: PrivateEquityMetadata = useMemo(() => parsePrivateEquityMetadata(asset.metadata), [asset.metadata]);
  const rows = useMemo(() => ledgerRows(md), [md]);
  const money = useMemo(
    () => moneyFormatter(intlLocale, asset.currency, { maximumFractionDigits: 2 }),
    [intlLocale, asset.currency],
  );

  const message = (code: string) => (isPelKey(code) ? pt(code) : t(code as TranslationKey));
  const typeLabel = (type: LedgerRow["type"]) => (type === "call" ? pt("pel_type_call") : pt("pel_type_distribution"));
  const kindLabel = (k: ActualDistribution["kind"]) =>
    pt(k === "income" ? "pel_kind_income" : k === "gain" ? "pel_kind_gain" : "pel_kind_return_of_capital");
  const legacyLump = md.distributions.length === 0 && (md.distributions_to_date ?? 0) > 0 ? (md.distributions_to_date as number) : null;

  /** Saves through the shared edit action; nothing is written locally, the page refreshes from the server. */
  function persist(result: LedgerResult) {
    if (!result.ok) {
      setError(message(result.code));
      return;
    }
    setError(null);
    setNotice(null);
    const formData = new FormData();
    formData.set("name", asset.name);
    formData.set("category_id", asset.category_id);
    formData.set("quantity", String(asset.quantity));
    formData.set("current_value", String(asset.current_value));
    formData.set("currency", asset.currency);
    formData.set("images", JSON.stringify(asset.images ?? []));
    if (asset.ticker_symbol) formData.set("ticker_symbol", asset.ticker_symbol);
    formData.set("purchase_date", asset.purchase_date);
    formData.set("metadata", JSON.stringify(result.metadata));
    startTransition(async () => {
      const res = await updateAsset(asset.id, formData);
      if (res && "error" in res && res.error) {
        setError(/^(owners_|change_)/.test(res.error) ? t(res.error as TranslationKey) : res.error);
        return;
      }
      setDraft(null);
      if (res && "pending" in res && res.pending) {
        // A registered co-owner must approve first: nothing changed yet.
        setNotice(`${t("change_pending_notice")} ${t("change_pending_see_status")}`);
        return;
      }
      setNotice(pt("pel_saved"));
      router.refresh();
    });
  }

  function commit() {
    if (!draft) return;
    const amount = Number(draft.amount);
    if (draft.type === "call") {
      persist(draft.id ? updatePaidCall(md, draft.id, { date: draft.date, amount }) : addPaidCall(md, { date: draft.date, amount }));
    } else {
      const input = { date: draft.date, amount, kind: draft.kind };
      persist(draft.id ? updateDistribution(md, draft.id, input) : addDistribution(md, input));
    }
  }

  const startAdd = (type: LedgerRow["type"]) => {
    setError(null);
    setNotice(null);
    setDraft({ id: null, type, date: "", amount: "", kind: "income" });
  };
  const startEdit = (row: LedgerRow) => {
    setError(null);
    setNotice(null);
    setDraft({ id: row.id, type: row.type, date: row.date, amount: String(row.amount), kind: row.type === "distribution" ? row.kind : "income" });
  };
  const remove = (row: LedgerRow) =>
    persist(row.type === "call" ? removePaidCall(md, row.id) : removeDistribution(md, row.id));

  const editingRow = (key: string) => {
    if (!draft) return null;
    const dateLabel = draft.type === "call" ? pt("pel_date_label_call") : pt("pel_date_label_distribution");
    return (
      <tr key={key} data-testid="pel-draft-row" className="bg-primary/5">
        <td className="whitespace-nowrap text-muted-foreground">{typeLabel(draft.type)}</td>
        <td>
          <Input
            type="date"
            aria-label={dateLabel}
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            className={cn(field, "w-36")}
          />
        </td>
        <td>
          {draft.type === "distribution" ? (
            <select
              aria-label={pt("pel_kind_label")}
              value={draft.kind}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value as ActualDistribution["kind"] })}
              className={cn(field, "w-40")}
            >
              {DISTRIBUTION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {kindLabel(k)}
                </option>
              ))}
            </select>
          ) : null}
        </td>
        <td className="text-end">
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            aria-label={pt("pel_amount_label", { currency: asset.currency })}
            value={draft.amount}
            onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
            className={cn(field, "w-32 text-end")}
          />
        </td>
        <td className="whitespace-nowrap text-end">
          <Button type="button" size="icon-sm" variant="ghost" disabled={pending} onClick={commit} aria-label={pt("pel_save_row")} title={pt("pel_save_row")}>
            <Check className="size-4" />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" disabled={pending} onClick={() => { setDraft(null); setError(null); }} aria-label={pt("pel_cancel_row")} title={pt("pel_cancel_row")}>
            <X className="size-4" />
          </Button>
        </td>
      </tr>
    );
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground">{pt("pel_ledger_heading")}</CardTitle>
        <p className="text-sm text-muted-foreground">{pt("pel_ledger_hint")}</p>
        <OwnerShareNote factor={shareFactor} variant="edit" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto rounded-md border border-border">
          <table
            className={cn(
              "w-full caption-bottom text-xs tabular-nums",
              "[&_td]:px-2 [&_td]:py-1 [&_th]:h-8 [&_th]:px-2 [&_th]:text-start",
              "[&_thead_th]:border-b [&_thead_th]:border-primary/40",
              "[&_tbody_tr:nth-child(even)]:bg-muted/25 [&_tbody_tr:hover]:bg-primary/10",
            )}
          >
            <thead>
              <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col">{pt("pel_col_type")}</th>
                <th scope="col">{pt("pel_col_date")}</th>
                <th scope="col">{pt("pel_col_kind")}</th>
                <th scope="col" className="!text-end">{pt("pel_col_amount")}</th>
                <th scope="col"><span className="sr-only">{pt("pel_edit_row")}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) =>
                draft?.id === row.id ? (
                  editingRow(row.id)
                ) : (
                  <tr key={row.id} data-testid="pel-row">
                    <td className="whitespace-nowrap">{typeLabel(row.type)}</td>
                    <td className="whitespace-nowrap font-mono">{row.date}</td>
                    <td className="whitespace-nowrap text-muted-foreground">{row.type === "distribution" ? kindLabel(row.kind) : "–"}</td>
                    <td className={cn("whitespace-nowrap text-end font-mono", row.type === "distribution" ? "text-success" : "text-foreground")}>
                      {maskValue(money.format(row.amount))}
                    </td>
                    <td className="whitespace-nowrap text-end">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={pending || draft != null}
                        onClick={() => startEdit(row)}
                        aria-label={pt("pel_row_edit_aria", { type: typeLabel(row.type), date: row.date })}
                        title={pt("pel_edit_row")}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={pending || draft != null}
                        onClick={() => remove(row)}
                        aria-label={pt("pel_row_remove_aria", { type: typeLabel(row.type), date: row.date })}
                        title={pt("pel_remove_row")}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ),
              )}
              {draft && draft.id == null ? editingRow("new") : null}
              {rows.length === 0 && !draft ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-sm text-muted-foreground">{pt("pel_empty_ledger")}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={pending || draft != null} onClick={() => startAdd("call")}>
            <Plus className="size-4" />
            {pt("pel_add_call")}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={pending || draft != null} onClick={() => startAdd("distribution")}>
            <Plus className="size-4" />
            {pt("pel_add_distribution")}
          </Button>
        </div>

        {legacyLump != null && (
          <p className="text-xs text-muted-foreground">{pt("pel_legacy_note", { amount: maskValue(money.format(legacyLump)) })}</p>
        )}
        {md.capital_calls.some((c) => c.status === "pending") && <p className="text-xs text-muted-foreground">{pt("pel_pending_note")}</p>}
        {pending && <p className="text-xs text-muted-foreground" role="status">{pt("pel_saving")}</p>}
        {notice && <p className="text-sm text-muted-foreground" role="status">{notice}</p>}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
