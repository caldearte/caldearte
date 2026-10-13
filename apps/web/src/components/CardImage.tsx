"use client";

import { useState } from "react";
import Image from "next/image";
import { esCL } from "@/i18n/es-CL";
import { resolveCardImage, PLACEHOLDER_BG } from "@/lib/image-source";
import { isOptimizableImageUrl } from "@/lib/imageHosts";

interface CardImageProps {
  imageUrl: string | null;
  sourceUrl: string | null;
  sensitivityTags: string[];
  // True only on the standalone /eventos/[id] page: shows the whole photo,
  // uncropped (letterboxed in a 4:5 box), instead of the cards' own
  // object-cover crop.
  fullSize?: boolean;
  // True only for the very first card on the home page (the mobile LCP
  // element per the 2026-08-17 Lighthouse audit — lcp-discovery-insight
  // flagged it discoverable and non-lazy already, just missing this hint).
  // Real bug found 2026-08-19: this used to set next/image's `priority`,
  // deprecated as of Next 16 in favor of `preload` — but `preload` only
  // inserts a <link> in <head>, it doesn't apply fetchpriority to the
  // <img> tag itself, so lcp-discovery-insight kept failing even with it
  // set. Next's own docs recommend `loading="eager"` + `fetchPriority`
  // instead, which sets the attribute directly on the element.
  priority?: boolean;
  // Describes the photo for screen readers and image search — the event's
  // own title is the best text we have (2026-10-12: every event image used
  // to ship with alt="").
  alt?: string;
  // Small thumbnails (home agenda/cartelera, 2026-10-12): the sensitive
  // overlay shrinks to just its icon — the label and "Ver contenido"
  // button don't fit at ~90px, and revealing happens on the ficha anyway.
  compact?: boolean;
}

export default function CardImage({ imageUrl, sourceUrl, sensitivityTags, fullSize = false, priority = false, alt = "", compact = false }: CardImageProps) {
  const [revealed, setRevealed] = useState(false);
  // A photo that fails to load (most often a host not yet in
  // next.config.ts's EVENT_IMAGE_HOSTS — 5 of 85 home images on
  // 2026-10-12) falls back to the same placeholder an event with no photo
  // gets, instead of an empty dark box.
  const [failed, setFailed] = useState(false);
  const sensitive = sensitivityTags.length > 0;
  const resolved = resolveCardImage({ imageUrl, sourceUrl });
  const image = failed && resolved.type === "photo" ? resolveCardImage({ imageUrl: null, sourceUrl }) : resolved;
  const blurClass = sensitive && !revealed ? "blur-xl scale-110" : "";
  // A host outside next.config.ts's allowlist would 400 through the
  // optimizer in production and throw during render in `next dev` — load
  // it straight from the source instead (see lib/imageHosts.ts).
  const unoptimized = image.type === "photo" && !isOptimizableImageUrl(image.url);
  // fullSize reserves a 4:5 box (the shape of most source flyers) and
  // letterboxes the photo inside it with object-contain — never cropped,
  // and the page no longer jumps ~450px when the photo finishes loading
  // (2026-10-12: the old width=0/height=0 natural-size image had zero
  // height until then).
  const heightClass = fullSize ? "aspect-[4/5]" : "h-full";

  return (
    <div className={`relative w-full ${heightClass} overflow-hidden ${fullSize ? "bg-surface-sage-dark" : "bg-stone-800"}`}>
      {image.type === "photo" ? (
        fullSize ? (
          <Image
            src={image.url}
            alt={alt}
            fill
            sizes="(max-width: 768px) 100vw, 600px"
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            unoptimized={unoptimized}
            onError={() => setFailed(true)}
            className={`object-contain transition-[filter] duration-300 ${blurClass}`}
          />
        ) : (
          <Image
            src={image.url}
            alt={alt}
            fill
            sizes={compact ? "(max-width: 768px) 50vw, 25vw" : "(max-width: 768px) 100vw, 50vw"}
            unoptimized={unoptimized}
            onError={() => setFailed(true)}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            quality={65}
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

      {sensitive && !revealed && compact && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-xl flex items-center justify-center" title={esCL.sensitiveOverlay.label}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/eye-off.svg" alt={esCL.sensitiveOverlay.label} width={20} height={20} />
        </div>
      )}
      {sensitive && !revealed && !compact && (
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
