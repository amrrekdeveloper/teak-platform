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
};

type AccountComboboxProps = {
  accounts: AccountOption[];
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
            {selected ? `${selected.code} - ${selected.nameAr}` : placeholder}
          </span>
          <ChevronsUpDown className="ms-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-0 w-[var(--radix-popover-trigger-width)] min-w-64", className)} align="start" dir="rtl">
        <Command
          filter={(itemValue, search) => {
            return itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} className="text-xs" data-testid={testId ? `${testId}-search` : undefined} />
          <CommandList>
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">{emptyText}</CommandEmpty>
            <CommandGroup>
              {accounts.map((a) => (
                <CommandItem
                  key={a.code}
                  value={`${a.code} ${a.nameAr} ${a.nameEn || ""}`}
                  onSelect={() => {
                    onChange(a.code, a);
                    setOpen(false);
                  }}
                  className="text-xs"
                  data-testid={testId ? `${testId}-option-${a.code}` : undefined}
                >
                  <Check className={cn("me-2 h-3.5 w-3.5", value === a.code ? "opacity-100" : "opacity-0")} />
                  <span className="font-mono">{a.code}</span>
                  <span className="ms-2 truncate text-muted-foreground">{a.nameAr}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
