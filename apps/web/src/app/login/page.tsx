"use client";

import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import { esCL } from "@/i18n/es-CL";

// Deliberately never linked from Header/Footer/MenuDrawer — the only way
// here is knowing this URL exists (confirmed with the user 2026-08-05).
// Client component (useSession) rather than a server component reading
// auth() directly, since it also needs the interactive signIn/signOut
// calls — no real benefit to splitting that across a server/client
// boundary for a page this small.
export default function LoginPage() {
  const { data: session, status } = useSession();

  return (
    <main className="min-h-screen w-full bg-surface-sage px-[20px] py-8 md:px-[61px] max-w-[1280px] mx-auto">
      <Link href="/" className="font-lato font-black leading-none text-brand-magenta text-[28px]">
        {esCL.appName}
      </Link>

      <div className="mt-[60px] md:mt-[100px] max-w-[480px] flex flex-col gap-[24px]">
        <p className="font-geist text-[16px] text-text-primary">{esCL.loginPage.note}</p>

        {status === "loading" ? null : session?.user?.isAdmin ? (
          <>
            <p className="font-geist text-[16px] text-text-primary">{esCL.loginPage.signedInAsAdmin(session.user.email ?? "")}</p>
            <button
              type="button"
              onClick={() => signOut()}
              className="self-start font-fragment-mono uppercase text-[14px] text-text-primary underline cursor-pointer"
            >
              {esCL.loginPage.signOut}
            </button>
          </>
        ) : session ? (
          <>
            <p className="font-geist text-[16px] text-text-primary">{esCL.loginPage.signedInNotAdmin(session.user?.email ?? "")}</p>
            <button
              type="button"
              onClick={() => signOut()}
              className="self-start font-fragment-mono uppercase text-[14px] text-text-primary underline cursor-pointer"
            >
              {esCL.loginPage.signOut}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => signIn("google")}
            className="self-start font-fragment-mono uppercase text-[14px] bg-text-primary text-surface-sage px-[24px] py-[14px] cursor-pointer"
          >
            {esCL.loginPage.signInWithGoogle}
          </button>
        )}
      </div>
    </main>
  );
}
