import Link from "next/link";
import { esCL } from "@/i18n/es-CL";

// Rediseño 2.0.0 — home teaser for /curatoria, sits between Inauguraciones
// and Exposiciones (contenido-principal's own order in Figma). Two
// breakpoint variants straight from Figma (174:2889 desktop, 178:111
// mobile) — not just a scaled-down desktop version: different radius,
// padding, wordmark size, and "ver mas" color (text/primary desktop,
// brand/magenta mobile).
export default function CuratoriaBanner() {
  return (
    <Link
      href="/curatoria"
      className="mt-16 flex items-start md:items-end gap-4 md:gap-[22px] bg-[rgba(199,212,217,0.62)] rounded-[20px] md:rounded-[30px] px-5 md:px-[62px] py-8 md:py-10"
    >
      <h2 className="font-lato font-black leading-none text-brand-magenta text-[40px] md:text-[96px] shrink-0">
        {esCL.curatoriaWordmarkLines.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </h2>
      <div className="font-geist text-text-primary tracking-[1px] md:tracking-[2px] uppercase text-[16px] md:text-[24px] leading-[1.4]">
        <p>{esCL.curatoriaTeaser}</p>
        <p className="font-bold underline text-brand-magenta md:text-text-primary text-[14px] md:text-[20px] mt-1 md:mt-2">{esCL.verMas}</p>
      </div>
    </Link>
  );
}
