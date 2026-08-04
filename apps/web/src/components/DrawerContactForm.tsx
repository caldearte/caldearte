"use client";

import { useState, type FormEvent } from "react";
import { esCL } from "@/i18n/es-CL";
import { statusBoxClass } from "@/lib/formStatusBox";

type Status = "idle" | "sending" | "success" | "error";

const STATUS_BOX_SUCCESS = statusBoxClass("success", "text-surface-sage");
const STATUS_BOX_ERROR = statusBoxClass("error", "text-surface-sage");

const FIELD_CLASS = "bg-surface-white flex gap-[12px] items-center px-[16px] py-[16px] rounded-input w-full text-left";
const FIELD_TEXT_CLASS = "flex-1 min-w-0 bg-transparent font-geist text-[16px] text-[#5e6668] placeholder:text-[#5e6668] focus:outline-none";

// Rediseño 2.0.0 — the menu drawer's own contact form
// (caldearte-web-contacto-v2.0.0 / caldearte-mobile-contacto), shown
// in-place inside MenuDrawer's "contact" view rather than navigating to
// /contacto. Deliberately a separate component from ContactForm.tsx (the
// standalone /contacto page's form) — different copy, dark-bg styling,
// and this one's status messages use the same boxed style as
// NewsletterSection instead of a plain line of text.
export default function DrawerContactForm() {
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    const form = e.currentTarget;
    const data = new FormData(form);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          message: data.get("message"),
        }),
      });
      if (!res.ok) throw new Error("send failed");
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return <p className={STATUS_BOX_SUCCESS}>{esCL.menuDrawer.success}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-[16px] w-full">
      <label className={FIELD_CLASS}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
        <img src="/icons/form-avatar.svg" alt="" width={18} height={18} className="shrink-0" />
        <input name="name" type="text" placeholder={esCL.menuDrawer.namePlaceholder} className={FIELD_TEXT_CLASS} />
      </label>
      <label className={FIELD_CLASS}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
        <img src="/icons/form-mail.svg" alt="" width={18} height={18} className="shrink-0" />
        <input name="email" type="email" required placeholder={esCL.menuDrawer.emailPlaceholder} className={FIELD_TEXT_CLASS} />
      </label>
      <label className={`${FIELD_CLASS} items-start h-[180px]`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
        <img src="/icons/form-pen.svg" alt="" width={18} height={18} className="shrink-0 mt-[2px]" />
        <textarea
          name="message"
          required
          placeholder={esCL.menuDrawer.messagePlaceholder}
          className={`${FIELD_TEXT_CLASS} h-full resize-none`}
        />
      </label>
      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full bg-brand-magenta text-surface-sage rounded-input py-[16px] font-geist font-bold text-[14px] text-center disabled:opacity-60"
      >
        {status === "sending" ? esCL.menuDrawer.sending : esCL.menuDrawer.submit}
      </button>
      {status === "error" && <p className={STATUS_BOX_ERROR}>{esCL.menuDrawer.error}</p>}
    </form>
  );
}
