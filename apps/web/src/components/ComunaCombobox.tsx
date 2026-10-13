"use client";

import { useId, useState } from "react";
import { esCL } from "@/i18n/es-CL";
import { matchesQuery } from "@/lib/cities";
import { shortRegionName } from "@/lib/regionNames";
import { FIELD_BOX, FIELD_BOX_INVALID } from "./FormField";

export interface ComunaOption {
  id: string;
  name: string;
  adminRegionName: string | null;
}

interface ComunaComboboxProps {
  id: string;
  comunas: ComunaOption[];
  value: ComunaOption | null;
  onChange: (comuna: ComunaOption | null) => void;
  invalid?: boolean;
}

const MAX_OPTIONS = 8;

// Type-to-search comuna picker for "Agrega tu expo" (2026-10-13): you type
// "villa al", pick "Villa Alemana · Valparaíso" from the list — the
// answer is always one of the real 346 comunas, so the old "Elige una
// comuna de la lista" error after the fact can't happen. Typing again
// clears the choice until another one is picked.
export default function ComunaCombobox({ id, comunas, value, onChange, invalid = false }: ComunaComboboxProps) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  const q = query.trim();
  const options = q
    ? comunas.filter((c) => matchesQuery(c.name, q) || (c.adminRegionName !== null && matchesQuery(c.adminRegionName, q))).slice(0, MAX_OPTIONS)
    : [];

  function pick(c: ComunaOption) {
    onChange(c);
    setQuery(c.name);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={query}
        placeholder={esCL.agregaExpo.comunaSearchPlaceholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
          if (value) onChange(null);
        }}
        onFocus={() => setOpen(true)}
        // Delay so a click on an option lands before the list closes.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!open || options.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(options[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className={`${FIELD_BOX} ${invalid ? FIELD_BOX_INVALID : ""}`}
      />
      {open && q !== "" && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full mt-[6px] z-20 max-h-[300px] overflow-y-auto overscroll-contain rounded-[12px] bg-surface-white shadow-lg border border-text-primary/10 py-[6px]">
          {options.length === 0 ? (
            <li className="px-[14px] py-[9px] font-geist text-[14px] text-text-secondary">{esCL.agregaExpo.comunaNoResults}</li>
          ) : (
            options.map((c, i) => (
              <li
                key={c.id}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
                onMouseEnter={() => setActive(i)}
                className={`flex items-baseline justify-between gap-[12px] px-[14px] py-[9px] cursor-pointer font-geist text-[15px] text-text-primary ${i === active ? "bg-surface-sage" : ""}`}
              >
                <span className="font-semibold">{c.name}</span>
                {c.adminRegionName && <span className="text-[13px] text-text-secondary">{shortRegionName(c.adminRegionName)}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
