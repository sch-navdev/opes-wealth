"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, Check, ChevronsUpDown, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useScpiText } from "@/components/scpi-text";
import { moneyFormatter } from "@/lib/money-parts";
import { useLanguage } from "@/context/language-context";
import {
  applyReferencePrices,
  getCatalogEntry,
  referenceOffer,
  searchScpiCatalog,
  type ScpiCatalogEntry,
} from "@/lib/scpi-catalog";
import type { ScpiMetadata } from "@/lib/scpi";
import { cn } from "@/lib/utils";

/**
 * The "Name of SCPI" field of the add/edit dialog: a searchable list over the verified catalog
 * (`lib/scpi-catalog.ts`) plus "Not listed, add manually", which switches to free text and marks the
 * asset's name as unverified (`metadata.name_source`). Submits the name through a form field called
 * `name`, like the plain input it replaces. Picking an entry fills the management company; reference
 * prices, when the catalog holds sourced ones, are only OFFERED.
 */
export function ScpiNameField({
  id = "name",
  defaultName,
  metadata,
  onMetadataChange,
  currency,
}: {
  id?: string;
  defaultName: string;
  metadata: ScpiMetadata;
  onMetadataChange: (next: ScpiMetadata) => void;
  currency: string;
}) {
  const st = useScpiText();
  const { intlLocale } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [name, setName] = useState(defaultName);
  const [dismissedOffer, setDismissedOffer] = useState(false);
  // An existing asset keeps what it has: a catalog pick shows the combobox, anything else free text.
  const [manual, setManual] = useState(() => defaultName !== "" && !getCatalogEntry(metadata.catalog_id));

  const selected = getCatalogEntry(metadata.catalog_id);
  const results = useMemo(() => searchScpiCatalog(query), [query]);
  const offer = !dismissedOffer ? referenceOffer(selected) : null;

  function pick(entry: ScpiCatalogEntry) {
    setName(entry.name);
    setDismissedOffer(false);
    onMetadataChange({
      ...metadata,
      management_company: entry.managementCompany,
      catalog_id: entry.id,
      name_source: "catalog",
    });
    setOpen(false);
    setQuery("");
  }

  function goManual() {
    setManual(true);
    setOpen(false);
    setQuery("");
    onMetadataChange({ ...metadata, catalog_id: "", name_source: "manual" });
  }

  function backToCatalog() {
    setManual(false);
    setName(selected?.name ?? "");
  }

  if (manual) {
    return (
      <div className="space-y-2">
        <Input
          id={id}
          name="name"
          aria-label={st("scpi2_name_manual_label")}
          placeholder={st("scpi2_name_manual_label")}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (metadata.name_source !== "manual" && metadata.name_source !== "") {
              onMetadataChange({ ...metadata, catalog_id: "", name_source: "manual" });
            }
          }}
          required
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{st("scpi2_name_manual_hint")}</p>
          <Button type="button" variant="ghost" size="sm" onClick={backToCatalog}>
            {st("scpi2_name_back")}
          </Button>
        </div>
      </div>
    );
  }

  const money = moneyFormatter(intlLocale, currency);

  return (
    <div className="space-y-2">
      {/* The value that is actually submitted; hidden but still checked by `required`. */}
      <input
        name="name"
        value={name}
        onChange={() => undefined}
        required
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute size-px opacity-0"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className={cn("truncate", !name && "text-muted-foreground")}>
              {name || st("scpi2_name_placeholder")}
            </span>
            <ChevronsUpDown className="ms-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[280px] border-border bg-popover p-0">
          {/* Filtering is done by `searchScpiCatalog` (accent-insensitive, aliases, management company). */}
          <Command shouldFilter={false}>
            <CommandInput placeholder={st("scpi2_name_search")} value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>{st("scpi2_name_empty")}</CommandEmpty>
              <CommandGroup>
                {results.map((entry) => (
                  <CommandItem key={entry.id} value={entry.id} onSelect={() => pick(entry)}>
                    <Check className={cn("me-2 size-4", entry.id === metadata.catalog_id ? "opacity-100" : "opacity-0")} />
                    <span className="flex-1 truncate">{entry.name}</span>
                    <span className="ms-2 truncate text-xs text-muted-foreground">{entry.managementCompany}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem value="__manual__" onSelect={goManual}>
                  <PenLine className="me-2 size-4" />
                  {st("scpi2_name_manual")}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
          <span>
            <span className="font-medium text-foreground">{st("scpi2_verified")}.</span>{" "}
            {st("scpi2_catalog_checked", { date: selected.lastChecked })}
          </span>
        </p>
      )}

      {offer && (
        <div className="space-y-2 border border-border bg-muted/40 p-3 text-xs text-foreground">
          <p>
            {st("scpi2_ref_offer", {
              date: offer.asOf,
              subscription: offer.subscriptionPrice != null ? money.format(offer.subscriptionPrice) : "—",
              withdrawal: offer.withdrawalPrice != null ? money.format(offer.withdrawalPrice) : "—",
              source: offer.sourceUrl,
            })}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onMetadataChange(applyReferencePrices(metadata, offer));
                setDismissedOffer(true);
              }}
            >
              {st("scpi2_ref_apply")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDismissedOffer(true)}>
              {st("scpi2_ref_dismiss")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
