"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { countries } from "@/lib/countries";

type CountryComboboxProps = {
  /** Which field on the matched country this combobox reads/returns. */
  field: "name" | "dialCode";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export function CountryCombobox({
  field,
  value,
  onChange,
  placeholder = "Select country…",
  className,
}: CountryComboboxProps) {
  const [open, setOpen] = useState(false);

  const selected = countries.find((country) => country[field] === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between font-normal", className)}
        >
          <span className="truncate">
            {selected
              ? field === "dialCode"
                ? selected.dialCode
                : selected.name
              : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] border-border bg-popover p-0">
        <Command>
          <CommandInput placeholder="Search country…" />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {countries.map((country) => (
                <CommandItem
                  key={country.code}
                  value={country.name}
                  onSelect={() => {
                    onChange(country[field]);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 size-4",
                      value === country[field] ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="flex-1 truncate">{country.name}</span>
                  {field === "dialCode" && (
                    <span className="ml-2 text-muted-foreground">
                      {country.dialCode}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
