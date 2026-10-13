import type { ReactNode } from "react";

// Shared field chrome for the site's two public forms (newsletter, "Agrega
// tu expo"), 2026-10-13: a white box on the panel's gray-blue so it's
// obvious where to tap, the label always visible above it, the
// placeholder as a light-gray example (never mistakable for a filled-in
// value), and the error right under its own field.
export const FIELD_BOX =
  "w-full h-[48px] bg-surface-white border-2 border-transparent rounded-[12px] px-[14px] font-lato font-semibold text-[16px] text-text-primary placeholder:font-normal placeholder:text-text-secondary/55 focus:outline-none focus:border-text-primary";
export const FIELD_BOX_INVALID = "!border-red-600";

export const FIELD_LABEL = "font-geist font-semibold text-[12px] tracking-[1.5px] uppercase text-text-primary";

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export default function FormField({ label, htmlFor, error, hint, children }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-[6px] min-w-0">
      <label htmlFor={htmlFor} className={FIELD_LABEL}>
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="font-geist font-semibold text-[13px] text-red-700">
          {error}
        </p>
      ) : (
        hint && <p className="font-geist text-[13px] text-text-primary/75">{hint}</p>
      )}
    </div>
  );
}
