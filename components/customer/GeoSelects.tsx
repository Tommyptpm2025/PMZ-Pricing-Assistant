"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  COUNTRIES,
  statesForCountry,
  stateNameByCode,
  countryNameByCode,
  type GeoOption,
} from "@/lib/geo-data";

// Shared input styling matching the rest of the customer form's native selects.
const SELECT_CLASS =
  "mt-1.5 w-full h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface GeoChange {
  code: string;
  name: string;
}

interface StateProvinceSelectProps {
  id?: string;
  value: string;        // 2-letter code
  countryCode?: string; // filters the list (US states vs CA provinces); defaults to US
  onChange: (v: GeoChange) => void;
  className?: string;
  disabled?: boolean;
}

/**
 * State / Province select — the list reflects the selected country (US states + DC, or Canadian
 * provinces + territories). Full name as the label; value is the 2-letter code. onChange returns
 * both code and name. Shared by the Job Site and Billing address blocks.
 */
export function StateProvinceSelect({ id, value, countryCode, onChange, className, disabled }: StateProvinceSelectProps) {
  const options = statesForCountry(countryCode || "US");
  return (
    <select
      id={id}
      value={value || ""}
      disabled={disabled}
      onChange={(e) => onChange({ code: e.target.value, name: stateNameByCode(e.target.value) })}
      className={cn(SELECT_CLASS, className)}
    >
      <option value="">Select state / province…</option>
      {options.map((s: GeoOption) => (
        <option key={s.code} value={s.code}>{s.name}</option>
      ))}
    </select>
  );
}

interface CountrySelectProps {
  id?: string;
  value: string; // 2-letter ISO code
  onChange: (v: GeoChange) => void;
  options?: GeoOption[]; // override the list (e.g. US/Canada only); defaults to the full list
  className?: string;
  disabled?: boolean;
}

/**
 * Country select. Defaults to the full ISO-3166 list (US + Canada pinned top); pass `options` to
 * limit it (e.g. US_CA_COUNTRIES). Value is the 2-letter ISO code; onChange returns code + name.
 */
export function CountrySelect({ id, value, onChange, options, className, disabled }: CountrySelectProps) {
  const list = options ?? COUNTRIES;
  return (
    <select
      id={id}
      value={value || ""}
      disabled={disabled}
      onChange={(e) => onChange({ code: e.target.value, name: countryNameByCode(e.target.value) })}
      className={cn(SELECT_CLASS, className)}
    >
      <option value="">Select country…</option>
      {list.map((c: GeoOption) => (
        <option key={c.code} value={c.code}>{c.name}</option>
      ))}
    </select>
  );
}
