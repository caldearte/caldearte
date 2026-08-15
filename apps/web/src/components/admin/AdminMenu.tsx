"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { esCL } from "@/i18n/es-CL";
import DrawerShell from "@/components/DrawerShell";

// Same DrawerShell chrome MenuDrawer uses on the public site — /admin has
// no Header of its own, so this owns its own hamburger trigger instead of
// sharing Header's. Two entries only: back to the public site, and sign
// out (reuses the same signOut() call and copy as /login's own button).
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
          <Link href="/" className="font-fragment-mono uppercase text-[16px]" onClick={() => setOpen(false)}>
            {esCL.adminMenu.home}
          </Link>
          <button type="button" onClick={() => signOut()} className="self-start font-fragment-mono uppercase text-[16px] cursor-pointer">
            {esCL.loginPage.signOut}
          </button>
        </div>
      </DrawerShell>
    </>
  );
}
