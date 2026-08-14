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
  {
    username: "factor__f",
    note:
      "Aportada por Daniel, 2026-08-14. Densidad muy alta — 5/5 posts " +
      "reales evaluados: 3 anuncios de la inauguración de \"BOTÁNICA\" " +
      "(jueves 13 de agosto, 19:00 hrs, 30 artistas), un aviso de cierre " +
      "de \"Formas de habitar la materia\" (hasta el 9 de agosto) y un " +
      "video de recorrido guiado de la misma. Espacio fijo, Franklin 741, " +
      "Barrio Franklin — fixedLocation.",
    addedAt: "2026-08-14",
    fixedLocation: { location: "Santiago", placeName: "Factor F" },
  },
  {
    username: "d21proyectosdearte",
    note:
      "Aportada por Daniel, 2026-08-14. Galería D21, Providencia (Nueva " +
      "de Lyon 19, depto. 21) — proyecto con financiamiento FONDART. " +
      "5 posts evaluados: 1 inauguración real y limpia (\"Afecto " +
      "Extraterrestre\", jueves 20 de agosto, 19:00 hrs), 1 exposición " +
      "real ya cerrada (\"En el Tiempo a Distancia\", hasta el 6 de " +
      "agosto), 2 posts de un encuentro/charla (fuera de alcance, mismo " +
      "criterio de siempre) y 1 aviso operativo de cierre por lluvia. " +
      "Fechas/horarios siempre claros. fixedLocation.",
    addedAt: "2026-08-14",
    fixedLocation: { location: "Providencia", placeName: "D21" },
  },
  {
    username: "hifas.galeria",
    note:
      "Encontrada revisando @artistasyungay (2026-08-14) — Galería Hifas, " +
      "Libertad 304, Barrio Yungay, Santiago. La más limpia evaluada esta " +
      "sesión: el anuncio original de \"Cartografía del Fuego\" (Ignacio " +
      "Gutiérrez Crocco) trae fecha de inauguración Y de cierre completas " +
      "en el mismo post (1 de agosto 19:00 hrs, disponible hasta el 13 de " +
      "septiembre). Confirmado independientemente vía Google Alerts el " +
      "mismo día. fixedLocation.",
    addedAt: "2026-08-14",
    fixedLocation: { location: "Santiago", placeName: "Galería Hifas" },
  },
  {
    username: "espacioandreabrunson",
    note:
      "Aportada por Daniel, 2026-08-14. Espacio Andrea Brunson, Alonso de " +
      "Monroy 3050 — confirmado por búsqueda que es Vitacura, no Santiago " +
      "centro. 2 inauguraciones reales y completas: \"Atlas de la espera\" " +
      "(Melania Lynch, sábado 15 de agosto 12:30 hrs) y \"ORNAMENTAL\" " +
      "(Daniela Pulido, jueves 18 de junio 19:00 hrs, ya pasada). El " +
      "resto: noticias institucionales (preselección Premio Pinault de " +
      "una artista representada) y presencia en la feria NADA en Nueva " +
      "York — fuera de alcance. fixedLocation.",
    addedAt: "2026-08-14",
    fixedLocation: { location: "Vitacura", placeName: "Espacio Andrea Brunson" },
  },
  {
    username: "ilposto.cl",
    note:
      "Aportada por Daniel, 2026-08-14. Il Posto, centro de investigación " +
      "y archivo de arte. Rendimiento esperado bajo: de 6 posts propios " +
      "evaluados, solo 1 es una inauguración real y limpia (\"Del objeto " +
      "al misterio\", Juan Pablo Langlois, ya pasada) — el resto son " +
      "convocatorias (incluida una internacional, Central Saint Martins, " +
      "Reino Unido), lanzamiento de libro y presentación de becarios. " +
      "Sin fixedLocation deliberadamente: aparecen 2 direcciones reales " +
      "distintas en los posts (Espoz 3150 Vitacura, y José Miguel de la " +
      "Barra 480 — probablemente Santiago Centro), no es un solo local " +
      "fijo — Haiku infiere ubicación por post, igual que un agregador.",
    addedAt: "2026-08-14",
  },
  {
    username: "mugupla",
    note:
      "Aportada por Daniel, 2026-08-14. MUG-UPLA, Museo Universitario de " +
      "Grabado (Universidad de Playa Ancha), Lautaro Rosas #485, Cerro " +
      "Alegre, Valparaíso. Inauguración real y completa evaluada: " +
      "\"Carlos Donaire Escobar (1929-2020): Grabar la memoria\", sábado " +
      "8 de agosto 12:00 hrs, con dirección y biografía del artista. El " +
      "resto: talleres de monotipia (Día de la Niñez), domingo de " +
      "entrada liberada, y un encuentro profesional de mediadores en OTRO " +
      "museo (Museo Marítimo Nacional) — fuera de alcance. fixedLocation.",
    addedAt: "2026-08-14",
    fixedLocation: { location: "Valparaíso", placeName: "MUG-UPLA" },
  },
  {
    username: "mamchiloe",
    note:
      "Aportada por Daniel, 2026-08-14. Museo de Arte Moderno de Chiloé, " +
      "Castro. 3/10 posts propios evaluados (el resto, contenido " +
      "etiquetado de otras organizaciones): \"Muestra Regional 2026\" " +
      "(inauguración 22 de agosto, hasta el 12 de diciembre, en el museo), " +
      "\"Apertura de proceso\" de una residencia artística (jueves 30 de " +
      "julio 15:30 hrs, en el museo) y \"Colección en ruta\", una " +
      "exposición itinerante en Santiago (Casa de la Cultura de Ñuñoa, " +
      "Irarrázaval 4055, hasta el 20 de septiembre) — por esta última, " +
      "sin fixedLocation: el museo sí lleva muestras fuera de su sede, " +
      "Haiku infiere ubicación por post, igual que ilposto.cl.",
    addedAt: "2026-08-14",
  },
  {
    username: "arte_uah",
    note:
      "Aportada por Daniel, 2026-08-14. Departamento de Arte de la " +
      "Universidad Alberto Hurtado. 4/12 posts propios evaluados: 1 " +
      "inauguración real y completa (\"Huellas de un atajo\" de Christian " +
      "Yovane + \"Adobe y sillerías\" de Rodrigo Galecio, sábado 15 de " +
      "agosto 12:00 hrs, Centro Patrimonial Posada del Corregidor, " +
      "Esmeralda 749, Santiago, hasta el 26 de septiembre), 1 convocatoria " +
      "(Premio Municipal Arte Joven), 1 lanzamiento de libro (Centro " +
      "Cultural de España) y 1 taller de tejido (Museo de Bellas Artes) — " +
      "los últimos 3 fuera de alcance. Sin fixedLocation: el departamento " +
      "promueve actividades en sedes de terceros, no un solo local propio " +
      "— Haiku infiere ubicación por post, igual que ilposto.cl/mamchiloe.",
    addedAt: "2026-08-14",
  },
  {
    username: "institutodearte.pucv",
    note:
      "Aportada por Daniel, 2026-08-14. Instituto de Arte, Pontificia " +
      "Universidad Católica de Valparaíso, Miraflores, Viña del Mar. La " +
      "cuenta más activa evaluada esta sesión (casi diaria) y con " +
      "programa real de exposiciones recurrente. 2 inauguraciones reales " +
      "y completas en la misma semana: \"Hiperia\" (Ágata M. Basáez, " +
      "inaugurada 10 de agosto, hasta el 31, Sala 2063, Los Acacios 2063) " +
      "y \"Cómo ordenar un miedo\" (Iván Rivera Díaz, inauguración " +
      "viernes 14 de agosto 17:00 hrs, Sala Leonidas Emilfork, Lusitania " +
      "68) — mismo instituto, distintas salas internas. El resto: " +
      "seminario académico, Día Abierto PUCV y visita institucional de la " +
      "Bienal de Valparaíso — fuera de alcance. fixedLocation a nivel de " +
      "institución (no de sala individual).",
    addedAt: "2026-08-14",
    fixedLocation: { location: "Viña del Mar", placeName: "Instituto de Arte PUCV" },
  },
  // El resto de la lista la aporta Daniel — una decisión editorial, igual
  // que cada fuente brillante nueva se evaluó una por una. Confirmar
  // pública y activa antes de agregar cada cuenta.
];
