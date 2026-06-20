"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CurrencyInputProps {
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  id?: string;
  className?: string;
  wrapperClassName?: string;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * CurrencyInput — always shows exactly two decimal places.
 * $ sign on the left inside the box.
 * Optional unit on the right.
 * Perfect centering of the number.
 * Smooth editing experience with focus state.
 */
export function CurrencyInput({
  value,
  onChange,
  unit,
  id,
  className,
  wrapperClassName,
  disabled,
  placeholder,
}: CurrencyInputProps) {
  const [localValue, setLocalValue] = React.useState<string>("");
  const [isFocused, setIsFocused] = React.useState(false);

  // Opt-in blank rendering: when a placeholder is supplied and the value is empty/0,
  // render nothing so the faded placeholder shows instead of a literal "0.00".
  // Callers that don't pass a placeholder keep the original behavior (0 -> "0.00").
  const blankMode = placeholder !== undefined && !value;
  const displayValue = isFocused ? localValue : (blankMode ? "" : value.toFixed(2));

  const roundToTwo = (n: number) => Math.round(n * 100) / 100;

  const commitValue = (raw: string) => {
    if (raw === "" || raw === ".") {
      onChange(0);
      return;
    }
    const parsed = parseFloat(raw);
    if (isNaN(parsed)) {
      onChange(0);
      return;
    }
    onChange(roundToTwo(parsed));
  };

  const handleFocus = () => {
    setIsFocused(true);
    setLocalValue(blankMode ? "" : value.toFixed(2));
  };

  const handleBlur = () => {
    setIsFocused(false);
    commitValue(localValue);
    setLocalValue("");
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw !== "" && !/^[0-9]*\.?[0-9]*$/.test(raw)) {
      return;
    }
    setLocalValue(raw);
    commitValue(raw);
  };

  return (
    <div
      className={cn(
        "flex items-center w-full rounded-md border border-input bg-background text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        wrapperClassName ?? "h-10",
        disabled && "opacity-60"
      )}
    >
      <span className="pl-3 text-muted-foreground select-none">$</span>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        value={displayValue}
        placeholder={placeholder}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onChange={handleChange}
        disabled={disabled}
        className={cn(
          "flex-1 border-0 bg-transparent text-center focus-visible:ring-0 focus-visible:ring-offset-0 font-medium py-0 h-full",
          className
        )}
      />
      {unit && <span className="pr-3 text-muted-foreground text-sm select-none">{unit}</span>}
    </div>
  );
}
