import type { Metadata } from "next";
import Link from "next/link";
import { esCL } from "@/i18n/es-CL";

export const metadata: Metadata = { title: `${esCL.curatoriaPage.title} — ${esCL.appName}` };

export default function CuratoriaPage() {
  return (
    <main className="min-h-screen w-full bg-white px-4 py-8 md:px-[61px] max-w-[720px] mx-auto">
      <Link href="/" className="text-sm text-muted-gray">
        ← {esCL.appName}
      </Link>
      <h1 className="text-3xl font-black text-heading-gray mt-6 mb-8">{esCL.curatoriaPage.title}</h1>

      <p className="text-sm text-muted-gray leading-relaxed">{esCL.curatoriaText}</p>
    </main>
  );
}
