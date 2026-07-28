import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export type AccountOption = {
  code: string;
  nameAr: string;
  nameEn?: string | null;
  /** Optional label rendered instead of the raw code (e.g. "عميل" for a customer party option). */
  codeLabel?: string;
};

export type AccountGroup = {
  label: string;
  accounts: AccountOption[];
};

type AccountComboboxProps = {
  accounts: AccountOption[];
  /** Optional grouped rendering; when provided, `accounts` should be the flat union (used for lookup). */
  groups?: AccountGroup[];
  value: string;
  onChange: (code: string, account: AccountOption | undefined) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  triggerClassName?: string;
  testId?: string;
};

export function AccountCombobox({
  accounts,
  groups,
  value,
  onChange,
  placeholder = "اختر حساباً",
  searchPlaceholder = "بحث بالرمز أو الاسم...",
  emptyText = "لا توجد نتائج",
  className,
  triggerClassName,
  testId,
}: AccountComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = accounts.find((a) => a.code === value);

  const handleSelect = (account: AccountOption) => {
    onChange(account.code, account);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-7 w-full justify-between px-2 text-xs font-mono font-normal",
            !selected && "text-muted-foreground",
            triggerClassName,
          )}
          data-testid={testId}
        >
          <span className="truncate">
            {selected
              ? selected.codeLabel
                ? `${selected.nameAr} (${selected.codeLabel})`
                : `${selected.code} - ${selected.nameAr}`
              : placeholder}
          </span>
          <ChevronsUpDown className="ms-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("p-0 w-[var(--radix-popover-trigger-width)] min-w-64", className)}
        align="start"
        dir="rtl"
        side="bottom"
        avoidCollisions={true}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command
          filter={(itemValue, search) => {
            return itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput
            placeholder={searchPlaceholder}
            className="text-xs"
            data-testid={testId ? `${testId}-search` : undefined}
          />
          <CommandList className="max-h-52">
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">{emptyText}</CommandEmpty>
            {(groups && groups.length > 0
              ? groups.filter((g) => g.accounts.length > 0)
              : [{ label: "", accounts }]
            ).map((group, gi) => (
              <CommandGroup
                key={group.label || gi}
                heading={group.label || undefined}
              >
                {group.accounts.map((a) => (
                  <CommandItem
                    key={a.code}
                    value={`${a.code} ${a.nameAr} ${a.nameEn || ""}`}
                    onSelect={() => handleSelect(a)}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      handleSelect(a);
                    }}
                    className="text-xs cursor-pointer"
                    data-testid={testId ? `${testId}-option-${a.code}` : undefined}
                  >
                    <Check className={cn("me-2 h-3.5 w-3.5", value === a.code ? "opacity-100" : "opacity-0")} />
                    {a.codeLabel ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-sans text-muted-foreground">{a.codeLabel}</span>
                    ) : (
                      <span className="font-mono">{a.code}</span>
                    )}
                    <span className="ms-2 truncate text-muted-foreground">{a.nameAr}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
