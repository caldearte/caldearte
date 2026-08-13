// Instagram accounts followed as bright sources, via Apify
// (see apps/curator/src/lib/apify-instagram.ts and
// apps/curator/src/instagram-discovery/run.ts). Deliberately its own list,
// indexed by `username` rather than folded into known-sources.ts's
// `KNOWN_SOURCES`: that list dedupes by bare hostname
// (`knownSourceDomain` in known-sources.ts), so two Instagram accounts
// would collide there. Same "note"/"addedAt" documentation convention as
// `KnownSource`.
//
// Policy, agreed explicitly with Daniel (2026-08-12): only public
// accounts, never private — both an editorial decision and a real
// technical limit of Apify's actor (it never logs in, so it can't read a
// private account at all). Confirm an account is public AND still active
// (a real post within the last few months) before adding it — a dead
// public account just wastes the run.
export interface InstagramAccountConfig {
  username: string;
  note: string;
  addedAt: string;
  // Same meaning as KnownSource.fixedLocation (known-sources.ts) — set
  // only when the account is a confirmed single fixed venue/organization,
  // so Haiku doesn't need to infer a comuna from the caption.
  fixedLocation?: { location: string; placeName: string };
}

export const INSTAGRAM_ACCOUNTS: InstagramAccountConfig[] = [
  {
    username: "casaculturalyanulaque",
    note:
      "Cuenta de prueba para la primera verificación end-to-end del " +
      "pipeline: pública, activa (último post hace ~5 días, de una " +
      "exposición real) — confirmado por Daniel el 2026-08-12. El otro " +
      "candidato evaluado antes, la_playa_galeria, se descartó: última " +
      "publicación de 2025, ya no está viva. (casachagual.cl también " +
      "había sido descartada en esa primera revisión por el mismo motivo, " +
      "pero era un error — Daniel la confundió con otra cuenta; sí está " +
      "viva, ver su propia entrada más abajo.)",
    addedAt: "2026-08-12",
  },
  {
    username: "casachagual.cl",
    note:
      "Corrección de Daniel, 2026-08-13: en la revisión inicial (2026-08-10) " +
      "se había descartado por confundirla con otra cuenta distinta — sí es " +
      "pública y válida, se agrega ahora.",
    addedAt: "2026-08-13",
  },
  {
    username: "satva.arte.arica",
    note:
      "Aportada por Daniel, 2026-08-13. Pública y real, pero de baja " +
      "frecuencia: su último post confirmado (2026-06-17) quedó fuera de " +
      "la ventana de la primera corrida real — exactamente el caso que la " +
      "cadencia adaptativa (14→21→28 días) está pensada para manejar.",
    addedAt: "2026-08-13",
  },
  {
    username: "tallerdeartes_autismoarica",
    note:
      "Aportada por Daniel, 2026-08-13. Pública, pero de muy baja " +
      "frecuencia — su único post reciente detectado (2026-07-22) ni " +
      "siquiera aparece con su propio username como ownerUsername (llegó " +
      "atribuido a otra cuenta, probablemente una colaboración/repost). " +
      "Vigilar si de verdad publica contenido propio con regularidad.",
    addedAt: "2026-08-13",
  },
  {
    username: "atacama_artgallery",
    note: "Aportada por Daniel, 2026-08-13 — pendiente de auditoría de calidad tras la primera corrida real.",
    addedAt: "2026-08-13",
  },
  // El resto de la lista la aporta Daniel — una decisión editorial, igual
  // que cada fuente brillante nueva se evaluó una por una. Confirmar
  // pública y activa antes de agregar cada cuenta.
];
