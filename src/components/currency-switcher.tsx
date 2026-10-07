"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { currencies } from "@/lib/currencies";

/**
 * Sets the dashboard's display (base) currency: the `?currency=` search param, kept alongside any other
 * params. The one mechanism behind the header switcher AND the Global exposure bar's quick chips, so
 * there is a single source of truth (the URL, read by the dashboard page on the server).
 */
export function useSetDisplayCurrency(): (next: string) => void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return function setDisplayCurrency(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("currency", next);
    router.push(`${pathname}?${params.toString()}`);
  };
}

export function CurrencySwitcher({ value, className, ariaLabel }: { value: string; className?: string; ariaLabel?: string }) {
  const handleChange = useSetDisplayCurrency();

  return (
    <Select value={value} onValueChange={handleChange}>
      <SelectTrigger className={className ?? "w-40"} aria-label={ariaLabel}>
        <SelectValue>{value}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {currencies.map((currency) => (
          <SelectItem key={currency.code} value={currency.code}>
            {currency.code} — {currency.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
