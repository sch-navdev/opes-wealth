"use client";

import { useState } from "react";
import { FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/context/language-context";
import {
  DCC_OBJECTIVES,
  DCC_PERSON_TEXT_FIELDS,
  DCC_PERSON_YESNO_FIELDS,
  DCC_TAX_INCOME_FIELDS,
  DCC_TAX_WEALTH_FIELDS,
  emptyDccData,
  mergeSavedDcc,
  type DccAmountRow,
  type DccData,
  type DccPerson,
  type DccPortfolio,
  type DccRelation,
  type YesNo,
} from "@/lib/dcc";
import { LOCALE_INFO, PDF_LOCALES, type Locale } from "@/lib/locales";

const NONE = "__none__";

import { clearClientKnowledge, saveClientKnowledge } from "@/app/dashboard/dcc-actions";

/** Local time as YYYYMMDD_HHMMSS (e.g. 20261002_153045): makes every generated file name unique. */
export function fileTimestamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export type DccProfilePrefill = {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  postalCity: string;
  country: string;
  email: string;
};

function TextInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  type?: string;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="h-8" />
    </div>
  );
}

function PersonForm({
  person,
  onChange,
}: {
  person: DccPerson;
  onChange: (next: DccPerson) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {DCC_PERSON_TEXT_FIELDS.map((f) => (
          <TextInput
            key={f.key}
            label={t(f.label)}
            type={f.key === "birthDate" || f.key === "idExpiry" || f.key === "marriageDate" ? "date" : "text"}
            value={String(person[f.key] ?? "")}
            onChange={(v) => onChange({ ...person, [f.key]: v })}
          />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {DCC_PERSON_YESNO_FIELDS.map((f) => (
          <div key={f.key} className="min-w-0 space-y-1">
            <Label className="text-xs text-muted-foreground">{t(f.label)}</Label>
            <Select
              value={String(person[f.key] || NONE)}
              onValueChange={(v) => onChange({ ...person, [f.key]: (v === NONE ? "" : v) as YesNo })}
            >
              <SelectTrigger className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                <SelectItem value="yes">{t("yes")}</SelectItem>
                <SelectItem value="no">{t("no")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}

function AmountRows({
  rows,
  onChange,
  addLabel,
}: {
  rows: DccAmountRow[];
  onChange: (next: DccAmountRow[]) => void;
  addLabel: string;
}) {
  const { t } = useLanguage();
  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[2fr_2fr_1fr_auto] items-center gap-2">
          <Input
            className="h-8"
            aria-label={t("dcc_col_label")}
            placeholder={t("dcc_col_label")}
            value={row.label}
            onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
          />
          <Input
            className="h-8"
            aria-label={t("dcc_col_nature")}
            placeholder={t("dcc_col_nature")}
            value={row.nature}
            onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, nature: e.target.value } : r)))}
          />
          <Input
            className="h-8"
            type="number"
            aria-label={t("dcc_col_annual_amount")}
            value={row.amount}
            onChange={(e) =>
              onChange(rows.map((r, j) => (j === i ? { ...r, amount: Number(e.target.value) } : r)))
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("delete")}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...rows, { label: "", nature: "", amount: 0, holder: "" }])}
      >
        {addLabel}
      </Button>
    </div>
  );
}

/**
 * Builds the Client Knowledge Document (DCC) PDF: pre-filled with the wealth,
 * loans and income Opes Wealth tracks; everything else is typed here. The PDF
 * is generated in the browser (`lib/dcc-pdf.ts`) and nothing entered is stored
 * or sent anywhere. Optional viewing password; French or English.
 */
export function DccDialog({
  portfolio,
  profile,
  saved,
}: {
  portfolio: DccPortfolio;
  profile: DccProfilePrefill;
  /** The user's last saved entries (migration 0026), laid over the defaults. */
  saved?: unknown;
}) {
  const { t, locale } = useLanguage();
  const [open, setOpen] = useState(false);
  const [docLocale, setDocLocale] = useState<Locale>(PDF_LOCALES.includes(locale) ? locale : "en");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [data, setData] = useState<DccData>(() => {
    const base = emptyDccData(portfolio);
    // Profile prefill first, then the saved entries on top (saved values win).
    return mergeSavedDcc(
      {
        ...base,
        you: {
          ...base.you,
          fullName: [profile.lastName.toUpperCase(), profile.firstName].filter(Boolean).join(" "),
          mobile: profile.phone,
          address: profile.address,
          postalCity: profile.postalCity,
          country: profile.country,
          email: profile.email,
        },
      },
      saved,
    );
  });
  const [notice, setNotice] = useState<string | null>(null);

  function set<K extends keyof DccData>(key: K, next: DccData[K]) {
    setData((prev) => ({ ...prev, [key]: next }));
  }

  async function handleGenerate() {
    setError(null);
    if (password && password.length < 6) {
      setError(t("dcc_password_short"));
      return;
    }
    setIsGenerating(true);
    try {
      const { generateDccPdf } = await import("@/lib/dcc-pdf");
      const blob = await generateDccPdf({ ...data, portfolio }, docLocale, password);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `DCC-${fileTimestamp()}-${docLocale}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      // Remember these entries for next time (never the wealth tables or the PDF password).
      const { portfolio: _p, ...toSave } = { ...data, portfolio };
      void _p;
      await saveClientKnowledge(toSave);
      setOpen(false);
    } catch {
      setError(t("dcc_generate_error"));
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleClearSaved() {
    setError(null);
    const result = await clearClientKnowledge();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice(t("dcc_cleared"));
  }

  const setRelation = (i: number, patch: Partial<DccRelation>) =>
    set(
      "relations",
      data.relations.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <FileText className="size-4" />
          {t("dcc_open")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] w-[95vw] overflow-y-auto border-border bg-background sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">{t("dcc_dialog_title")}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t("dcc_dialog_desc")}
          </DialogDescription>
        </DialogHeader>
        <p className="border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
          {t("dcc_privacy_note")}
        </p>

        <div className="space-y-6">
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1">
              <Label className="text-xs text-muted-foreground">{t("dcc_language")}</Label>
              <Select value={docLocale} onValueChange={(v) => setDocLocale(v as Locale)}>
                <SelectTrigger className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCALE_INFO.filter((l) => PDF_LOCALES.includes(l.code)).map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!PDF_LOCALES.includes(locale) ? (
                <p className="text-xs text-muted-foreground">{t("dcc_pdf_latin_only")}</p>
              ) : null}
            </div>
            <div className="min-w-0 space-y-1">
              <Label className="text-xs text-muted-foreground">{t("dcc_password_label")}</Label>
              <Input
                type="password"
                autoComplete="new-password"
                className="h-8"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">{t("dcc_password_hint")}</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">{t("dcc_step_advisor")}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextInput label={t("dcc_advisor_name")} value={data.advisorName} onChange={(v) => set("advisorName", v)} />
              <TextInput label={t("dcc_advisor_firm")} value={data.advisorFirm} onChange={(v) => set("advisorFirm", v)} />
              <TextInput label={t("dcc_advisor_phone")} value={data.advisorPhone} onChange={(v) => set("advisorPhone", v)} />
              <TextInput label={t("dcc_advisor_email")} value={data.advisorEmail} onChange={(v) => set("advisorEmail", v)} />
              <TextInput label={t("dcc_client_title")} value={data.clientTitle} onChange={(v) => set("clientTitle", v)} />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">{t("dcc_you")}</h3>
            <PersonForm person={data.you} onChange={(next) => set("you", next)} />
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Switch
                id="dcc_spouse"
                checked={data.includeSpouse}
                onCheckedChange={(checked) => set("includeSpouse", checked)}
              />
              <Label htmlFor="dcc_spouse" className="text-sm text-foreground">
                {t("dcc_include_spouse")}
              </Label>
            </div>
            {data.includeSpouse && (
              <PersonForm person={data.spouse} onChange={(next) => set("spouse", next)} />
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">{t("dcc_section_relations")}</h3>
            {data.relations.map((r, i) => (
              <div key={i} className="grid grid-cols-2 items-center gap-2 sm:grid-cols-[2fr_1.2fr_1.2fr_1.2fr_1.5fr_auto]">
                <Input className="h-8" placeholder={t("dcc_col_name")} aria-label={t("dcc_col_name")} value={r.name} onChange={(e) => setRelation(i, { name: e.target.value })} />
                <Input className="h-8" placeholder={t("dcc_col_relation")} aria-label={t("dcc_col_relation")} value={r.relation} onChange={(e) => setRelation(i, { relation: e.target.value })} />
                <Input className="h-8" type="date" aria-label={t("dcc_col_birth")} value={r.birthDate} onChange={(e) => setRelation(i, { birthDate: e.target.value })} />
                <Input className="h-8" placeholder={t("dcc_col_phone")} aria-label={t("dcc_col_phone")} value={r.phone} onChange={(e) => setRelation(i, { phone: e.target.value })} />
                <Input className="h-8" placeholder={t("dcc_col_email")} aria-label={t("dcc_col_email")} value={r.email} onChange={(e) => setRelation(i, { email: e.target.value })} />
                <Button type="button" variant="ghost" size="icon-sm" aria-label={t("delete")} onClick={() => set("relations", data.relations.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                set("relations", [...data.relations, { name: "", relation: "", birthDate: "", phone: "", email: "" }])
              }
            >
              {t("dcc_add_relation")}
            </Button>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">{t("dcc_section_income")}</h3>
            <p className="text-xs text-muted-foreground">{t("dcc_derived_note")}</p>
            <AmountRows rows={data.extraIncome} onChange={(next) => set("extraIncome", next)} addLabel={t("dcc_add_income")} />
            <h3 className="text-sm font-medium text-foreground">{t("dcc_section_charges")}</h3>
            <AmountRows rows={data.extraCharges} onChange={(next) => set("extraCharges", next)} addLabel={t("dcc_add_charge")} />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">{t("dcc_section_tax")}</h3>
            <TextInput label={t("dcc_tax_year")} value={data.taxYear} onChange={(v) => set("taxYear", v)} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {DCC_TAX_INCOME_FIELDS.map((k) => (
                <TextInput
                  key={k}
                  label={t(k)}
                  value={data.taxIncome[k] ?? ""}
                  onChange={(v) => set("taxIncome", { ...data.taxIncome, [k]: v })}
                />
              ))}
              {DCC_TAX_WEALTH_FIELDS.map((k) => (
                <TextInput
                  key={k}
                  label={t(k)}
                  value={data.taxWealth[k] ?? ""}
                  onChange={(v) => set("taxWealth", { ...data.taxWealth, [k]: v })}
                />
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">{t("dcc_section_objectives")}</h3>
            <p className="text-xs text-muted-foreground">{t("dcc_priority_hint")}</p>
            <div className="space-y-2">
              {DCC_OBJECTIVES.map((o) => {
                const value = data.objectives[o.key] ?? { priority: "", horizon: "" };
                return (
                  <div key={o.key} className="grid grid-cols-[1fr_5rem_5rem] items-center gap-2">
                    <span className="text-sm text-foreground">{t(o.label)}</span>
                    <Input
                      className="h-8"
                      type="number"
                      min="1"
                      aria-label={t("dcc_col_priority")}
                      placeholder={t("dcc_col_priority")}
                      value={value.priority}
                      onChange={(e) =>
                        set("objectives", { ...data.objectives, [o.key]: { ...value, priority: e.target.value } })
                      }
                    />
                    <Input
                      className="h-8"
                      type="number"
                      min="0"
                      aria-label={t("dcc_col_horizon")}
                      placeholder={t("dcc_years")}
                      value={value.horizon}
                      onChange={(e) =>
                        set("objectives", { ...data.objectives, [o.key]: { ...value, horizon: e.target.value } })
                      }
                    />
                  </div>
                );
              })}
            </div>
            <TextInput
              label={t("dcc_precaution_amount")}
              type="number"
              value={data.precautionAmount}
              onChange={(v) => set("precautionAmount", v)}
            />
          </section>
        </div>

        {notice && (
          <p className="text-sm text-muted-foreground" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Button type="button" variant="ghost" onClick={handleClearSaved} disabled={isGenerating}>
            {t("dcc_clear_saved")}
          </Button>
          <Button type="button" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? t("dcc_generating") : t("dcc_generate")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
