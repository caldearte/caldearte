"use client";

import { useState } from "react";
import Image from "next/image";
import { esCL } from "@/i18n/es-CL";
import { resolveCardImage, PLACEHOLDER_BG } from "@/lib/image-source";

interface CardImageProps {
  imageUrl: string | null;
  sourceUrl: string | null;
  sensitivityTags: string[];
  // True only on the standalone /eventos/[id] page: shows the real photo at
  // its own natural aspect ratio (no crop) instead of the home/archive
  // cards' fixed-height object-cover crop. Placeholders have no real
  // dimensions to respect, so they keep a fixed aspect box either way.
  fullSize?: boolean;
  // True only for the very first card on the home page (the mobile LCP
  // element per the 2026-08-17 Lighthouse audit — lcp-discovery-insight
  // flagged it discoverable and non-lazy already, just missing this hint).
  priority?: boolean;
}

export default function CardImage({ imageUrl, sourceUrl, sensitivityTags, fullSize = false, priority = false }: CardImageProps) {
  const [revealed, setRevealed] = useState(false);
  const sensitive = sensitivityTags.length > 0;
  const image = resolveCardImage({ imageUrl, sourceUrl });
  const blurClass = sensitive && !revealed ? "blur-xl scale-110" : "";
  // Real bug found 2026-08-06 (EventDetailCard's own listPosition row
  // exposed it, but it predates that change): fullSize + a PLACEHOLDER
  // image (no real photo — this prop's own doc comment already says
  // "placeholders... keep a fixed aspect box either way") used to still
  // get `h-full` — meaningless on this page, since EventDetailCard's
  // wrapper div has no explicit height for it to fill, so the whole image
  // box silently collapsed to 0px and everything below it rendered on
  // top of the (still absolutely-positioned) HOY/ÚLTIMOS DÍAS badges.
  const heightClass = fullSize ? (image.type === "photo" ? "" : "aspect-[4/3]") : "h-full";

  return (
    <div className={`relative w-full ${heightClass} overflow-hidden bg-stone-800`}>
      {image.type === "photo" ? (
        fullSize ? (
          // width=0/height=0 + sizes is next/image's documented pattern for
          // "unknown real dimensions, full-width, height auto-scaled to the
          // image's own real aspect ratio" — we don't store the scraped
          // photo's dimensions, so this is the only way to keep the
          // uncropped natural-aspect behavior this prop promises while
          // still going through Vercel's optimizer/srcset.
          <Image
            src={image.url}
            alt=""
            width={0}
            height={0}
            sizes="100vw"
            priority={priority}
            className={`w-full h-auto transition-[filter] duration-300 ${blurClass}`}
          />
        ) : (
          <Image
            src={image.url}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            priority={priority}
            className={`object-cover transition-[filter] duration-300 ${blurClass}`}
          />
        )
      ) : (
        <div
          className={`w-full h-full bg-cover bg-center transition-[filter] duration-300 ${blurClass}`}
          style={{ backgroundImage: `url(${PLACEHOLDER_BG[image.source]})` }}
        >
          {image.source === "web" && image.domain && (
            <div className="absolute inset-x-0 bottom-3 flex justify-center">
              <span className="text-[11px] font-semibold text-white bg-black/50 rounded-[10px] px-2 py-1">{image.domain}</span>
            </div>
          )}
        </div>
      )}

      {sensitive && !revealed && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-xl flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 bg-black/40 rounded-[20px] px-5 py-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/eye-off.svg" alt="" width={20} height={20} />
            <p className="text-[13px] font-semibold text-white">{esCL.sensitiveOverlay.label}</p>
            <button
              onClick={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                setRevealed(true);
              }}
              className="text-[12px] font-semibold text-white border border-white rounded-full px-3 py-1.5"
            >
              {esCL.sensitiveOverlay.reveal}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
