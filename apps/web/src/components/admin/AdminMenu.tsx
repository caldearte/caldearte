"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { esCL } from "@/i18n/es-CL";
import DrawerShell from "@/components/DrawerShell";

// Same DrawerShell chrome MenuDrawer uses on the public site — /admin has
// no Header of its own, so this owns its own hamburger trigger instead of
// sharing Header's. "Inicio" moved to the top bar directly (Daniel's
// request, 2026-08-16) — this drawer now holds cross-page nav within
// admin mode (currently just Costos) plus sign out.
export default function AdminMenu() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={esCL.menu}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
        <img src="/icons/hamburger.svg" alt="" width={22} height={20} />
      </button>

      <DrawerShell open={open} onClose={() => setOpen(false)}>
        <button type="button" onClick={() => setOpen(false)} aria-label={esCL.menu} className="self-end cursor-pointer">
          {/* eslint-disable-next-line @next/next/no-img-element -- Figma-exported asset, verbatim per design decision */}
          <img src="/icons/close-x.svg" alt="" width={50} height={50} />
        </button>

        <div className="mt-[40px] flex flex-col gap-[24px]">
          <Link href="/admin/costos" className="font-fragment-mono uppercase text-[16px]" onClick={() => setOpen(false)}>
            {esCL.adminMenu.costos}
          </Link>
          <button type="button" onClick={() => signOut()} className="self-start font-fragment-mono uppercase text-[16px] cursor-pointer">
            {esCL.loginPage.signOut}
          </button>
        </div>
      </DrawerShell>
    </>
  );
}
