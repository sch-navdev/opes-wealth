"use client";

import { moneyFormatter } from "@/lib/money-parts";
import Link from "next/link";
import { Building2, Factory, Landmark } from "lucide-react";
import { ENTITY_TYPE_LABEL_KEYS } from "@/components/company-fields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/context/language-context";
import { usePrivacy } from "@/context/privacy-context";
import type { CompanyNode, HoldingStructure } from "@/lib/companies";
import { cn } from "@/lib/utils";

function NodeRow({
  node,
  baseValues,
  baseCurrency,
  depth,
}: {
  node: CompanyNode;
  /** Your stake per company id, already in the Base Currency. */
  baseValues: Record<string, number>;
  baseCurrency: string;
  depth: number;
}) {
  const { t, intlLocale } = useLanguage();
  const { maskValue } = usePrivacy();
  const formatter = moneyFormatter(intlLocale, baseCurrency);
  const md = node.metadata;
  const meta = [
    t(ENTITY_TYPE_LABEL_KEYS[md.entity_type]),
    md.jurisdiction,
    md.ownership_percentage != null ? t("company_owns_pct", { pct: md.ownership_percentage }) : "",
  ].filter(Boolean);

  return (
    <>
      <li
        className={cn("flex items-center justify-between gap-3 p-3", depth > 0 && "bg-muted/30")}
        style={{ paddingLeft: `${0.75 + depth * 1.5}rem` }}
      >
        <div className="min-w-0">
          <Link
            href={`/dashboard/assets/${node.id}`}
            className="truncate text-sm font-medium text-foreground hover:underline"
          >
            {node.name}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{meta.join(" · ")}</p>
        </div>
        <p className="shrink-0 text-sm font-medium tabular-nums text-foreground">
          {maskValue(formatter.format(baseValues[node.id] ?? 0))}
        </p>
      </li>
      {node.children.map((child) => (
        <NodeRow
          key={child.id}
          node={child}
          baseValues={baseValues}
          baseCurrency={baseCurrency}
          depth={depth + 1}
        />
      ))}
    </>
  );
}

function Group({
  title,
  icon,
  nodes,
  baseValues,
  baseCurrency,
}: {
  title: string;
  icon: React.ReactNode;
  nodes: CompanyNode[];
  baseValues: Record<string, number>;
  baseCurrency: string;
}) {
  if (nodes.length === 0) return null;
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm text-foreground">
          <span className="text-primary">{icon}</span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border border-t border-border">
          {nodes.map((node) => (
            <NodeRow
              key={node.id}
              node={node}
              baseValues={baseValues}
              baseCurrency={baseCurrency}
              depth={0}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * Ownership structure of the tracked Companies: entities held directly,
 * holding companies with the subsidiaries held through them (indented), and
 * entities held through a holding vehicle that isn't tracked as its own entry.
 */
export function CompaniesStructure({
  structure,
  baseValues,
  baseCurrency,
}: {
  structure: HoldingStructure;
  baseValues: Record<string, number>;
  baseCurrency: string;
}) {
  const { t } = useLanguage();
  const empty =
    structure.personal.length === 0 &&
    structure.roots.length === 0 &&
    structure.untrackedHoldings.length === 0;

  if (empty) {
    return <p className="text-sm text-muted-foreground">{t("companies_empty")}</p>;
  }

  return (
    <div className="space-y-4">
      <Group
        title={t("companies_group_holdings")}
        icon={<Landmark className="size-4" />}
        nodes={structure.roots}
        baseValues={baseValues}
        baseCurrency={baseCurrency}
      />
      <Group
        title={t("companies_group_personal")}
        icon={<Factory className="size-4" />}
        nodes={structure.personal}
        baseValues={baseValues}
        baseCurrency={baseCurrency}
      />
      {structure.untrackedHoldings.map((group) => (
        <Group
          key={group.name}
          title={t("companies_group_via", { name: group.name })}
          icon={<Building2 className="size-4" />}
          nodes={group.companies}
          baseValues={baseValues}
          baseCurrency={baseCurrency}
        />
      ))}
    </div>
  );
}
