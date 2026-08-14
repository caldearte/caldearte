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
  {
    username: "casavaras",
    note:
      "Aportada por Daniel, 2026-08-14. Casa Varas, centro cultural en " +
      "Antonio Varas 1181, Temuco — buena diversidad geográfica (región " +
      "poco cubierta hasta ahora). 5/15 posts propios evaluados: 2 " +
      "exposiciones reales y completas (\"Restauración Cultural\", hasta " +
      "el 8 de junio; \"Tres Miradas II\", finalistas Premio Arte Joven " +
      "Miradas del Sur) — ambas ya pasadas en este snapshot pero " +
      "confirman programación real y recurrente. El resto: un concierto, " +
      "una presentación de libro de poesía y el Día de los Patrimonios " +
      "(talleres/puertas abiertas) — fuera de alcance. También aparece " +
      "frecuentemente etiquetada por artistas externos con exposiciones " +
      "reales propias en su sala (ej. \"Carne de Cañón\", Rafael Garrido " +
      "Vílchez + Alexis Acuña Papic, 30 julio-9 agosto). fixedLocation.",
    addedAt: "2026-08-14",
    fixedLocation: { location: "Temuco", placeName: "Casa Varas" },
  },
  {
    username: "liquenlab_magallanes",
    note:
      "Aportada por Daniel, 2026-08-14. Casa Líquen, Jorge Montt 781, " +
      "Punta Arenas — región poco cubierta (Magallanes). Contenido " +
      "mayormente documentación de residencias artísticas/procesos " +
      "(recaps, visitas institucionales), no anuncios limpios de " +
      "exposición con fecha, pero incluye una \"Apertura de Proceso\" " +
      "real (residencia ACTO_enelmaritorio, viernes 14 de agosto 18:00 " +
      "hrs) y anuncian Sala Cladonia, su primer espacio expositivo fijo, " +
      "con inauguración próxima en agosto (sin detalles confirmados aún " +
      "al momento de evaluar). fixedLocation — un solo local físico.",
    addedAt: "2026-08-14",
    fixedLocation: { location: "Punta Arenas", placeName: "Casa Líquen" },
  },
  {
    username: "casa_arpa",
    note:
      "Aportada por Daniel, 2026-08-14. Casa Arpa, centro de arte y " +
      "residencias artísticas, Lucrecia Valdés 390, Barrio Yungay, " +
      "Santiago. Cadencia baja e irregular (último post propio real, " +
      "abril 2026; brecha de más de un año antes de eso), pero produce " +
      "eventos reales cuando publica: inauguración de Hugo Leonello " +
      "(artista residente), 24 de abril, en el MAC Quinta Normal — no en " +
      "su propia sala —, y una exposición real en su sala (Lucrecia " +
      "Valdés 390, marzo 2024). Promueve muestras de sus residentes en " +
      "distintas sedes, no un solo local — sin fixedLocation.",
    addedAt: "2026-08-14",
  },
  {
    username: "valpocultura",
    note:
      "Aportada por Daniel, 2026-08-14. Cuenta oficial de cultura de la " +
      "Municipalidad de Valparaíso — cubre TODO el espectro cultural " +
      "(música, literatura, talleres, infraestructura), no solo artes " +
      "visuales, así que el rendimiento de eventos relevantes es bajo " +
      "proporcionalmente. 1 exposición real y completa encontrada: " +
      "\"Prácticas Situadas\" (46° Salón de Estudiantes, Escuela " +
      "Municipal de Bellas Artes), 5 al 21 de agosto, Galería Municipal " +
      "de Arte de Valparaíso, Condell 1550. El resto: Festival de Jazz, " +
      "convocatoria Premio de Literatura, club de lectura infantil, " +
      "convocatoria de cartas de apoyo, renovación de infraestructura — " +
      "todo fuera de alcance. Multi-sede dentro de Valparaíso — sin " +
      "fixedLocation.",
    addedAt: "2026-08-14",
  },
  {
    username: "espaciovilches",
    note:
      "Aportada por Daniel, 2026-08-14. Espacio Vilches, Escuela de Arte " +
      "UC, Campus Oriente UC, Providencia. Densidad alta y cuenta muy " +
      "limpia — 2 inauguraciones reales y completas: \"Apaga la luz\" " +
      "(Florencia de la Maza + Matías Yunge, inauguración 5 de agosto " +
      "18:00 hrs) y \"Los que no fueron once\" (Nicolás Rodríguez, " +
      "inauguración 27 de mayo, hasta el 24 de junio). El resto: cierre " +
      "de un workshop y el Día del Patrimonio del campus — fuera de " +
      "alcance. fixedLocation — un solo local físico.",
    addedAt: "2026-08-14",
    fixedLocation: { location: "Providencia", placeName: "Espacio Vilches" },
  },
  {
    username: "galerialasala",
    note:
      "Aportada por Daniel, 2026-08-14. Galería La Sala, Francisco de " +
      "Aguirre 3720, Vitacura. Densidad alta — 7/8 posts propios " +
      "evaluados son exposiciones reales (\"Memoria de las formas\" + " +
      "\"Tramas: la luz de la Materia\", \"Continuidad\" de Andrés " +
      "Peñaloza y Celina Gálvez, \"Y dos y tres es su nueva contraseña\" " +
      "de Totoy Zamudio, participación en ferias Pinta Lima y Chaco) — " +
      "en tono retrospectivo (\"con éxito se inaugura...\") más que " +
      "anuncio anticipado, pero consistentemente reales. fixedLocation.",
    addedAt: "2026-08-14",
    fixedLocation: { location: "Vitacura", placeName: "Galería La Sala" },
  },
  {
    username: "omagaleriarte",
    note:
      "Aportada por Daniel, 2026-08-14. OMA Galería, en MUT (Apoquindo " +
      "2730). 2/8 posts propios son exposiciones chilenas reales (\"La " +
      "celebración\", grupal; \"Quinto Sector\" de Ruben Einsmann). El " +
      "resto: anuncios de artistas que se suman al portafolio (fuera de " +
      "alcance) y participación en una feria en Córdoba, Argentina " +
      "(fuera de Chile). Dirección ambigua entre Providencia/Las Condes " +
      "— sin fixedLocation, para no forzar mal la ubicación en los posts " +
      "de feria extranjera (el filtro de ubicación chilena ya los " +
      "descarta correctamente por sí solo).",
    addedAt: "2026-08-14",
  },
  {
    username: "artequin",
    note:
      "Aportada por Daniel, 2026-08-14. Museo Artequín, Av. Portales " +
      "3530, Estación Central. Exposición real y con fecha encontrada: " +
      "\"Historias de Papel en China: cortar, plegar y pegar\", abierta " +
      "desde el 10 de junio. El resto: convocatoria de concurso infantil, " +
      "reagendamiento de un evento de adopción de mascotas, taller de " +
      "origami con CMPC — fuera de alcance. fixedLocation.",
    addedAt: "2026-08-14",
    fixedLocation: { location: "Estación Central", placeName: "Museo Artequín" },
  },
  {
    username: "factoriasantarosa",
    note:
      "Aportada por Daniel, 2026-08-14. Factoría Santa Rosa, Barrio " +
      "Franklin, Santiago — mismo espacio ya cubierto como fuente " +
      "brillante vía su sitio web (factoriasantarosa.cl, PR #234); se " +
      "agrega también por Instagram para capturar anuncios que el sitio " +
      "podría no tener a tiempo (el dedup cruzado existente maneja el " +
      "solapamiento). 3/8 posts propios reales: \"Pacheco Altamirano: " +
      "redescubrir a un maestro\" (inauguración) y \"Estudio Abierto\" " +
      "(exposición de artistas residentes, publicada 2 veces). El resto: " +
      "agradecimiento por participación en ArtBo 2025 (Colombia, feria " +
      "ya pasada) — fuera de alcance. fixedLocation.",
    addedAt: "2026-08-14",
    fixedLocation: { location: "Santiago", placeName: "Factoría Santa Rosa" },
  },
  {
    username: "galeriamacchina",
    note:
      "Aportada por Daniel, 2026-08-14. Galería Macchina, Escuela de Arte " +
      "UC, Campus Oriente UC, Providencia (mismo campus que " +
      "espaciovilches, sala distinta). Densidad alta — múltiples " +
      "inauguraciones reales y completas: \"Alterar el trayecto de la " +
      "luz\" (Claudia Casarino, inauguración viernes 14 de agosto 13:30 " +
      "hrs, hasta el 11 de septiembre), \"Ñoqanchis / La Casa del " +
      "Nosotros\" (Francisco Schwember, inaugurada 10 de junio), " +
      "\"Signals Beneath\" (Pedram Baldari + Nooshin Hakim Javadi). El " +
      "resto: un conversatorio con la artista y el Día del Patrimonio " +
      "del campus — fuera de alcance. fixedLocation.",
    addedAt: "2026-08-14",
    fixedLocation: { location: "Providencia", placeName: "Galería Macchina" },
  },
  {
    username: "galeria_gabriela_mistral",
    note:
      "Aportada por Daniel, 2026-08-14. Galería Gabriela Mistral, " +
      "Alameda Libertador Bernardo O'Higgins 1381, Santiago (Metro La " +
      "Moneda). Densidad muy alta — exposición real y completa: " +
      "\"Radiación Ocre: tránsitos con el Sol\" (Natalia Montoya), hasta " +
      "el 29 de agosto, con abundante programación satélite real " +
      "(visitas mediadas, café + conversa, taller de illas con un " +
      "artista aymara) — todas con fecha/hora/lugar completos. " +
      "fixedLocation.",
    addedAt: "2026-08-14",
    fixedLocation: { location: "Santiago", placeName: "Galería Gabriela Mistral" },
  },
  // El resto de la lista la aporta Daniel — una decisión editorial, igual
  // que cada fuente brillante nueva se evaluó una por una. Confirmar
  // pública y activa antes de agregar cada cuenta.
];
