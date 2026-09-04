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
    note:
      "Aportada por Daniel, 2026-08-13. Auditoría de calidad completada " +
      "2026-08-18 (aún no había tenido su primera corrida real — " +
      "cadencia adaptativa de 14 días). No es una galería fija: es el " +
      "nombre de una muestra colectiva itinerante organizada por Activo " +
      "Festival. Confirmado real: \"ATACAMA ARTGALLERY\", 27 de agosto, " +
      "INACAP Sede Iquique / Escuela de Arquitectura UNAP, con 6 " +
      "artistas anunciados progresivamente por @activofest, más un post " +
      "propio anterior real (\"Sueño de Artista\", Iquique). Sin " +
      "fixedLocation — itinerante, vinculada a distintos festivales.",
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
  {
    username: "espacio_o",
    note:
      "Aportada por Daniel, 2026-08-14. Espacio O — misma galería ya " +
      "cubierta vía su sitio web (espacioo.com, plataforma Artlogic, " +
      "PR #237), agregada en su momento sin exposiciones en vivo; se " +
      "agrega también por Instagram, que sí tiene contenido real: " +
      "participación en \"Coleccionismo contemporáneo desde las " +
      "galerías\" (grupal, Museo Ralli, 30 de julio al 5 de septiembre) " +
      "y presencia en la feria Ch.ACO. El resto: anuncios de nuevos " +
      "artistas representados — fuera de alcance. Sin fixedLocation: la " +
      "muestra encontrada ocurre en OTRO museo, no en su sala propia.",
    addedAt: "2026-08-14",
  },
  {
    username: "mssachile",
    note:
      "Aportada por Daniel, 2026-08-14. Museo de la Solidaridad Salvador " +
      "Allende (MSSA), Santiago. Museo público real, muy activo. " +
      "Exposición real y completa: \"América despierta: de la 58ª " +
      "Bienal Internacional de Carnegie al MSSA\", hasta el 16 de " +
      "agosto — documentada en múltiples posts (distintas salas/obras " +
      "de la misma muestra). El resto: taller de bordado Tatreez, " +
      "mantención del huerto del museo, cierre de una exposición " +
      "anterior — fuera de alcance. fixedLocation.",
    addedAt: "2026-08-14",
    fixedLocation: { location: "Santiago", placeName: "MSSA" },
  },
  {
    username: "galerialafuerza",
    note:
      "Evaluada 2026-08-15. LA FUERZA, galería experimental (Florencia " +
      "Izquierdo, Nicolás Oyarce, Isidora Navarrete) — funciona también " +
      "como taller y tienda. Alta densidad real: inauguración de \"DE " +
      "LAS COSAS\" (exposición colectiva, 15 de agosto), \"Ensueños " +
      "que se me aparecen\" de Diego Seye (8-9 de agosto), \"Hasta acá " +
      "llegaba el mar\" (exposición individual, junio) — al menos 3/5 " +
      "posts muestreados genuinamente en alcance, con fechas concretas. " +
      "Sin fixedLocation: no se confirmó la comuna en el texto " +
      "muestreado, queda a inferencia de Haiku por ítem.",
    addedAt: "2026-08-15",
  },
  {
    username: "galeriametropolitana",
    note:
      "Evaluada 2026-08-15. Galería Metropolitana, espacio real y muy " +
      "activo (Barrio Yungay) — pero la muestra de 5 posts recientes " +
      "fue 0/5 en alcance: cursos (\"Mundo de las Artes Visuales\", " +
      "\"Circuitos\"), taller de portafolio, publicaciones de protesta " +
      "(\"NO a los recortes en Cultura\"). Agregada de todos modos " +
      "(instrucción de Daniel, 2026-08-15: institución real y buena " +
      "aunque la densidad actual sea baja — la cadencia adaptativa se " +
      "encarga sola de bajar la frecuencia si sigue sin rendir). Sin " +
      "fixedLocation: no se confirmó dirección exacta en el texto " +
      "muestreado.",
    addedAt: "2026-08-15",
  },
  {
    username: "barcogaleria",
    note:
      "Evaluada 2026-08-15. Barco Galería, espacio real y activo, " +
      "orientado a arquitectura/urbanismo — mayormente charlas y " +
      "conversatorios (\"Arquitecturas de anidación\", ciclo " +
      "\"Imaginarios impresos\"), pero SÍ tiene inauguraciones reales " +
      "(ej. muestra sobre Miguel Lawner, Día de los Patrimonios). 1/5 " +
      "en alcance en la muestra, densidad baja pero institución real. " +
      "Agregada de todos modos (instrucción de Daniel, 2026-08-15, " +
      "misma razón que galeriametropolitana). Sin fixedLocation.",
    addedAt: "2026-08-15",
  },
  {
    username: "veta.ec",
    note:
      "Evaluada 2026-08-15. VETA Espacio Creativo, casona patrimonial, " +
      "activa. Contenido real: performance \"VILO: el peso del " +
      "fragmento\" (20 de agosto, con hora), muestra \"Artefactos " +
      "para un sistema de creencias\" (artistas y curaduría " +
      "nombrados) — ~2-3/5 en alcance, mezclado con contenido más " +
      "musical/audiovisual (un lanzamiento tipo videoclip). Sin " +
      "fixedLocation: no se confirmó dirección exacta en el texto " +
      "muestreado.",
    addedAt: "2026-08-15",
  },
  {
    username: "museociudadano",
    note:
      "Evaluada 2026-08-15. Museo Ciudadano, Estación Central — real y " +
      "muy activo. Buena densidad: cobertura completa de la " +
      "inauguración de \"Convivencias verticales en Estación Central\" " +
      "(post de inauguración + presentación del equipo curatorial), " +
      "más avisos de cierre por feriado. El resto (convocatoria de " +
      "cocreación, \"Museo en Calma\" programa de accesibilidad) " +
      "fuera de alcance. fixedLocation.",
    addedAt: "2026-08-15",
    fixedLocation: { location: "Estación Central", placeName: "Museo Ciudadano" },
  },
  {
    username: "museosaustral",
    note:
      "Evaluada 2026-08-15. Dirección Museológica UACh (red de museos " +
      "de la Universidad Austral, Valdivia) — real, activa, pero " +
      "densidad más débil que museociudadano: solo 1/5 posts " +
      "muestreados fue una exposición real y concreta (\"Fotógrafos " +
      "Pioneros del Sur\", foyer del Teatro Regional Cervantes); el " +
      "resto fue patrimonio general/noticias institucionales y una " +
      "convocatoria de fotografía. Comparte contenido con " +
      "@galeriabarriosbajos (Los Ríos Territorio Visual) — mismo " +
      "ecosistema regional. Agregada igual (institución real con al " +
      "menos una exposición confirmada). Sin fixedLocation: es una red " +
      "de varios museos/salas, no un único lugar fijo.",
    addedAt: "2026-08-15",
  },
  {
    username: "museoandino",
    note:
      "Evaluada 2026-08-15. Museo Andino (Fundación Claro Vial). Señal " +
      "real y concreta: próxima exposición temporal \"Maritorio: " +
      "mundos costeros prehispánicos\" (agosto-diciembre 2026, con " +
      "fechas), anunciada en el muestreo (mismo anuncio repetido 3 " +
      "veces). El resto: evento familiar (Día del Vino, visita " +
      "mediada a la colección permanente) y contenido educativo sobre " +
      "piezas de la colección — fuera de alcance pero no ruido " +
      "problemático. Sin fixedLocation: comuna no confirmada en el " +
      "texto muestreado.",
    addedAt: "2026-08-15",
  },
  // museosdechile: cero posts públicos devueltos por Apify (2026-08-15)
  // — privada, handle equivocado, o cuenta inexistente bajo ese nombre
  // exacto. No agregada; no confundir con la fuente brillante web ya
  // existente museoschile.gob.cl (Red Nacional de Museos) — dominios
  // distintos, no verificado que sean la misma institución.
  //
  // cabpatagonia: evaluada 2026-08-15 — no es una galería de arte
  // visual chilena; contenido de convocatorias de residencias
  // artísticas y textos en francés sobre un programa de investigación
  // arte/ciencia internacional (Suiza/Brasil). No agregada.
  //
  // museodelsonido: evaluada 2026-08-15 — Barrio Yungay, real y activo,
  // pero es un museo de sonido/música, no de arte visual (convocatoria
  // de bienal de música aumentada, concierto de ensamble, restauración
  // de piano) — mismo motivo de rechazo por disciplina que
  // museovioletaparra.cl. No agregada.
  //
  // casaportugal_: agregada 2026-08-15 (borderline, ver historial git),
  // quitada 2026-09-04 — su web (casaportugal.cl) resultó tener el mismo
  // contenido en HTML de texto plano determinístico (sección "Próximos
  // eventos" + página de detalle con fecha/hora de inauguración
  // explícitas), agregada como fuente bright en su lugar
  // (lib/known-sources.ts). La cuenta de IG seguía sin poder capturar
  // los eventos de su "cartelera" mensual tipo afiche (texto superpuesto
  // sobre imágenes de carrusel, invisible para el pipeline de IG, que no
  // lee imágenes) — la web resuelve eso sin necesitar OCR/visión.
  // galeriapacareu: evaluada 2026-08-15 — galería comercial de
  // compraventa de arte (fichas de obras individuales en venta, sin
  // exposiciones con fecha). No agregada.
  {
    username: "museotaller",
    note:
      "Evaluada 2026-08-15. Museo Taller, Puerto Octay (Los Lagos) — " +
      "real y activo, mayormente talleres pagados (autómata, telar, " +
      "talla de cuchara, grabado, coloraria — fuera de alcance). 1/5 " +
      "es una exposición real y con fecha: \"Sempiterno\" de José " +
      "Pérez, disponible hasta fines de septiembre, con venta de " +
      "entradas en museotaller.cl. Agregada igual (institución real, " +
      "mismo criterio que galeriametropolitana/barcogaleria). Su " +
      "sitio web (museotaller.cl) podría valer la pena revisar como " +
      "fuente brillante complementaria — no evaluado todavía. " +
      "fixedLocation.",
    addedAt: "2026-08-15",
    fixedLocation: { location: "Puerto Octay", placeName: "Museo Taller" },
  },
  {
    username: "studio_globo_urbano",
    note:
      "Evaluada 2026-08-18. Colectivo de arte activo, real. 3/6 posts " +
      "propios: \"REFUGIO\" (10 artistas emergentes, 20-30 agosto, " +
      "Galería Condell — anuncio limpio con fecha) + 2 recaps de una " +
      "inauguración real en Tienda Makers (Parque Arauco), confirmada " +
      "de forma independiente por 3 posts de otras cuentas etiquetando " +
      "el mismo evento. Multi-venue (Galería Condell y Tienda Makers) — " +
      "sin fixedLocation, Haiku infiere por post.",
    addedAt: "2026-08-18",
  },
  {
    username: "wall.galeriataller",
    note:
      "Evaluada 2026-08-18. Wall Galería Taller, Talca (Maule) — real y " +
      "activa. 5/6 posts propios: anuncio + 2 recaps de \"Otra forma de " +
      "existir\" (fotografía, Juan Manuel Aguiló, inauguración sábado " +
      "15 de agosto 12:00 hrs — fecha limpia). Confirmado además por " +
      "@kolajmagazine (revista internacional de collage), de forma " +
      "independiente, reseñando una segunda exposición real en el mismo " +
      "lugar (\"Tijeretadas y Encantadas\", Laura Rojbel, hasta el 13 de " +
      "agosto). 1 post de conversación diseño/interiorismo y 1 borde " +
      "comercial (obras de un artista ofrecidas a nuevos espacios) — " +
      "fuera de alcance, no descalifican dada la densidad real. " +
      "fixedLocation.",
    addedAt: "2026-08-18",
    fixedLocation: { location: "Talca", placeName: "Wall Galería Taller" },
  },
  {
    username: "casona_lagoslira",
    note:
      "Evaluada 2026-08-18. Casona Lagos-Lira, Pedro Lagos 396, Santiago — " +
      "espacio real y activo, con densidad fuerte pero atípica: los 6 " +
      "posts de la muestra son de 5 cuentas DISTINTAS (artistas, " +
      "curadores) etiquetando/mencionando el espacio, ninguno del feed " +
      "propio de la casona en esta ventana — probablemente depende de " +
      "sus artistas para difundir. Evidencia real e independiente: " +
      "\"Piedra en el Zapato\" (grupal, Araya/Lobos/Prieto/Rupcich, 24 " +
      "jul-7 ago 2026, confirmada por 3 posts distintos) y \"Todas las " +
      "piedras que he recogido\" (individual, Javiera Clavería, " +
      "inauguración 14 de agosto 19:00 hrs, anuncio + recap). Riesgo " +
      "operacional a vigilar: si el feed propio realmente publica poco, " +
      "el fetch por username podría rendir pocos candidatos nuevos por " +
      "corrida pese al espacio ser real — revisar tras las primeras " +
      "corridas. fixedLocation.",
    addedAt: "2026-08-18",
    fixedLocation: { location: "Santiago", placeName: "Casona Lagos-Lira" },
  },
  {
    username: "colinagaleria",
    note:
      "Evaluada 2026-08-18. Colina Galería, municipal (Colina, Región " +
      "Metropolitana) — real y activa. 4/5 posts propios giran en torno " +
      "a la misma exposición real: \"Animal\" de Camilo Villasmil (Lobo " +
      "Project) — invitación formal de la alcaldesa + Concejo Municipal " +
      "+ Colina Galería a la inauguración, confirmada independientemente " +
      "por Radio Colina, y un recap que confirma \"está actualmente en " +
      "Colina Galería\". fixedLocation.",
    addedAt: "2026-08-18",
    fixedLocation: { location: "Colina", placeName: "Colina Galería" },
  },
  {
    username: "galeriauct",
    note:
      "Evaluada 2026-08-18. Galería de Arte de la Universidad Católica " +
      "de Temuco, Campus Menchaca Lira, Av. Alemania 422, Temuco — real " +
      "y activa. Anuncio limpio de inauguración: \"MURMULLOS\" de Renzo " +
      "Vaccaro Meza, jueves 13 de agosto — confirmado independientemente " +
      "por 2 posts de @uct_vip (con dirección completa) y por el medio " +
      "local @directamedia (agrega fecha de cierre, 16 de septiembre). " +
      "fixedLocation.",
    addedAt: "2026-08-18",
    fixedLocation: { location: "Temuco", placeName: "Galería de Arte UCT" },
  },
  {
    username: "centroamigosdelarte",
    note:
      "Evaluada 2026-08-18. Centro Amigos del Arte, Talca (Maule) — real " +
      "y muy activo. Solo 1/6 posts del feed propio en la muestra (el " +
      "anuncio de inauguración), pero confirmación independiente fuerte: " +
      "\"Dibujando Talca\" de Sergio Sepúlveda Moyano (4 posts del " +
      "artista — inauguración, visitas guiadas de cierre, agradecimiento " +
      "— más entrevista real en Diario Talca) y una segunda exposición " +
      "distinta, \"La forma del silencio\" de @ruido___, con curaduría de " +
      "@editorialrayon y música en vivo. fixedLocation.",
    addedAt: "2026-08-18",
    fixedLocation: { location: "Talca", placeName: "Centro Amigos del Arte" },
  },
  {
    username: "casadelartediegorivera",
    note:
      "Evaluada 2026-08-18. Casa del Arte Diego Rivera, Puerto Montt " +
      "(Los Lagos) — real y activa. El único post propio en la muestra " +
      "es cine, pero evidencia real de exposición vía terceros: ENFOTO " +
      "2026 (12ª edición, Encuentro Regional de Fotografía) — exposición " +
      "colectiva \"Sur Extendido\" (15 fotógrafos), inauguración 14 de " +
      "agosto 19:00 hrs, Sala Hardy Wistuba — confirmado por 3 posts de " +
      "@enfotoloslagos (anuncio + recap de la inauguración). " +
      "fixedLocation.",
    addedAt: "2026-08-18",
    fixedLocation: { location: "Puerto Montt", placeName: "Casa del Arte Diego Rivera" },
  },
  {
    username: "loica_arte",
    note:
      "Evaluada 2026-08-18. Galería Loica, Valparaíso — real. 4 posts " +
      "propios documentan la misma exposición real: \"Plan DeLito\" " +
      "(litografía colectiva, 13 artistas), inauguración 27 de febrero " +
      "19:00 hrs — anuncio, mediación y recap, confirmados de forma " +
      "independiente por una de las artistas (@andreabeizart). Última " +
      "publicación propia vista es de abril — actividad reciente más " +
      "espaciada, no muerta. fixedLocation.",
    addedAt: "2026-08-18",
    fixedLocation: { location: "Valparaíso", placeName: "Galería Loica" },
  },
  {
    username: "valparaisocasaarte",
    note:
      "Evaluada 2026-08-18. Casa Arte, Blanco 366, Valparaíso (Barrio " +
      "Puerto) — real y activa. Anuncio limpio de inauguración: " +
      "\"Grandes experiencias + In-material-les\" del artista Pato " +
      "Munita Rebolledo. Resto del contenido de la muestra es sobre " +
      "VALP-HORROR (feria literaria/temática de terror en el mismo " +
      "espacio) — fuera de alcance, no descalifica dada la exposición " +
      "real confirmada. fixedLocation.",
    addedAt: "2026-08-18",
    fixedLocation: { location: "Valparaíso", placeName: "Casa Arte" },
  },
  {
    username: "fundacioncultural561",
    note:
      "Evaluada 2026-08-18. Fundación Cultural 561, Emilio Vaisse 561, " +
      "Ovalle (Coquimbo) — real y activa. 2 anuncios limpios propios: " +
      "lanzamiento de la fundación + inauguración de \"La Descarga\" " +
      "(viernes 26 de junio 19:00 hrs) y \"Oskar Huerta — De pie junto a " +
      "las ruinas\" (jueves 2 de julio 19:00 hrs). Confirmado de forma " +
      "independiente y sólida por @ovalle_cultura (Corporación Cultural " +
      "Municipal de Ovalle, 4 posts) sobre una segunda exposición real, " +
      "\"Superficie en disputa\" (Galería Homero Martínez Salas). " +
      "fixedLocation.",
    addedAt: "2026-08-18",
    fixedLocation: { location: "Ovalle", placeName: "Fundación Cultural 561" },
  },
  {
    username: "colectivofotografasfronterizas",
    note:
      "Evaluada 2026-08-24, encontrada al probar Apify's hashtag-scraper " +
      "para #artesantiago (real handle es \"colectivofotografasfronterizas\" " +
      "— \"colectivofronterizas\" a secas no existe en Instagram). Colectivo " +
      "de fotógrafas del sur de Chile (Temuco, Araucanía), fundado 2015 — " +
      "real y activo, organiza el festival Wallmapu FOTO (Fondart " +
      "Regional). Anuncio propio limpio del 29 de julio 2026 (\"Exponen: " +
      "Cec...\"), y aparece tageada frecuentemente por @wallmapu_foto, " +
      "@panoramastemuco, @stgofotoferia — activa en el circuito regional. " +
      "Cubre una brecha geográfica real (sur de Chile, poco representado " +
      "frente a Santiago). Sin fixedLocation deliberadamente: es un " +
      "colectivo que expone en distintos espacios, no un local fijo — " +
      "Haiku infiere ubicación por post, igual que @ilposto.cl.",
    addedAt: "2026-08-24",
  },
  {
    username: "museobaburizza",
    note:
      "Evaluada 2026-08-24. Museo Baburizza (Museo Municipal de Bellas " +
      "Artes de Valparaíso), en el histórico Palacio Baburizza — alberga " +
      "una de las 4 colecciones de pintura europea/chilena más " +
      "importantes de Chile. 30.711 seguidores, activa a diario (varios " +
      "posts por día), tageada por @biav_valpo (Bienal Internacional de " +
      "Artes de Valparaíso) confirmando que es un nodo activo del " +
      "circuito de arte de Valparaíso. Local fijo confirmado. " +
      "fixedLocation.",
    addedAt: "2026-08-24",
    fixedLocation: { location: "Valparaíso", placeName: "Museo Baburizza" },
  },
  {
    username: "agac.cl",
    note:
      "Evaluada 2026-08-24. AGAC Chile, Asociación gremial de galerías de " +
      "arte contemporáneo de Chile — no es un venue único, agrupa varias " +
      "galerías miembro. Rendimiento esperado moderado: sus posts propios " +
      "tienden a ser institucionales (ej. contenido educativo sobre el " +
      "mercado del arte), no anuncios de exposición puntuales — la señal " +
      "de exhibición real viene sobre todo de sus reposts/tags de " +
      "galerías miembro (Museo Ralli Santiago, Galería Artespacio, " +
      "Galería Espacio O — esta última ya es fuente propia, redundancia " +
      "esperada ahí). Cubre galerías que hoy no tenemos individualmente " +
      "(Ralli Santiago, Artespacio). Sin fixedLocation — no es un venue.",
    addedAt: "2026-08-24",
  },
  {
    username: "galeria1712",
    note:
      "Evaluada 2026-08-24. Galería 1712, Garibaldi 1712, Ñuñoa — dirigida " +
      "por Francisco Cintolesi y Oscar Zenteno (25 años de trayectoria " +
      "como galerista). Calendario fijo confirmado: apertura mensual, " +
      "primer sábado de cada mes — coincide con la cadencia real " +
      "observada (posts cada 2-4 semanas, consistente). Highlights con " +
      "nombres de muestras pasadas (RLF, Matute#3, Pantano, Ejercicios) " +
      "confirman que documentan cada exposición individualmente. Local " +
      "fijo confirmado.",
    addedAt: "2026-08-24",
    fixedLocation: { location: "Ñuñoa", placeName: "Galería 1712" },
  },
  {
    username: "espacio_londres",
    note:
      "Evaluada 2026-08-24. Lab. Cultural Espacio Londres, en el histórico " +
      "Barrio París-Londres, Santiago — 57.060 seguidores, muy activa " +
      "(posts cada 2-3 días). Espacio cultural multi-propósito, no una " +
      "galería pura: highlights son \"Mercado\" (feria de artesanía, " +
      "@mercadoparislondres, tageada seguido), \"Barrio\" (patrimonio), " +
      "\"Restauración\" (restauración del edificio) y \"Galería\" — este " +
      "último confirma programación de exposiciones real, pero mezclada " +
      "con contenido de mercado/patrimonio urbano fuera de alcance. " +
      "Rendimiento esperado moderado, mismo perfil que @agac.cl. Local " +
      "fijo confirmado (Londres 55, Santiago — edificio patrimonial de " +
      "1925; primer piso dedicado a exposiciones de arte, segundo piso a " +
      "talleres/charlas), a diferencia de @agac.cl que no es un venue.",
    addedAt: "2026-08-24",
    fixedLocation: { location: "Santiago", placeName: "Espacio Londres" },
  },
  {
    username: "fundacionjoseventurelli",
    note:
      "Evaluada 2026-08-24. Fundación José Venturelli, dedicada a " +
      "preservar y difundir la obra del muralista chileno José " +
      "Venturelli (creada por su hija Paz, curador Christian Leyssen " +
      "desde 2013) — real, con actividad curatorial genuina (proyectos " +
      "de exhibición, educativos y editoriales), 5982 seguidores, muy " +
      "activa (varios reels/semana). Sin local fijo: sus muestras se " +
      "montan en distintos venues (GAM, Museo de la Memoria, Espacio " +
      "Matta, MNBA, Centro Cultural La Moneda — este ya es fuente " +
      "propia) — Haiku infiere ubicación por post, igual que " +
      "@ilposto.cl. Contenido mixto: bastantes reels de tono " +
      "educativo/conmemorativo (Año Nuevo Chino, vínculo cultural " +
      "Chile-China) mezclado con lo curatorial. Rendimiento esperado " +
      "moderado.",
    addedAt: "2026-08-24",
  },
  {
    username: "culturaprovidencia",
    note:
      "Evaluada 2026-08-24. Fundación Cultural Providencia, cuenta " +
      "oficial de la Municipalidad de Providencia — 129.969 seguidores, " +
      "activísima (varios posts diarios). Sede en el Palacio Schacht (Av. " +
      "Nueva Providencia 1995 esq. Pedro de Valdivia), con 5 salas de " +
      "exposición dedicadas (una de 100m² + tres de 40m² + una en el " +
      "auditorio) mostrando pintura, escultura, fotografía, cerámica, " +
      "textil — programación de arte visual real y sustancial, mismo " +
      "calibre que @museobaburizza. Contenido mixto: también cubre " +
      "teatro (Teatro Oriente Providencia) y danza tradicional del mismo " +
      "centro cultural, explícitamente fuera de alcance por política — " +
      "el filtro de disciplina de Haiku debe encargarse de eso. Local " +
      "fijo confirmado.",
    addedAt: "2026-08-24",
    fixedLocation: { location: "Providencia", placeName: "Fundación Cultural Providencia (Palacio Schacht)" },
  },
  {
    username: "collectio_collectio",
    note:
      "Evaluada 2026-08-24. Collectio (\"Mirar toma tiempo\"), Nueva " +
      "Costanera 3445, Vitacura (Local 13) — martes a viernes 11-19hrs, " +
      "también sábados. 12.582 seguidores, cadencia altísima (posts cada " +
      "1-3 días). Highlights con nombres reales de artistas/muestras (H " +
      "Mardones, Magdalena Rojas, \"Ser todo eso\", Minerasophia, " +
      "\"Senderos\") — densidad de contenido real de exposición alta. " +
      "Algo de ruido esperado (curso presencial visto en un post). No se " +
      "cruza con ninguna fuente ya tracked. Local fijo confirmado.",
    addedAt: "2026-08-24",
    fixedLocation: { location: "Vitacura", placeName: "Collectio" },
  },
  {
    username: "galerianemesioantunez",
    note:
      "Evaluada 2026-08-24. Galería Nemesio Antúnez, galería de la UMCE " +
      "(Universidad Metropolitana de Ciencias de la Educación), Av. José " +
      "Pedro Alessandri 774, Ñuñoa — funcionando desde 1990, martes a " +
      "viernes 10:00-18:00hrs. 1536 seguidores, cadencia más espaciada " +
      "(posts propios cada ~3-4 semanas), pero highlights con nombres de " +
      "muestras reales (De trazos, Diálogos, Obsolescencia, Creativas, " +
      "Cortafuegos) confirman actividad expositiva genuina. No se cruza " +
      "con ninguna fuente ya tracked. Local fijo confirmado.",
    addedAt: "2026-08-24",
    fixedLocation: { location: "Ñuñoa", placeName: "Galería Nemesio Antúnez" },
  },
  {
    username: "gallerypluscl",
    note:
      "Evaluada 2026-08-24. Gallery +, galería de arte contemporáneo — " +
      "chica y nueva (942 seguidores, bio menciona \"2026\"), sin " +
      "dirección propia en la bio, pero Daniel confirmó Monjitas 397, " +
      "Santiago directamente. Posts con buena frecuencia (~cada 1-2 " +
      "semanas desde junio 2026). No se cruza con ninguna fuente ya " +
      "tracked.",
    addedAt: "2026-08-24",
    fixedLocation: { location: "Santiago", placeName: "Gallery +" },
  },
  {
    username: "museo.arteallimite",
    note:
      "Evaluada 2026-08-24. Museo Arte Al Límite, Lo Blanco, Panquehue, V " +
      "Región (Valparaíso) — martes a sábado 10-18hrs. 4889 seguidores, " +
      "vinculado a la revista/marca \"Arte al Límite\" " +
      "(arteallimite.com, no tracked como fuente web). La grilla del " +
      "perfil mezcla posts propios con reposts de la cuenta madre " +
      "@arteallimite y relacionadas, pero Apify solo trae posts con " +
      "ownerUsername exacto \"museo.arteallimite\" — esos reposts no " +
      "entran. Local fijo confirmado.",
    addedAt: "2026-08-24",
    fixedLocation: { location: "Panquehue", placeName: "Museo Arte Al Límite" },
  },
  {
    username: "museopalaciovergara",
    note:
      "Evaluada 2026-08-24. Museo Palacio Vergara, dentro del Parque " +
      "Quinta Vergara, Viña del Mar (Errázuriz 563/596) — martes a " +
      "domingo 10:00-17:30hrs, entrada liberada. 33.164 seguidores, muy " +
      "activa (posts cada 2-4 días). Highlights con categorías reales de " +
      "museo (Exposiciones, Obras, Montajes, Esculturas, Restauración), " +
      "mezclado con algo de contenido de talleres/actividades infantiles " +
      "— ruido esperado normal. Local fijo confirmado.",
    addedAt: "2026-08-24",
    fixedLocation: { location: "Viña del Mar", placeName: "Museo Palacio Vergara" },
  },
  {
    username: "bnchile",
    note:
      "Evaluada 2026-08-24. Biblioteca Nacional de Chile — real, enorme " +
      "(103.281 seguidores, varias publicaciones diarias), pero " +
      "primariamente institución literaria/patrimonial, no un espacio de " +
      "arte visual dedicado (highlights: Aniversario 213, 25 años RAV, " +
      "La Proclama — radio, concursos de fotos; cuentas relacionadas " +
      "sugeridas por Instagram son literarias — Café Literario de Ñuñoa, " +
      "Editorial Catalonia). Rendimiento esperado bajo-moderado, con " +
      "redundancia parcial: ya sabemos por @museoschile (Red Nacional de " +
      "Museos, fuente web) que la Biblioteca Nacional monta exposiciones " +
      "de arte visual reales ocasionalmente (\"Roberto Matta. Abrir la " +
      "mirada\" fue una). fixedLocation.",
    addedAt: "2026-08-24",
    fixedLocation: { location: "Santiago", placeName: "Biblioteca Nacional de Chile" },
  },
  {
    username: "bellasartesvina",
    note:
      "Evaluada 2026-08-24. Escuela de Bellas Artes de Viña del Mar " +
      "(Municipalidad de Viña del Mar), ubicada dentro del Museo Palacio " +
      "Vergara (mismo edificio que @museopalaciovergara, ya fuente propia) " +
      "— 13.700 seguidores. Comparación directa de grillas: contenido " +
      "distinto al del museo (exposición de fotografía en blanco y negro " +
      "propia de la escuela, \"Día Mundial de la Fotografía\"), programa " +
      "expositivo propio y separado del museo pese a compartir edificio — " +
      "no redundante. fixedLocation.",
    addedAt: "2026-08-24",
    fixedLocation: { location: "Viña del Mar", placeName: "Museo Palacio Vergara" },
  },
  {
    username: "galeriaemergentelab",
    note:
      "Evaluada 2026-08-24. Galería Emergente Lab — 793 seguidores, sin " +
      "bio, dirección ni sitio web confirmables (búsqueda web tampoco " +
      "encontró la dirección). Grilla con contenido real de exposición: " +
      "inauguración con visitantes junto a un retrato al carboncillo de " +
      "gran formato, reunión de público en la sala. Sin fixedLocation: no " +
      "se pudo confirmar un local fijo — Haiku infiere por post, igual " +
      "que @ilposto.cl.",
    addedAt: "2026-08-24",
  },
  {
    username: "galerianac",
    note:
      "Evaluada 2026-08-24. Galería NAC (Andreu Jander Sagredo), Av. " +
      "Américo Vespucio Norte 2878, Vitacura — fundada 2015, real y " +
      "establecida, 29.300 seguidores, horario propio (L-V 10:30-19:00, " +
      "S 11:30-14:00), sitio web propio (galerianac.cl). Confirmada en " +
      "AGAC y ARTEinformado con exposiciones recientes reales " +
      "(\"Triángulo de agua\", \"Materia\", nov 2025). Highlights " +
      "(Exposiciones, Eventos, Artistas, Ferias) confirman programa " +
      "expositivo recurrente. fixedLocation.",
    addedAt: "2026-08-24",
    fixedLocation: { location: "Vitacura", placeName: "Galería NAC" },
  },
  {
    username: "rojo_galeria",
    note:
      "Evaluada 2026-08-24. Rojo Galería, edificio patrimonial de 1887, " +
      "Cerro Alegre, Valparaíso — fundada 2012, real, 11.900 seguidores, " +
      "horario propio (L-S 10-18, D 10-17:30), sitio web propio " +
      "(rojogaleria.com). Grilla con contenido real de exposición " +
      "(muestra colectiva con público, obras en pared). Algunos " +
      "highlights comerciales (\"Descuentos\", \"Envíos/shipping\") — " +
      "ruido esperado, no descalifica. fixedLocation.",
    addedAt: "2026-08-24",
    fixedLocation: { location: "Valparaíso", placeName: "Rojo Galería" },
  },
  {
    username: "saladeartemercado",
    note:
      "Evaluada 2026-08-24. Sala de Arte Mercado, Municipalidad de " +
      "Chillán — espacio expositivo dedicado en el segundo piso del " +
      "Mercado Municipal de Chillán (Maipón 773), inaugurada 2019. 3.795 " +
      "seguidores. Highlights con nombres de artistas individuales " +
      "(Oscar Meneses, Mecha, Marisol) confirman programa expositivo " +
      "real y recurrente, más un póster de evento real próximo " +
      "(\"IN-SITU\", 5-6 de septiembre). Buena diversidad geográfica " +
      "(Ñuble, región poco cubierta). fixedLocation.",
    addedAt: "2026-08-24",
    fixedLocation: { location: "Chillán", placeName: "Sala de Arte Mercado" },
  },
  {
    username: "museoartesdecorativas",
    note:
      "Evaluada 2026-08-24. Museo de Artes Decorativas (MAD), Avda. " +
      "Recoleta 683 — museo público real (artdec.gob.cl), 26.500 " +
      "seguidores, horario propio (M-V 10-17, S 10-14). Highlight " +
      "\"Exposiciones\" explícito y póster real de exhibición visible en " +
      "grilla (\"Cristurno de tierra\"). Ruido esperado normal (talleres, " +
      "huerta, mediación). fixedLocation corregido 2026-08-25 (auditoría " +
      "de curación): la dirección real está en la comuna Recoleta, no " +
      "Santiago (error original al agregar la fuente) — confirmado que " +
      "esta comuna existe en la tabla `regions`.",
    addedAt: "2026-08-24",
    fixedLocation: { location: "Recoleta", placeName: "Museo de Artes Decorativas" },
  },
  {
    username: "laescalagaleria",
    note:
      "Evaluada 2026-08-24. La Escala Galería, Cochrane 553, Barrio " +
      "Puerto, Valparaíso — real, confirmada por visita de la Ministra " +
      "de las Culturas (anuncio del Pase Cultural). 12.600 seguidores, " +
      "horario propio (L-S 11-18), sitio web propio (laescala.cl). " +
      "Highlight \"Exposiciones\" explícito y póster real de exhibición " +
      "visible en grilla (\"NEW EXPO\", 26 de agosto). Algo de framing " +
      "comercial (venta de obras, envíos) — ruido esperado, no " +
      "descalifica. fixedLocation.",
    addedAt: "2026-08-24",
    fixedLocation: { location: "Valparaíso", placeName: "La Escala Galería" },
  },
  {
    username: "komespaciocreacion",
    note:
      "Evaluada 2026-08-24. Espacio KOM, Manuel Montt 966 dpto 302, " +
      "Temuco — \"Creación y cultura contemporánea\", real, 5.870 " +
      "seguidores. Contenido orientado a apertura de proceso de " +
      "residencias, formación y conversatorios más que anuncios limpios " +
      "de exposición — mismo perfil que @liquenlab_magallanes, donde " +
      "\"Apertura de Proceso\" se aceptó como en alcance. Ruido esperado " +
      "de talleres/charlas. fixedLocation.",
    addedAt: "2026-08-24",
    fixedLocation: { location: "Temuco", placeName: "Espacio KOM" },
  },
  {
    username: "galeria.artespacio",
    note:
      "Evaluada 2026-08-24. Galería Artespacio, Alonso de Córdova 2600, " +
      "Vitacura — fundada 1995, real y establecida (\"30 años\"), 38.400 " +
      "seguidores, horario propio (L-V 10-19, S 11-14), sitio web propio " +
      "(artespacio.cl). Ya mencionada indirectamente en la nota de " +
      "@agac.cl como galería miembro sin tracking propio; se agrega " +
      "directamente. Contenido real reciente: XI Concurso Artespacio " +
      "Joven 2026, participación en feria Ch.ACO, obra abstracta/" +
      "geométrica visible en grilla. fixedLocation.",
    addedAt: "2026-08-24",
    fixedLocation: { location: "Vitacura", placeName: "Galería Artespacio" },
  },
  {
    username: "antennaorg",
    note:
      "Evaluada 2026-08-24. Fundación Antenna, fundación sin fines de " +
      "lucro real (11 años), 36.400 seguidores, antenna.cl — promueve " +
      "artes visuales vía programas de socios y visitas guiadas. No es " +
      "un venue fijo: sus muestras se montan en distintos espacios " +
      "(ej. \"SEÑAL\" en Galería CIMA, otra galería). Credibilidad real " +
      "(alianza con BTG Pactual, cobertura de prensa real). Sin " +
      "fixedLocation — Haiku infiere por post, igual que @ilposto.cl.",
    addedAt: "2026-08-24",
  },
  {
    username: "desarmientogaleria",
    note:
      "Evaluada 2026-08-24. De Sarmiento Galería, Darío Urzúa 2130, " +
      "Providencia — galería de arte contemporáneo, director Nicolás de " +
      "Sarmiento, cuenta verificada. 1.841 seguidores. Múltiples " +
      "highlights, cada uno con nombre de exposición real (Amén " +
      "Madonna, Cuerpos Velados, Entreacto 02, Armadura Sensible, Cielo " +
      "Glitter) — programa expositivo real y activo, más participación " +
      "confirmada en la feria Art Stgo 2026. fixedLocation.",
    addedAt: "2026-08-24",
    fixedLocation: { location: "Providencia", placeName: "De Sarmiento Galería" },
  },
  {
    username: "museoprecolombino",
    note:
      "Evaluada 2026-08-24. Museo Chileno de Arte Precolombino, Bandera " +
      "361, Santiago (Palacio de la Real Aduana) — museo real y " +
      "prestigioso, 144.000 seguidores, horario propio (M-D 10-18). " +
      "Highlight \"CARTELERA\" confirma programación de exposiciones " +
      "temporales real, junto con contenido educativo/talleres (ruido " +
      "esperado). Confirmado por Daniel: colección precolombina " +
      "(cerámica, textil, orfebrería) cuenta como arte visual en " +
      "alcance. fixedLocation.",
    addedAt: "2026-08-24",
    fixedLocation: { location: "Santiago", placeName: "Museo Chileno de Arte Precolombino" },
  },
  {
    username: "saladeobra",
    note:
      "Evaluada 2026-08-24. Sala de Obra, Tucapel 482, Local 94, " +
      "Concepción — sala de exposiciones del Colegio de Arquitectos " +
      "Concepción (@coarqconce). 3.219 seguidores, horario propio " +
      "(L-V 14:30-19:00). Cartelera mensual muy limpia (highlights " +
      "Marzo a Agosto), primer post de grilla \"CARTELERA Sala de Obra " +
      "Agosto\" con artista nombrado. Buena diversidad geográfica " +
      "(Concepción/Biobío, no cubierta hasta ahora). fixedLocation.",
    addedAt: "2026-08-24",
    fixedLocation: { location: "Concepción", placeName: "Sala de Obra" },
  },
  {
    username: "arrayan_espacio",
    note:
      "Evaluada 2026-08-24. Arrayán Espacio, Barrio Brasil, Santiago — " +
      "\"Lugar dedicado a la fotografía y las artes visuales\", un " +
      "espacio de @cafe.arrayan. 1.341 seguidores. Highlight " +
      "\"Exposiciones\" explícito, póster real de exhibición con " +
      "artistas nombrados (Neis Alarcón, Loin y Cecilia, Felipe " +
      "Elgueta, Matías López). Anexo a un café, pero programa " +
      "expositivo dedicado y real. fixedLocation.",
    addedAt: "2026-08-24",
    fixedLocation: { location: "Santiago", placeName: "Arrayán Espacio" },
  },
  {
    username: "mapamuseo",
    note:
      "Evaluada 2026-08-25. Museo de Arte Popular Americano (MAPA), " +
      "Universidad de Chile (Facultad de Artes) — real y establecido " +
      "desde 2010, entrada gratuita, 28.500 seguidores. Su sede propia " +
      "(según uchile.cl) está en GAM, Santiago, pero un post real " +
      "confirmado (\"Prácticas de Encuentro\", 27 de agosto) ubica la " +
      "inauguración en OTRA sede universitaria — MAPA Plataforma " +
      "Cultural Universidad de Chile, Av. Grecia 3401, Ñuñoa — mismo " +
      "patrón que arte_uah/ilposto.cl: promueve actividades en sedes de " +
      "terceros, no un solo local propio. Sin fixedLocation deliberado — " +
      "Haiku infiere ubicación por post.",
    addedAt: "2026-08-25",
  },
  {
    username: "tallerlautaro",
    note:
      "Evaluada 2026-08-25. Taller Lautaro, Lautaro 737, Providencia — " +
      "estudio de serigrafía/grabado/fotografía análoga y espacio de " +
      "exposición. 3.722 seguidores. Póster real de exhibición muy " +
      "limpio visible en grilla: \"El incesante rumiar de una paloma\" " +
      "(Agustín Cuevas / Javier Leiva), inauguración jueves 3 de " +
      "septiembre 19:00 hrs, hasta el 13 de septiembre 2026, dirección " +
      "completa incluida. Ruido esperado de talleres/clases (bio " +
      "menciona \"Clases-Tutorías\"). fixedLocation.",
    addedAt: "2026-08-25",
    fixedLocation: { location: "Providencia", placeName: "Taller Lautaro" },
  },
  {
    username: "laratonera_ed",
    note:
      "Evaluada 2026-08-25. La Ratonera Ediciones, editorial " +
      "independiente de fotolibros/fanzines, Región del Biobío. 1.842 " +
      "seguidores. Contenido real de exposición visible en grilla " +
      "(\"MAL DE OJO — Exposición de autores...\", vinculado a FEFCO, " +
      "festival de fotolibros), mezclado con open calls/workshops " +
      "(\"Últimos días para postular\") fuera de alcance. Perfil de " +
      "festival/editorial itinerante, no un local fijo — sin " +
      "fixedLocation, mismo patrón que @ilposto.cl.",
    addedAt: "2026-08-25",
  },
  {
    username: "ko_panqui",
    note:
      "Evaluada 2026-08-25. Espacio Arte Ko-Panqui, Camino a Panqui Km " +
      "5.6, Curarrehue, Región de la Araucanía — centro de residencias " +
      "artísticas y exposiciones multidisciplinarias, real y " +
      "establecido (celebrando 10 años en 2026, cubierto varias veces " +
      "por el Ministerio de las Culturas). 8.167 seguidores, sitio web " +
      "propio (espacioartekopanqui.cl). Conexión con artistas reales " +
      "(Clarita Yañez, hija de Juan Emar; residencia dirigida por Luis " +
      "Poirot). Ruido esperado (conciertos, talleres, travesías). Buena " +
      "diversidad geográfica. fixedLocation.",
    addedAt: "2026-08-25",
    fixedLocation: { location: "Curarrehue", placeName: "Espacio Arte Ko-Panqui" },
  },
  {
    username: "galeria.biophiliaceramicas",
    note:
      "Evaluada 2026-08-25. Galería Biophilia, especializada en cerámica " +
      "contemporánea, dentro de GAM (Centro Gabriela Mistral, Alameda " +
      "227, Santiago). 8.608 seguidores. Highlight \"Inauguraciónes\" " +
      "explícito, participación confirmada en una exposición en Berlín " +
      "(fuera de Chile, no relevante para curación pero confirma galería " +
      "real). Ruido esperado de clases. fixedLocation.",
    addedAt: "2026-08-25",
    fixedLocation: { location: "Santiago", placeName: "Galería Biophilia" },
  },
  {
    username: "lacaracola_galeria",
    note:
      "Evaluada 2026-08-25. Galeria La Caracola, Copiapó 119, Puerto " +
      "Montt — Pedagogía en Artes Visuales, Universidad de Los Lagos. " +
      "1.932 seguidores. Highlights con cadencia mensual real (\"expos " +
      "mayo\", \"Expos Agosto\") y múltiples muestras nombradas " +
      "(SECUENCIAS TEMPO, PIECES OF PUERTO, Floración Ósea) — programa " +
      "expositivo real y activo. Buena diversidad geográfica (Puerto " +
      "Montt/Los Lagos). fixedLocation.",
    addedAt: "2026-08-25",
    fixedLocation: { location: "Puerto Montt", placeName: "Galeria La Caracola" },
  },
  {
    username: "salagabrielasabatini",
    note:
      "Evaluada 2026-08-25. Sala Gabriela Sabatini — galería real y " +
      "activa (2.230 seguidores, 157 posts). Highlights con múltiples " +
      "títulos de exposición reales y variados (MOBYDICK, Piso " +
      "Flotante, La Cuarta Pata) y grilla con fotos genuinas de obra/" +
      "exhibición. Sin dirección confirmable (bio vacía, sin resultados " +
      "en búsqueda web). Sin fixedLocation — Haiku infiere por post, " +
      "igual que @ilposto.cl.",
    addedAt: "2026-08-25",
  },
  {
    username: "espaciolacochera",
    note:
      "Evaluada 2026-08-25. Espacio La Cochera, Huérfanos 2567, Barrio " +
      "Yungay, Santiago — dirección confirmada directamente en un " +
      "póster real de la grilla. Espacio cultural real y bien " +
      "establecido, 5.325 seguidores, sitio web propio " +
      "(espaciolacochera.cl). Highlights con cadencia anual real " +
      "(\"Expos_2026\" a \"Expos_2022\", 5 años de programa expositivo). " +
      "fixedLocation.",
    addedAt: "2026-08-25",
    fixedLocation: { location: "Santiago", placeName: "Espacio La Cochera" },
  },
  {
    username: "biav_valpo",
    note:
      "Evaluada 2026-08-26. Bienal Internacional de Artes de Valparaíso " +
      "(BIAV), cuenta oficial real — 4.729 seguidores. Encontrada tras " +
      "una auditoría real: su contenido solo aparecía etiquetado en la " +
      "grilla de @museobaburizza (una de sus sedes), nunca capturado " +
      "directamente porque el fetch por username solo trae posts con " +
      "ownerUsername exacto. Póster real confirmado (\"XIII Bienal " +
      "Internacional de Artes de Valparaíso\"); una convocatoria de " +
      "postulación de esta misma XIII edición ya había sido rechazada " +
      "correctamente antes (fuera de alcance por tipo). Itinerante — " +
      "múltiples sedes (Baburizza, Instituto de Arte PUCV, otras) — sin " +
      "fixedLocation, Haiku infiere por post.",
    addedAt: "2026-08-26",
  },
  {
    username: "espacio_218",
    note:
      "Evaluada 2026-08-26. Espacio 218, Compañía de Jesús 960, depto " +
      "218, Portal Fernández Concha, Santiago Centro — real y " +
      "establecido desde 2022 (cubierto por Artishock), 19.800 " +
      "seguidores. Participa como galería expositora en ferias " +
      "internacionales reales (arteBA, ARCOLisboa) — confirma calidad, " +
      "no indica que sea extranjero. fixedLocation.",
    addedAt: "2026-08-26",
    fixedLocation: { location: "Santiago", placeName: "Espacio 218" },
  },
  {
    username: "linia_gallery",
    note:
      "Evaluada 2026-08-26. LINIA Galería, Huérfanos 3044, Santiago — " +
      "espacio híbrido \"galería, café & boutique\". 1.112 seguidores. " +
      "Contenido real de exposición visible en grilla (obra en pared, " +
      "póster de exposición \"Escapismo\"). Comercial-leaning dado el " +
      "café/boutique, pero programa expositivo confirmado. " +
      "fixedLocation.",
    addedAt: "2026-08-26",
    fixedLocation: { location: "Santiago", placeName: "LINIA Galería" },
  },
  {
    username: "mavichile",
    note:
      "MAVI UC (Museo de Artes Visuales, Universidad Católica), Santiago " +
      "— museo real y prominente, 71,4 mil seguidores. Encontrada " +
      "navegando el feed real de @caldearte.oficial: un post de un " +
      "artista (felipe_lobos) mencionaba \"Registro en MAVI UC. Mención " +
      "honrosa en Premio Arte Joven 2026\" — llevó a confirmar que MAVI " +
      "UC no estaba cubierto. No confundir con @museomavi (\"Museo en " +
      "Artes Virtuales\", espacio distinto de realidad virtual, 632 " +
      "seguidores) — nombre similar, institución diferente.",
    addedAt: "2026-08-26",
    fixedLocation: { location: "Santiago", placeName: "MAVI UC" },
  },
  {
    username: "artequinvina",
    note:
      "Museo Artequín Viña del Mar — museo educativo de arte para niños, " +
      "26,4 mil seguidores. Encontrada navegando el feed real de " +
      "@caldearte.oficial (sugerencia algorítmica). Sede única, distinta " +
      "del Museo Artequín de Estación Central (@artequin) ya cubierto — " +
      "misma marca, dos museos físicos independientes.",
    addedAt: "2026-08-27",
    fixedLocation: { location: "Viña del Mar", placeName: "Museo Artequín Viña del Mar" },
  },
  {
    username: "huechurabacultura",
    note:
      "Departamento de Cultura Huechuraba, cuenta municipal, 11,2 mil " +
      "seguidores. Encontrada navegando el feed real de " +
      "@caldearte.oficial: post real de la exposición \"Transmisión " +
      "Análoga\" (artistas Ricardo Pizarro y Billy Noise). Contenido " +
      "mixto (talleres, eventos comunitarios, cultura) — mismo patrón " +
      "que otras cuentas municipales ya agregadas; Haiku filtra lo que " +
      "no es exposición visual real. Bio (\"que el arte... llegue a cada " +
      "rincón de Huechuraba\") no confirma un venue único — sin " +
      "fixedLocation, Haiku infiere por post.",
    addedAt: "2026-08-27",
  },
  {
    username: "galeriatallerespacioa",
    note:
      "Espacio A, galería-taller de arte real, Francisco Bulnes Correa " +
      "1406, Las Condes (San Carlos de Apoquindo) — espacioa.cl, 10 años " +
      "activa, 1.464 seguidores. Encontrada navegando el feed real de " +
      "@caldearte.oficial: un escultor agradeció haber expuesto ahí por " +
      "primera vez. Highlight propio \"Exposiciones\" confirma programa " +
      "expositivo real (además de clases/talleres, que Haiku filtra). " +
      "fixedLocation.",
    addedAt: "2026-08-27",
    fixedLocation: { location: "Las Condes", placeName: "Espacio A" },
  },
  {
    username: "museoaraucania",
    note:
      "Museo Regional Araucanía, Avda. Alemania 084, Temuco — museo " +
      "público real, 13,3 mil seguidores. Encontrada navegando el feed " +
      "real de @caldearte.oficial. Contenido mixto (historia regional, " +
      "etnografía mapuche, además de arte) — mismo patrón que " +
      "mhnv.gob.cl; sin filtro de disciplina por código en el pipeline " +
      "de Instagram, Haiku descarta lo que no sea exposición visual real. " +
      "fixedLocation.",
    addedAt: "2026-08-27",
    fixedLocation: { location: "Temuco", placeName: "Museo Regional Araucanía" },
  },
  {
    username: "casadelaculturalimache",
    note:
      "Casa de la Cultura y Escuela Municipal de Bellas Artes de " +
      "Limache — 2.560 seguidores. Encontrada navegando el feed real de " +
      "@caldearte.oficial: post real \"Mes de las Artes Visuales\" " +
      "(exposición + concurso). Cuenta municipal, contenido mixto " +
      "(también \"Mes de la Danza\") — Haiku filtra lo que no sea " +
      "artes visuales. fixedLocation.",
    addedAt: "2026-08-27",
    fixedLocation: { location: "Limache", placeName: "Casa de la Cultura de Limache" },
  },
  {
    username: "ccgabrielamistral",
    note:
      "Centro Cultural Gabriela Mistral de Villa Alemana — 19,2 mil " +
      "seguidores. Encontrada navegando el feed real de " +
      "@caldearte.oficial: post real de la exposición \"Solostalgia\" " +
      "(Daniela Lara Espinoza), dirección y fechas confirmadas (Santiago " +
      "674, Villa Alemana). Highlight propio \"Expos\" confirma programa " +
      "expositivo real; contenido mixto (patrimonio, cine, literatura, " +
      "teatro) — Haiku filtra lo que no corresponda. fixedLocation.",
    addedAt: "2026-08-27",
    fixedLocation: { location: "Villa Alemana", placeName: "Centro Cultural Gabriela Mistral" },
  },
  {
    username: "bienalartesmediales",
    note:
      "Bienal Artes Mediales de Santiago — proyecto de la Corporación " +
      "Chilena de Video, 30 años de trayectoria, 17,6 mil seguidores, " +
      "cuenta verificada. Bienal real y prominente de artes " +
      "mediales/nuevos medios. Encontrada buscando \"galería arte " +
      "Santiago\" en Instagram. Itinerante — múltiples sedes por " +
      "edición, sin fixedLocation.",
    addedAt: "2026-08-27",
  },
  {
    username: "safa_stgo",
    note:
      "SAFA - Santiago Festival de las Artes, \"la primera semana del " +
      "arte en Santiago\" (6-11 octubre 2026) — 1.883 seguidores, real " +
      "y próximo. Encontrada buscando \"galería arte Santiago\" en " +
      "Instagram. Festival/semana con múltiples sedes — sin " +
      "fixedLocation.",
    addedAt: "2026-08-27",
  },
  {
    username: "vac.valparaiso",
    note:
      "VAC — Red de Galerías de Arte Contemporáneo en Valparaíso, 2.313 " +
      "seguidores. Agrupa galerías reales (Worm, El Farol, Parque " +
      "Cultural, Sala Galia, Bahía Utópica). Encontrada buscando " +
      "\"galería arte Valparaíso\" en Instagram. Red itinerante — sin " +
      "fixedLocation.",
    addedAt: "2026-08-27",
  },
  {
    username: "laescalagaleria",
    note:
      "La Escala Galería, Valparaíso — arte emergente, venta de obras " +
      "originales, 12,6 mil seguidores, highlight propio " +
      "\"Exposiciones\". Encontrada buscando \"galería arte Valparaíso\" " +
      "en Instagram. fixedLocation.",
    addedAt: "2026-08-27",
    fixedLocation: { location: "Valparaíso", placeName: "La Escala Galería" },
  },
  {
    username: "valpocultura",
    note:
      "Dirección de Desarrollo Cultural, Municipio de Valparaíso — " +
      "64,7 mil seguidores. Cuenta municipal, contenido mixto (música, " +
      "danza, familia) — Haiku filtra lo que no sea artes visuales. " +
      "Encontrada buscando \"galería arte Valparaíso\" en Instagram. " +
      "Sin fixedLocation (múltiples sedes municipales).",
    addedAt: "2026-08-27",
  },
  {
    username: "estampa_valparaiso",
    note:
      "Estampa Valparaíso — colectivo de grabadores de la región de " +
      "Valparaíso (creado 2019), académicos y talleristas, 3.047 " +
      "seguidores, con exposiciones reales confirmadas (ej. MUG). " +
      "Encontrada buscando \"galería arte Valparaíso\" en Instagram. " +
      "Colectivo itinerante — sin fixedLocation.",
    addedAt: "2026-08-27",
  },
  {
    username: "valparaisoprofundo",
    note:
      "Valparaíso Profundo — centro cultural real (teatro, biblioteca, " +
      "galería, cafetería) en los Ex Baños del Almendro, 22,6 mil " +
      "seguidores, incluye \"Feria M.A\" de arte. Encontrada buscando " +
      "\"galería arte Valparaíso\" en Instagram. fixedLocation.",
    addedAt: "2026-08-27",
    fixedLocation: { location: "Valparaíso", placeName: "Valparaíso Profundo (Ex Baños del Almendro)" },
  },
  {
    username: "bienalconcepcion",
    note:
      "Bienal Concepción Arte & Ciencia — bienal real, itinerante " +
      "(itinerancia confirmada en la Pinacoteca), 2.490 seguidores. " +
      "Encontrada buscando \"galería arte Concepción\" en Instagram. " +
      "Sin fixedLocation (itinerante).",
    addedAt: "2026-08-27",
  },
  {
    username: "concepcioncultural",
    note:
      "Concepción Cultural — Dirección de Cultura de la Municipalidad " +
      "de Concepción, 53,4 mil seguidores. Cuenta municipal, contenido " +
      "mixto — Haiku filtra lo que no sea artes visuales. Encontrada " +
      "buscando \"galería arte Concepción\" en Instagram. Sin " +
      "fixedLocation (múltiples sedes municipales: CAC, OCCC, BBJ, C3).",
    addedAt: "2026-08-27",
  },
  {
    username: "baj_antofagasta",
    note:
      "Balmaceda Arte Joven Antofagasta, Arturo Prat #712, 4to piso — " +
      "6.290 seguidores, highlight propio \"Galería\". Encontrada " +
      "buscando \"galería arte Antofagasta\" en Instagram. " +
      "fixedLocation.",
    addedAt: "2026-08-27",
    fixedLocation: { location: "Antofagasta", placeName: "Balmaceda Arte Joven Antofagasta" },
  },
  {
    username: "salaexposicionesuct",
    note:
      "Sala Exposiciones UC Temuco, Universidad Católica de Temuco — " +
      "espacio expositivo dedicado real, 1.352 seguidores, horario " +
      "propio (10 a 18 h). Encontrada buscando \"galería arte Temuco\" " +
      "en Instagram. fixedLocation.",
    addedAt: "2026-08-27",
    fixedLocation: { location: "Temuco", placeName: "Sala Exposiciones UC Temuco" },
  },
  {
    username: "galeria.basgmarine",
    note:
      "Galería de Arte Náutico, Angelmó 1878, Puerto Montt — 1.258 " +
      "seguidores, \"Exhibiciones rotativas\", highlight propio " +
      "\"Inauguraciones\". Encontrada buscando \"galería arte Puerto " +
      "Montt\" en Instagram. fixedLocation.",
    addedAt: "2026-08-27",
    fixedLocation: { location: "Puerto Montt", placeName: "Galería de Arte Náutico" },
  },
  {
    username: "casadelaculturarancagua",
    note:
      "Casa de la Cultura Rancagua — 21,5 mil seguidores, highlight " +
      "propio \"EXPOSICIONES\" (además de talleres). Encontrada " +
      "buscando \"galería arte Rancagua\" en Instagram. fixedLocation.",
    addedAt: "2026-08-27",
    fixedLocation: { location: "Rancagua", placeName: "Casa de la Cultura Rancagua" },
  },
  {
    username: "casaculturaiquique",
    note:
      "Casa Municipal de la Cultura de Iquique — 7.064 seguidores, " +
      "\"espacio para la creación, el encuentro y la divulgación de la " +
      "cultura y las artes\", en el casco histórico. Encontrada " +
      "buscando \"galería arte Iquique\" en Instagram. fixedLocation.",
    addedAt: "2026-08-27",
    fixedLocation: { location: "Iquique", placeName: "Casa Municipal de la Cultura de Iquique" },
  },
  {
    username: "culturacopiapo.cl",
    note:
      "Cultura, Turismo y Patrimonio, Copiapó — cuenta municipal, " +
      "10,4 mil seguidores, bio menciona \"música, teatro, arte y " +
      "patrimonio\" explícitamente. Encontrada buscando \"galería arte " +
      "Copiapó\" en Instagram. Contenido mixto — Haiku filtra lo que " +
      "no sea artes visuales. Sin fixedLocation.",
    addedAt: "2026-08-27",
  },
  {
    username: "museograficachillan",
    note:
      "Museo de la Gráfica de Chillán — \"museo internacional de la " +
      "gráfica\", institución de la Dirección de Cultura, Artes y " +
      "Patrimonio, 5.517 seguidores, sitio propio " +
      "(museodelagrafica.cl). Museo dedicado a artes visuales. " +
      "Encontrada buscando \"galería arte Chillán\" en Instagram. " +
      "fixedLocation.",
    addedAt: "2026-08-27",
    fixedLocation: { location: "Chillán", placeName: "Museo de la Gráfica de Chillán" },
  },
  {
    username: "museoohigginianotalca",
    note:
      "Museo O'Higginiano y de Bellas Artes de Talca — 11,3 mil " +
      "seguidores, horario propio. Parte de la Red Nacional de Museos " +
      "(museoschile.gob.cl, ya cubierta vía sitio web) pero su cuenta " +
      "de Instagram aporta contenido propio adicional — mismo patrón " +
      "que museoaraucania. Encontrada buscando \"galería arte Talca\" " +
      "en Instagram. fixedLocation.",
    addedAt: "2026-08-27",
    fixedLocation: { location: "Talca", placeName: "Museo O'Higginiano y de Bellas Artes de Talca" },
  },
  {
    username: "culturacoyhaique",
    note:
      "Corporación Cultural Municipal de Coyhaique — 25 mil seguidores, " +
      "\"impulsando la creatividad, el saber y las artes desde 1996\". " +
      "Contenido mixto (cartelera, microcine, talleres) — Haiku filtra " +
      "lo que no sea artes visuales. Encontrada buscando \"galería " +
      "arte Coyhaique\" en Instagram. Sin fixedLocation.",
    addedAt: "2026-08-27",
  },
  {
    username: "culturalcurico",
    note:
      "Corporación Cultural Curicó — 22,7 mil seguidores, \"acceso " +
      "igualitario a la cultura y las artes\". Contenido mixto " +
      "(talleres, catastros) — Haiku filtra lo que no sea artes " +
      "visuales. Encontrada buscando \"galería arte Curicó\" en " +
      "Instagram. Sin fixedLocation.",
    addedAt: "2026-08-27",
  },
  {
    username: "bellasartesquillota",
    note:
      "Academia Municipal de Bellas Artes de Quillota — 47 años de " +
      "formación artística, 2.310 seguidores. Encontrada buscando " +
      "\"galería arte Quillota\" en Instagram. Sin fixedLocation.",
    addedAt: "2026-08-27",
  },
  {
    username: "centroculturalquillota",
    note:
      "Centro Cultural Leopoldo Silva Reynoard — Dirección de Cultura " +
      "de la Municipalidad de Quillota, 21,1 mil seguidores. " +
      "Encontrada buscando \"galería arte Quillota\" en Instagram. " +
      "fixedLocation.",
    addedAt: "2026-08-27",
    fixedLocation: { location: "Quillota", placeName: "Centro Cultural Leopoldo Silva Reynoard" },
  },
  {
    username: "mamchiloe",
    note:
      "Museo de Arte Moderno Chiloé — \"Centro activo de Arte " +
      "contemporáneo\", 15,3 mil seguidores. Inauguración real " +
      "confirmada (\"Muestra Regional\", 22 de agosto de 2026). " +
      "Encontrada buscando \"galería arte Castro Chiloé\" en " +
      "Instagram. Comuna exacta no verificada con certeza (sitio " +
      "mamchiloe.cl no accesible al evaluar) — sin fixedLocation " +
      "deliberado, Haiku infiere por post.",
    addedAt: "2026-08-27",
  },
  {
    username: "centroculturalvillarricaliquen",
    note:
      "Liquen, Centro Cultural Municipal de Villarrica — 25,5 mil " +
      "seguidores, bio explícita \"Exposiciones 🖼️\" (además de " +
      "conciertos, danza, teatro, talleres, cine — Haiku filtra lo " +
      "que no sea artes visuales), highlight propio \"Expo Thiare\". " +
      "Encontrada buscando \"galería arte Villarrica\" en Instagram. " +
      "fixedLocation.",
    addedAt: "2026-08-27",
    fixedLocation: { location: "Villarrica", placeName: "Liquen, Centro Cultural Municipal de Villarrica" },
  },
  {
    username: "mac_valdivia",
    note:
      "MAC Valdivia — Museo de Arte Contemporáneo, Universidad Austral " +
      "de Chile — 3.951 seguidores, highlight propio \"Exposiciones\". " +
      "Encontrada buscando \"galería arte Valdivia\" en Instagram. " +
      "fixedLocation.",
    addedAt: "2026-08-27",
    fixedLocation: { location: "Valdivia", placeName: "MAC Valdivia (Museo de Arte Contemporáneo)" },
  },
  {
    username: "casadelaculturapuertovaras",
    note:
      "Casa de la Cultura Puerto Varas — Municipalidad de Puerto " +
      "Varas, 11,3 mil seguidores, bio \"Cultura, Arte y Patrimonio\". " +
      "Encontrada buscando \"cultura Puerto Varas\" en Instagram. " +
      "fixedLocation.",
    addedAt: "2026-08-27",
    fixedLocation: { location: "Puerto Varas", placeName: "Casa de la Cultura Puerto Varas" },
  },
  {
    username: "culturaancud",
    note:
      "Corporación Cultural Municipal de Ancud — 10,6 mil seguidores, " +
      "bio \"Arte, cultura y patrimonio de Chiloé\". Encontrada " +
      "buscando \"corporacion cultural Arica\" en Instagram (la " +
      "búsqueda ignoró \"Arica\" y devolvió resultados de otras " +
      "comunas). Sin fixedLocation.",
    addedAt: "2026-08-27",
  },
  {
    username: "culturamunisanfelipe",
    note:
      "Oficina de Cultura San Felipe — Av. O'Higgins 651, 6.383 " +
      "seguidores, cuenta municipal (patrimonio, talleres, catastro). " +
      "Encontrada buscando \"cultura San Felipe\" en Instagram. " +
      "Contenido mixto — Haiku filtra lo que no sea artes visuales. " +
      "Sin fixedLocation.",
    addedAt: "2026-08-27",
  },
  {
    username: "culturasanbernardo",
    note:
      "Cultura y Turismo San Bernardo — cuenta municipal, 17,6 mil " +
      "seguidores, bio \"guiados, eventos, exposiciones y talleres\". " +
      "Encontrada buscando \"cultura San Bernardo\" en Instagram. Sin " +
      "fixedLocation.",
    addedAt: "2026-08-27",
  },
  {
    username: "cultura_puentealto",
    note:
      "Corporación Municipal de Cultura de Puente Alto — 76,4 mil " +
      "seguidores, cuenta oficial de una de las comunas más pobladas " +
      "de Chile. Encontrada buscando \"cultura Puente Alto\" en " +
      "Instagram. Contenido mixto — Haiku filtra lo que no sea artes " +
      "visuales. Sin fixedLocation.",
    addedAt: "2026-08-27",
  },
  {
    username: "maipu_cultura",
    note:
      "Departamento de Cultura de la Municipalidad de Maipú — 43 mil " +
      "seguidores, bio \"potenciar las artes, las culturas y el " +
      "patrimonio\". Encontrada buscando \"cultura Maipú\" en " +
      "Instagram. Contenido mixto — Haiku filtra lo que no sea artes " +
      "visuales. Sin fixedLocation.",
    addedAt: "2026-08-27",
  },
  {
    username: "culturanunoa",
    note:
      "Corporación Cultural de Ñuñoa — 102 mil seguidores, \"oferta " +
      "cultural y artística diversa y plural\". Encontrada buscando " +
      "\"galería arte Ñuñoa\" en Instagram. Contenido mixto (cine, " +
      "talleres) — Haiku filtra lo que no sea artes visuales. Sin " +
      "fixedLocation.",
    addedAt: "2026-08-27",
  },
  {
    username: "chimkowecentro",
    note:
      "Corporación Cultural de Peñalolén (Centro Chimkowe) — 47,7 mil " +
      "seguidores, highlight propio \"EXPO\". Encontrada buscando " +
      "\"cultura Peñalolén\" en Instagram. Sin fixedLocation.",
    addedAt: "2026-08-27",
  },
  {
    username: "culturalestacioncentral",
    note:
      "Corporación Cultural Estación Central — 17 mil seguidores, " +
      "Nicasio Retamales 95, bio \"promoviendo y difundiendo las " +
      "culturas, las artes y los patrimonios\". Encontrada buscando " +
      "\"cultura Estación Central\" en Instagram. fixedLocation.",
    addedAt: "2026-08-27",
    fixedLocation: { location: "Estación Central", placeName: "Corporación Cultural Estación Central" },
  },
  {
    username: "vitacuracultura",
    note:
      "Corporación Cultural Vitacura — desde 1996, 65,6 mil " +
      "seguidores, highlight propio \"Artes visuales\". Encontrada " +
      "buscando \"galería arte contemporáneo Vitacura\" en Instagram. " +
      "Sin fixedLocation (múltiples sedes, incluye @lomattacultural).",
    addedAt: "2026-08-27",
  },
  {
    username: "lomattacultural",
    note:
      "Lo Matta Cultural — espacio cultural real, Monumento Nacional, " +
      "59,5 mil seguidores, highlight propio \"Artes visuales\". " +
      "Vinculado a Corporación Cultural Vitacura. Encontrada buscando " +
      "\"galería arte contemporáneo Vitacura\" en Instagram. " +
      "fixedLocation.",
    addedAt: "2026-08-27",
    fixedLocation: { location: "Vitacura", placeName: "Lo Matta Cultural" },
  },
  {
    username: "corporacionculturallb",
    note:
      "Corporación Cultural de Lo Barnechea — 30,9 mil seguidores, " +
      "\"experiencias culturales significativas\", cartelera activa. " +
      "Encontrada buscando \"cultura Lo Barnechea\" en Instagram. " +
      "Contenido mixto — Haiku filtra lo que no sea artes visuales. " +
      "Sin fixedLocation.",
    addedAt: "2026-08-27",
  },
  {
    username: "centrocultural_losandes",
    note:
      "Centro Cultural de Los Andes — Municipalidad de Los Andes, " +
      "10,1 mil seguidores, \"acciones artísticas culturales y " +
      "patrimoniales\". Encontrada buscando \"cultura Los Andes\" en " +
      "Instagram. Contenido mixto (festival, talleres, conciertos) — " +
      "Haiku filtra lo que no sea artes visuales. Sin fixedLocation.",
    addedAt: "2026-08-27",
  },
  {
    username: "lacasona.centrodeartes",
    note:
      "La Casona Cultural de Viña del Mar — \"Centro de Artes " +
      "Visuales independiente\", Errázuriz 626, Viña del Mar. 5.486 " +
      "seguidores. Encontrada vía un post real de estampa_valparaiso " +
      "(exposición individual de la grabadora @ineacerebi, curatoría " +
      "@anto_auda_grabadora, 26-27 agosto 2026). fixedLocation.",
    addedAt: "2026-08-27",
    fixedLocation: { location: "Viña del Mar", placeName: "La Casona Cultural de Viña del Mar" },
  },
  {
    username: "calamacultural",
    note:
      "Corporación de Cultura y Turismo Calama — 31,3 mil seguidores, " +
      "\"generación de espacios y promoción del arte y la cultura\". " +
      "Encontrada buscando \"cultura Calama\" en Instagram. Contenido " +
      "mixto — Haiku filtra lo que no sea artes visuales. Sin " +
      "fixedLocation.",
    addedAt: "2026-08-27",
  },
  {
    username: "centroculturalrojasmagallanes",
    note:
      "CC Rojas Magallanes — 18,7 mil seguidores, bio \"Arte y cultura " +
      "en el territorio\". Encontrada buscando \"cultura Magallanes\" " +
      "en Instagram. Contenido mixto (fuerte en música/bandas/talleres) " +
      "— Haiku filtra lo que no sea artes visuales. Sin fixedLocation.",
    addedAt: "2026-08-27",
  },
  {
    username: "cultura_angol",
    note:
      "Centro Cultural Angol — 7.063 seguidores, bio \"Donde el arte se " +
      "vive y la cultura nos une\", highlight propio \"Artes\". " +
      "Encontrada buscando \"cultura Angol\" en Instagram. Contenido " +
      "mixto (conciertos, música, cine, teatro) — Haiku filtra lo que " +
      "no sea artes visuales. Sin fixedLocation.",
    addedAt: "2026-08-27",
  },
  {
    username: "culturapuconmunicipal",
    note:
      "Coordinación de Cultura Municipal de Pucón, Casa de la Cultura — " +
      "Caupolicán #210, 6.733 seguidores, highlight propio \"Artistas " +
      "locales\". Encontrada buscando \"cultura Pucón\" en Instagram. " +
      "fixedLocation.",
    addedAt: "2026-08-27",
    fixedLocation: { location: "Pucón", placeName: "Casa de la Cultura de Pucón" },
  },
  {
    username: "pinacoteca_udec",
    note:
      "Encontrada revisando el feed de @caldearte.oficial, 2026-08-28. " +
      "Cuenta oficial de la Casa del Arte José Clemente Orozco, " +
      "Universidad de Concepción — 12,6 mil seguidores, muy activa (1000 " +
      "publicaciones). Redundancia parcial con la fuente web ya existente " +
      "(noticias.udec.cl, categoría Cultura, cubre 3 sedes de la UdeC " +
      "incluida la Casa del Arte) — se agrega igual porque IG suele " +
      "publicar la inauguración antes que el portal de noticias. Densidad " +
      "real en la muestra (7 posts): 2 exposiciones reales y completas " +
      "(\"Entre libros e imágenes: 100 años Bibliotecas UdeC\", inaugurada " +
      "27 de agosto; \"Ciudades (no) blandas\" de Leonardo Portus, misma " +
      "fecha) más un taller reagendado, cobertura de prensa de un evento " +
      "infantil y visitas guiadas — fuera de alcance. fixedLocation.",
    addedAt: "2026-08-28",
    fixedLocation: { location: "Concepción", placeName: "Pinacoteca Universidad de Concepción" },
  },
  {
    username: "cultura.unab",
    note:
      "Encontrada revisando el feed de @caldearte.oficial, 2026-08-28. " +
      "Dirección de Extensión Cultural, Universidad Andrés Bello — 28,2 " +
      "mil seguidores, muy activa (4029 publicaciones). Cubre TODO el " +
      "espectro cultural (música, teatro, danza, escritura, además de " +
      "artes visuales) — rendimiento esperado moderado, mismo perfil que " +
      "@agac.cl/@espacio_londres. 2 exposiciones reales y completas en la " +
      "muestra de 9 posts: \"Humanidad\" de Clara Murillo (fotografía, " +
      "inauguración 8 de septiembre, R14 UNAB Campus República) y " +
      "\"Retratos de Andrés Bello a través del Arte y la Inteligencia " +
      "Artificial\" (Teatro Municipal de Coinco, hasta el 30 de " +
      "septiembre) — el resto: curso online, concierto, obra de danza, " +
      "música folclórica — fuera de alcance. Sin fixedLocation: organiza " +
      "eventos en distintas sedes propias y de terceros (Campus " +
      "República, Coinco, Maipú), no un solo local — Haiku infiere " +
      "ubicación por post, igual que @ilposto.cl.",
    addedAt: "2026-08-28",
  },
  {
    username: "espaciocultural.lamerced",
    note:
      "Encontrada revisando el feed de @caldearte.oficial, 2026-08-28. " +
      "Espacio Cultural La Merced, Corporación de la Cultura y las Artes " +
      "de la Ilustre Municipalidad de Rancagua — Cuevas 399, Rancagua " +
      "(región de O'Higgins, poco cubierta hasta ahora), parte de la red " +
      "@redmuseosoh. 8.505 seguidores, muy activa (1681 publicaciones), " +
      "highlight propio \"EXPOSICIONES\". Densidad real alta en la " +
      "muestra (9 posts): al menos 2 exposiciones reales y completas con " +
      "fecha/hora/artista (\"El nombre de mis calles\" de Blanca Frisius " +
      "Siniavschi, figuras en lana tejida, 8-30 sept, inauguración " +
      "martes 8 sept 12:00 hrs; \"Cibermemoria\" de Jonas Coloma, joyería " +
      "artística, 11-29 agosto) — el resto: talleres, festival de canto, " +
      "acto cívico de bienvenida a septiembre — fuera de alcance. " +
      "fixedLocation.",
    addedAt: "2026-08-28",
    fixedLocation: { location: "Rancagua", placeName: "Espacio Cultural La Merced" },
  },
  {
    username: "taller_99",
    note:
      "Encontrada revisando el feed de @caldearte.oficial, 2026-08-28 " +
      "(vía @isabelcauas, quien invitaba a su inauguración). Corporación " +
      "Cultural Taller 99 de Grabado, Nemesio Antúnez — Zañartu 1016, " +
      "Providencia, Santiago; taller de grabado histórico chileno " +
      "(celebrando 70 años), con salas propias (\"Sala Museográfica\") " +
      "y highlights dedicados \"Galería\"/\"Exposiciones\". 15,8 mil " +
      "seguidores, muy activa (1432 publicaciones). Densidad muy alta y " +
      "limpia en la muestra visible: al menos 3 exposiciones reales y " +
      "completas con fecha/hora/lugar (\"Vilches Fundamental\", " +
      "inauguración sábado 29 de agosto 12:00 hrs, Zañartu 1016; " +
      "\"Grabados/Antigrabados: 70 años del Taller 99\", 11 de agosto " +
      "12:00 hrs, Sala Ercilla de la Biblioteca Nacional — sede externa; " +
      "\"Planta Viva\", memorial de grabado). Sin fixedLocation " +
      "deliberadamente: fixedLocation es incondicional (ver PR #294), y " +
      "esta cuenta sí publica eventos reales en sedes externas (la " +
      "Biblioteca Nacional en el ejemplo de arriba) — forzar Providencia " +
      "los ubicaría mal. Haiku infiere la ubicación por post, igual que " +
      "@ilposto.cl/@mamchiloe.",
    addedAt: "2026-08-28",
  },
  {
    username: "mhnchile",
    note:
      "Encontrada revisando el feed de @caldearte.oficial, 2026-08-28. " +
      "Museo Histórico Nacional de Chile — 116 mil seguidores, muy " +
      "activa (7292 publicaciones). Rendimiento esperado bajo, mismo " +
      "perfil que @bnchile: primariamente contenido de colecciones/" +
      "archivo histórico (fotos de bodas de época, útiles escolares " +
      "antiguos, \"Zoom de Colecciones\") en vez de anuncios de " +
      "exposición puntuales — solo 1/6 posts muestreados en la grilla " +
      "es una exposición real y completa: \"La vida en una mirada. " +
      "Fernando Opazo\" (fotógrafo documentalista chileno del siglo XX, " +
      "curaduría de Carla Franceschini, desde el 31 de agosto, Sala " +
      "Patrimonial del MHN en la estación de Metro Plaza de Armas — " +
      "parte de su programa institucional \"Mes de la Fotografía\"). " +
      "Sin fixedLocation: el museo tiene su sede principal pero también " +
      "monta exposiciones en la sala patrimonial de Metro Plaza de " +
      "Armas — Haiku infiere ubicación por post.",
    addedAt: "2026-08-28",
  },
  {
    username: "salaanacortesumce",
    note:
      "Encontrada revisando el feed de @caldearte.oficial, 2026-08-28. " +
      "Sala de Artes Visuales Ana Cortés — sala de exposición y " +
      "laboratorio de artes del Dpto. de Artes Visuales de la UMCE " +
      "(Ex Pedagógico), distinta de @galerianemesioantunez (misma " +
      "universidad, sala distinta, ya fuente propia) — 776 seguidores, " +
      "activa (222 publicaciones). Contenido real de exposición " +
      "confirmado: inauguración de \"Malditas\" (Javier Rodríguez Pino, " +
      "en Matucana 100 — ver nota aparte) y repost de \"Pupilas: " +
      "memorias escolares a la vista\" (Galería Nemesio Antúnez, ya " +
      "cubierta). Algo de solapamiento esperado con esa otra fuente al " +
      "ser reposts, pero también cubre eventos propios/de terceros que " +
      "esa no. Sin fixedLocation: publica sobre eventos en su propia " +
      "sala y en sedes de terceros (Matucana 100 en el ejemplo visto) — " +
      "Haiku infiere ubicación por post.",
    addedAt: "2026-08-28",
  },
  {
    username: "culturallascondes",
    note:
      "Encontrada revisando el feed de @caldearte.oficial, 2026-08-28 " +
      "(vía @isabelcauas anunciando su propia exposición ahí). " +
      "Corporación Cultural Las Condes — 103 mil seguidores, muy activa " +
      "(4087 publicaciones), agrupa varias sedes propias " +
      "(@centrolosdominicos, @muilascondes, entre otras). Cubre TODO el " +
      "espectro cultural (festival de cine, música familiar, feria de " +
      "anticuarios) además de artes visuales — rendimiento esperado " +
      "moderado, mismo perfil que @agac.cl. Exposiciones reales " +
      "confirmadas en la muestra: \"Warmi - Warmi: Diálogo de Manos y " +
      "Color\" (textil) y \"CEIBA\", descrita como \"la exposición del " +
      "primer museo inmersivo de Chile\". Sin fixedLocation: agrupa " +
      "varias sedes propias distintas — Haiku infiere ubicación por " +
      "post, igual que @agac.cl.",
    addedAt: "2026-08-28",
  },
  {
    username: "matucana100",
    note:
      "Encontrada revisando el feed de @caldearte.oficial, 2026-08-28 " +
      "(vía @salaanacortesumce, que reposteaba una inauguración ahí) — " +
      "uno de los centros culturales más grandes de Santiago, 245 mil " +
      "seguidores, muy activo (7664 publicaciones), 25 años de " +
      "trayectoria. Se evaluó primero agregar su sitio web (m100.cl) en " +
      "vez de Instagram, pero su página \"Esta semana en M100\" " +
      "(m100.cl/esta-semana-en-m100) depende de un widget de calendario " +
      "(plugin EventON) que no renderiza en HTML plano — habría que " +
      "integrar contra ese plugin en vez de un simple fetch/parse, más " +
      "trabajo del que amerita esta evaluación; queda como IG en su " +
      "lugar. Cubre TODO el espectro cultural (teatro, danza, cine, " +
      "música, talleres, artes visuales) — rendimiento esperado bajo, " +
      "solo 1/12 posts muestreados en la grilla es una exposición real: " +
      "\"La Ola\" de Patricio Vogel (artista visual real, vogelscl), " +
      "sábado 29 de agosto 12:00 hrs, en su propia \"Galería Artes " +
      "Visuales\" — sede interna dedicada exclusivamente a exposiciones, " +
      "consistentemente etiquetada #ArtesVisuales en sus posts, lo que " +
      "puede ayudar a Haiku a distinguir esta señal del resto del ruido " +
      "multi-disciplina. Sin fixedLocation: aunque tiene dirección fija " +
      "(Av. Matucana 100, Estación Central), el volumen de contenido " +
      "fuera de alcance hace preferible que Haiku seleccione por texto " +
      "del post en vez de asumir ubicación — mismo criterio que " +
      "@agac.cl.",
    addedAt: "2026-08-28",
  },
  {
    username: "muarse",
    note:
      "Encontrada 2026-08-28 buscando \"museo la serena\" en Instagram, " +
      "como parte de una búsqueda deliberada de comunas sin cobertura " +
      "(región de Coquimbo no tenía ninguna fuente hasta ahora). Museo " +
      "Arqueológico de La Serena, desde 1943 — 7806 seguidores, activo " +
      "(214 publicaciones). Rendimiento esperado bajo: primariamente " +
      "colección permanente/patrimonio arqueológico (mismo perfil que " +
      "@bnchile/@mhnchile), pero exposición real y significativa " +
      "confirmada: \"Huellas del Cobre\" (orfebrería y joyería en cobre " +
      "hechas por personas privadas de libertad del Centro Penitenciario " +
      "Huachalalume, proyecto Fondart Regional 2026). fixedLocation.",
    addedAt: "2026-08-28",
    fixedLocation: { location: "La Serena", placeName: "Museo Arqueológico de La Serena" },
  },
  {
    username: "espaciosculturalesarica",
    note:
      "Encontrada 2026-08-28 buscando \"cultura arica\" en Instagram, " +
      "búsqueda deliberada de comunas sin cobertura — Arica solo tenía " +
      "una fuente (@casaculturalyanulaque) hasta ahora. Corporación Red " +
      "de Espacios Culturales de la Región de Arica y Parinacota — red " +
      "que agrupa varios espacios miembro (Centro mb2, Patios " +
      "Culturales, Espacio Argandoña, GalpónJiwasa, Casa Cultural " +
      "Yanulaque entre otros, ver sus propios highlights), 3525 " +
      "seguidores, muy activa (972 publicaciones), mismo perfil de red " +
      "que @agac.cl. Exposición real y significativa confirmada: " +
      "\"Confluencias II\" — 70 artistas, 115 obras, más de 1000 " +
      "visitantes, muestra colectiva de creación visual regional. Sin " +
      "fixedLocation — es una red de varios espacios, no un venue único.",
    addedAt: "2026-08-28",
  },
  {
    username: "ccm_la",
    note:
      "Encontrada 2026-08-28 buscando \"cultura los angeles\" en " +
      "Instagram, búsqueda deliberada de comunas sin cobertura (Los " +
      "Ángeles, Biobío, no tenía ninguna fuente). Corporación Cultural " +
      "Municipal de Los Ángeles — 20,2 mil seguidores, muy activa (4492 " +
      "publicaciones), con highlight y escuela propia \"Escuela de Artes " +
      "Visuales\". Exposición real y completa confirmada: \"Enfocar la " +
      "memoria\" (fotografía, investigación Fondart Nacional sobre el " +
      "acervo de Jorge Aravena Llanca + obra de Rafael Herrera + " +
      "participación fotográfica comunitaria), inauguración miércoles 5 " +
      "de agosto 19:00 hrs, Centro Cultural de Los Ángeles, Lautaro 463. " +
      "fixedLocation.",
    addedAt: "2026-08-28",
    fixedLocation: { location: "Los Ángeles", placeName: "Centro Cultural de Los Ángeles" },
  },
  {
    username: "ccserhumano",
    note:
      "Aportada por Daniel, 2026-08-30 (siguiendo un post real de " +
      "inauguración que había visto en su feed). Centro Cultural Ser " +
      "Humano, Copiapó — 9.653 seguidores, activa. Exposición real y " +
      "completa confirmada: \"Ecosistema Textil\" de la artista local " +
      "Andrea Rivera (bordado/arpilleras), inauguración martes 1 de " +
      "septiembre 19:00 hrs, Chacabuco 671, Copiapó — encontrada dentro " +
      "de una \"cartelera\" con varios eventos mezclados (fiesta de " +
      "cueca, encuentro de canto folclórico, taller infantil), de los " +
      "cuales solo esta exposición entra en alcance. fixedLocation.",
    addedAt: "2026-08-30",
    fixedLocation: { location: "Copiapó", placeName: "Centro Cultural Ser Humano" },
  },
  {
    username: "cultura_coquimbo",
    note:
      "Encontrada 2026-08-30 buscando comunas sin cobertura real (Coquimbo " +
      "tenía 0 eventos en 90 días pese a tener población y actividad " +
      "cultural real). Departamento de Cultura, Municipalidad de " +
      "Coquimbo — 22,2 mil seguidores, muy activa (4438 publicaciones), " +
      "cuenta oficial. Cubre varios espacios propios (Centro Cultural " +
      "Palace, Casa de las Artes, Casa Artes Rural, bibliotecas) — la " +
      "cuenta del Centro Cultural Palace en sí (@centroculturalpalace) " +
      "resultó ser mayormente reposts de ESTA cuenta bajo otro " +
      "username, así que se sigue la fuente real en vez del repost. " +
      "Exposición real confirmada vía búsqueda web: \"Salón de Julio\" " +
      "2026, 6ª versión, en el Centro Cultural Palace. Contenido mixto " +
      "(feria del libro, folclor, patrimonio) — Haiku filtra lo que no " +
      "sea artes visuales. Sin fixedLocation (múltiples sedes).",
    addedAt: "2026-08-30",
  },
  {
    username: "centro_almendral",
    note:
      "Encontrada 2026-08-30 buscando comunas sin cobertura (San Felipe). " +
      "Centro de Artes y Oficios Almendral — monumento nacional " +
      "(Registro de Museos de Chile), 6.715 seguidores. Mayormente " +
      "contenido de talleres/escuela de oficios (forja, orfebrería) — " +
      "excluido por política — pero con exposiciones reales " +
      "confirmadas vía búsqueda web (\"José Venturelli: El arte como " +
      "fuerza transformadora del humanismo\", visita guiada agosto " +
      "2026). fixedLocation.",
    addedAt: "2026-08-30",
    fixedLocation: { location: "San Felipe", placeName: "Centro de Artes y Oficios Almendral" },
  },
  {
    username: "artparadisegaleria",
    note:
      "Encontrada 2026-08-30 buscando comunas sin cobertura (San Felipe). " +
      "Art Paradise — bio dice \"galería de arte en línea, venta de " +
      "obras\" (riesgo de contenido mayormente comercial), pero con " +
      "exposiciones colectivas reales confirmadas: \"Exposición " +
      "Colectiva SALa FEM 2026\", itinerancia en San Felipe junto a " +
      "@culturamunisanfelipe (ya cubierta), curaduría real. Sin " +
      "fixedLocation — la propia cuenta plantea la muestra como " +
      "itinerante.",
    addedAt: "2026-08-30",
  },
  {
    username: "melipillacultura",
    note:
      "Encontrada 2026-08-30 buscando comunas sin cobertura real " +
      "(Melipilla). Depto. de Cultura, Municipalidad de Melipilla — " +
      "16,7 mil seguidores, muy activa (2142 publicaciones), cuenta " +
      "oficial (Centro Cultural Teatro Serrano, Orfeón Municipal, " +
      "Biblioteca). Exposiciones reales confirmadas vía búsqueda web: " +
      "\"Sembrando Semillas de Color\", \"Melipilla en el Siglo XX\" " +
      "(fotográfica), \"Exposición de Arpilleras de Melipilla\". " +
      "Contenido mixto — Haiku filtra lo que no sea artes visuales. " +
      "Sin fixedLocation (varios espacios).",
    addedAt: "2026-08-30",
  },
  {
    username: "museoarteyartesanialinares",
    note:
      "Encontrada 2026-08-30 buscando comunas sin cobertura (Linares). " +
      "Museo de Arte y Artesanía de Linares — museo especializado del " +
      "Servicio Nacional del Patrimonio Cultural (SNPC), 7,3 mil " +
      "seguidores. Alta densidad de exposiciones reales confirmadas: " +
      "\"Contenedor/Cont...\" (12 jun-11 jul 2026), \"Territorios " +
      "Tejidos\" (Fundación Artesanías de Chile), muestra de tres " +
      "maestros (ene-mar 2026). fixedLocation.",
    addedAt: "2026-08-30",
    fixedLocation: { location: "Linares", placeName: "Museo de Arte y Artesanía de Linares" },
  },
  {
    username: "ccm_constitucion",
    note:
      "Encontrada 2026-08-30 buscando comunas sin cobertura " +
      "(Constitución). Corporación Cultural de Constitución — 6,6 mil " +
      "seguidores, bio \"teatro, literatura, exposiciones\". Galería de " +
      "Bellas Artes Municipal José Caracci real y activa — exposiciones " +
      "confirmadas: \"Espejos del Alma, la Tierra y el Mar\", " +
      "\"Antología\" (37 obras). Contenido mixto — Haiku filtra lo que " +
      "no sea artes visuales. Sin fixedLocation (corporación cubre " +
      "varios espacios, incluyendo el Museo de Constitución).",
    addedAt: "2026-08-30",
  },
  {
    username: "culturas_coronel",
    note:
      "Encontrada 2026-08-30 buscando comunas sin cobertura (Coronel). " +
      "Casa de la Cultura Coronel — 12,8 mil seguidores. Sala de " +
      "Exposiciones \"Jorge Negroni Sanhueza\" dedicada, con alta " +
      "densidad de exposiciones reales confirmadas: \"Paisajes y " +
      "Bodegones\" (Albino Echeverría), \"Herencia\", \"Nostalgias " +
      "Mineras\" (Roberto de la Parra). fixedLocation.",
    addedAt: "2026-08-30",
    fixedLocation: { location: "Coronel", placeName: "Casa de la Cultura Jorge Vigueras Llanos" },
  },
  {
    username: "sppcultura",
    note:
      "Encontrada 2026-08-30 buscando comunas sin cobertura (San Pedro " +
      "de la Paz). Corporación Cultural SPP — 13,2 mil seguidores, sala " +
      "de exposiciones propia. Alta densidad de exposiciones reales " +
      "confirmadas: \"Ñuble Íntimo\" (Jacqueline Santos Luarte), " +
      "\"Surrealismo entre paréntesis\", \"Kabbalah\". fixedLocation.",
    addedAt: "2026-08-30",
    fixedLocation: { location: "San Pedro de la Paz", placeName: "Corporación Cultural San Pedro de la Paz" },
  },
  {
    username: "centroculturaltome",
    note:
      "Encontrada 2026-08-30 buscando comunas sin cobertura (Tomé). " +
      "Centro Cultural Tomé — 10 mil seguidores, Galería Artes " +
      "Municipal. Muy alta densidad de exposiciones reales confirmadas " +
      "vía búsqueda web: \"Origen y Plenitud\", \"Sabiduría Ancestral\" " +
      "(itinerante), \"Vestigios Textiles Urbanos\", \"Bordando " +
      "Copiulemu\" (Galería Humana) — al menos 4 muestras reales " +
      "distintas encontradas. Sin fixedLocation (múltiples espacios: " +
      "Galería Artes Municipal, Círculo de Bellas Artes El Vagón, " +
      "Galería Humana).",
    addedAt: "2026-08-30",
  },
  {
    username: "cultura.cauquenes",
    note:
      "Encontrada 2026-08-30 buscando comunas sin cobertura " +
      "(Cauquenes). Casa de la Cultura, Depto. de Cultura, las Artes y " +
      "el Patrimonio de la Municipalidad de Cauquenes — 5,5 mil " +
      "seguidores. Exposiciones reales confirmadas: \"Indómita\" " +
      "(fotográfica, Francisca Acuña), \"Cauqueninos en la Pintura\", " +
      "muestra de pinturas y xilografía (37 obras). Contenido mixto — " +
      "Haiku filtra lo que no sea artes visuales. Sin fixedLocation " +
      "(Casa de la Cultura + Club Social de Cauquenes).",
    addedAt: "2026-08-30",
  },
  {
    username: "culturaquilpue",
    note:
      "Encontrada 2026-08-30 buscando comunas sin cobertura (Quilpué). " +
      "Dirección de Cultura, Municipalidad de Quilpué — 36 mil " +
      "seguidores, muy activa. Centro Cultural Daniel de la Vega, " +
      "altísima densidad de exposiciones reales confirmadas: " +
      "\"Artequin llega a Quilpué\" (07-30 sept 2026), \"Patente " +
      "Latente\" (bordado, Daniela Lara Espinoza), \"El Secreto que " +
      "sostiene la Vida\", \"Mala Imagen\", \"La Galería de los " +
      "Ilustres\". fixedLocation.",
    addedAt: "2026-08-30",
    fixedLocation: { location: "Quilpué", placeName: "Centro Cultural Daniel de la Vega" },
  },
  {
    username: "casadelaculturachiguayante",
    note:
      "Encontrada 2026-08-30 buscando comunas sin cobertura " +
      "(Chiguayante). Casa de la Cultura de Chiguayante — 17,7 mil " +
      "seguidores, muy activa (posts casi diarios), sala de " +
      "exposiciones dedicada. Altísima densidad de exposiciones reales " +
      "confirmadas y vigentes: \"Todas las formas para ser\" (Roberta " +
      "Alué, hasta 26 oct 2026), \"El Jardín Interior\" (Rocío Osses " +
      "Lastra), \"Karukinka\", \"VOLVER. Entre neblinas a la tierra del " +
      "sol\" (Guillermo Moscoso). fixedLocation.",
    addedAt: "2026-08-30",
    fixedLocation: { location: "Chiguayante", placeName: "Casa de la Cultura de Chiguayante" },
  },
  {
    username: "centroculturalmob",
    note:
      "Encontrada 2026-08-30 buscando comunas sin cobertura (San " +
      "Javier, Maule). Centro Cultural Mario Oltra Blanco (MOB) — 35+ " +
      "años, 3,8 mil seguidores. Contenido mayormente ballet " +
      "folclórico, teatro infantil y talleres (excluidos), pero con " +
      "exposiciones reales de artes plásticas confirmadas y vigentes: " +
      "\"Exposición de Pinturas\" (20 jul-4 sept 2026, aún abierta), " +
      "\"Artes Plásticas de un Legado\" (Cristian Orellana Fredes). " +
      "fixedLocation.",
    addedAt: "2026-08-30",
    fixedLocation: { location: "San Javier", placeName: "Centro Cultural Mario Oltra Blanco" },
  },
  {
    username: "galeriacaba",
    note:
      "Evaluada 2026-08-31 directamente en Chrome (logueado), no vía " +
      "Apify — política de costo: Apify ya tocó su tope real de $5/mo " +
      "el 2026-08-30 (ver infra_cost_policy), así que las evaluaciones " +
      "de candidatas nuevas se hacen por navegador cuando alcanza, " +
      "reservando Apify para el fetch real de cuentas ya aprobadas. " +
      "Centro de Arte Baños del Almendro (CABA), Pasaje Fisher 18, " +
      "Cerro Concepción, Valparaíso — 440 publicaciones, 1940 " +
      "seguidores, muestreo de ~10 posts reales: inauguraciones con " +
      "fecha/hora/dirección siempre completas (\"Alliyachi 'Regenerar'\" " +
      "de Mishelle Ramos, \"Cola de Buey\" de Manuel Pertier), charlas " +
      "curatoriales (\"Pensamiento/materia\"), mesas de lectura, y un " +
      "calendario mensual completo publicado (\"Programación Julio " +
      "2026\") — cadencia real y densidad alta, sin ruido detectado en " +
      "la muestra. fixedLocation.",
    addedAt: "2026-08-31",
    fixedLocation: { location: "Valparaíso", placeName: "Centro de Arte Baños del Almendro (CABA)" },
  },
  {
    username: "departamentojota",
    note:
      "Evaluada 2026-08-31 en Chrome (logueado), no vía Apify (misma " +
      "razón que galeriacaba). Departamento JOTA, Mosqueto 464, " +
      "Santiago (Metro Bellas Artes) — 404 publicaciones, 7715 " +
      "seguidores. Programa curatorial 2026 numerado y muy activo: " +
      "\"Donde cae el cielo\" (quinta exposición del programa, Julen " +
      "Birke + Kika Mazry, curaduría de Sebastián Márquez Mora), " +
      "\"PAISAJISMOS\" (Fede Taus + conversatorio), \"IMPRESIONES\" " +
      "(Lucki Luciano), \"Solo nos queda el recuerdo\" (Ismael " +
      "Sepúlveda), \"PLANTA ALTA\", además de un evento tipo DJ set " +
      "(\"BULLICIOS\") — mismo perfil de riesgo que casona_lagoslira: " +
      "algunos posts de inauguración son colaborativos con la cuenta " +
      "del curador de turno (no reposts, coautoría real de Instagram), " +
      "no siempre publicados solo desde el feed propio. fixedLocation.",
    addedAt: "2026-08-31",
    fixedLocation: { location: "Santiago", placeName: "Departamento JOTA" },
  },
  {
    username: "estacionsuralia",
    note:
      "Evaluada 2026-08-31 en Chrome (logueado), no vía Apify. " +
      "Encontrada a partir de @ptomontt.cl (cuenta municipal/de avisos " +
      "de Puerto Montt, evaluada y descartada por ruido — 5874 " +
      "publicaciones, en su mayoría avisos comunitarios genéricos, no " +
      "arte), que etiquetó a esta galería-taller en un post real " +
      "(\"Pajarón\", Franco Arriagada). Estación Suralia, Pueblito " +
      "Melipulli, Puerto Montt — 117 publicaciones, 992 seguidores, " +
      "\"difundimos arte sureño\". Densidad real alta: además de " +
      "\"Pajarón\" (propia sala), \"Ricardo Paredes\" (exposición " +
      "propia), \"DOPAMINA\" (exposición de diseño y oficios, 7-8 " +
      "agosto, en Chester Beer, Llanquihue — sede ajena), y difunde " +
      "charlas/presentaciones de terceros (\"Volcanes de los Andes " +
      "Sur\", \"CAMM/Sernageomin\"). Buena cobertura geográfica (sur de " +
      "Chile, poco representado). Sin fixedLocation: organiza también " +
      "en sedes ajenas (Chester Beer) además de su propia sala — Haiku " +
      "infiere por post, igual que ilposto.cl.",
    addedAt: "2026-08-31",
  },
  {
    username: "judasgaleria",
    note:
      "Evaluada 2026-08-31 en Chrome (logueado), no vía Apify — pedida " +
      "directamente por Daniel tras un contacto real de la galería. " +
      "Judas Galería, Pasaje Gálvez 167, Valparaíso — galería de arte " +
      "contemporáneo desde 2018, codirigida por Juvenal Barría y José " +
      "Pemjean, representa a 22 artistas nacionales; línea curatorial " +
      "explícita en género/identidades, crisis medioambiental y " +
      "reivindicaciones geopolíticas descentralizadas — alineada con la " +
      "postura editorial de Caldearte. 9750 seguidores. Grilla activa " +
      "con posts de exposiciones reales (\"BRUXISMO\", Manuel Castillo; " +
      "\"Alguna cosa textil / Acto silencioso: procesos lentos\"); su " +
      "propio sitio (judasgaleria.cl) lista un historial largo de " +
      "muestras propias (\"Delirio\", \"Hormiga\", \"Political Facts\", " +
      "\"Otra vida\", entre otras) desde 2018, confirmando un programa " +
      "real y sostenido, no una cuenta esporádica. Sin conflicto en " +
      "ningún eje: la muestra más provocativa revisada (\"Contenido " +
      "inapropiado\", 2021, sobre posporno) es de hecho un caso INCLUDE " +
      "— postura crítica explícita contra el poder económico/histórico " +
      "de la Iglesia católica, y el desnudo/sexualidad ahí tratado no " +
      "cae en el eje 5 (agresión explícita), no en desnudo/erotismo " +
      "artístico. fixedLocation.",
    addedAt: "2026-08-31",
    fixedLocation: { location: "Valparaíso", placeName: "Judas Galería" },
  },
  {
    username: "galeriapostigo",
    note:
      "Evaluada 2026-09-01 en Chrome (logueado), no vía Apify. Galería " +
      "de Arte Postigo, Bandera con Compañía frente al 411, Santiago — " +
      "concepto real y poco común: una galería de arte integrada en un " +
      "quiosco clásico de calle (\"un espacio en @jardin_postigo\"). " +
      "Recién inaugurada: 7 publicaciones, 413 seguidores, única " +
      "muestra hasta ahora es \"Vamos? No!\" de Zaida González Ríos " +
      "(inauguración real, viernes 7 de agosto, 19:00 hrs, con cobertura " +
      "de prensa real — Cooperativa/El Mercurio, foto del artículo en el " +
      "feed). No se agrega ningún evento hoy: esa inauguración ya pasó " +
      "hace más de 3 semanas, sin fecha de cierre confirmada en ningún " +
      "post, y sin nueva muestra anunciada aún (\"Pronto más " +
      "novedades!\") — nada vigente que agregar en este momento, pero " +
      "cuenta real y prometedora para futuras aperturas. fixedLocation.",
    addedAt: "2026-09-01",
    fixedLocation: { location: "Santiago", placeName: "Galería de Arte Postigo" },
  },
  {
    username: "museoregionalrancagua",
    note:
      "Evaluada 2026-09-01 en Chrome (logueado), no vía Apify. Museo " +
      "Regional de Rancagua, Estado #685, Rancagua — museo público " +
      "(Gobierno de Chile, entrada gratuita), 1356 publicaciones, 10,5 " +
      "mil seguidores. Encontrada vía una inauguración real (\"Dos mil " +
      "Novecientos Kilos\", Pía Catalán Severino, seleccionada en su " +
      "Convocatoria 2026). Densidad mixta pero con contenido de arte " +
      "visual real y recurrente: exposiciones temporales propias, " +
      "actividades de mediación de exposiciones vigentes, junto con " +
      "contenido institucional/comunitario (asambleas de consejos " +
      "provinciales, talleres) — mismo perfil que otros museos " +
      "regionales ya trackeados. Buena cobertura geográfica (región de " +
      "O'Higgins, poco representada). fixedLocation.",
    addedAt: "2026-09-01",
    fixedLocation: { location: "Rancagua", placeName: "Museo Regional de Rancagua" },
  },
  {
    username: "anandamapu",
    note:
      "Evaluada 2026-09-01 en Chrome (logueado), no vía Apify. " +
      "Anandamapu, centro cultural independiente y autogestionado, San " +
      "Cristobal 508 esq. Caliche, Recoleta, Santiago — 1596 " +
      "publicaciones, 10 mil seguidores. Encontrada vía una exposición " +
      "real (\"Colección de Máscaras\", Natalia Sanzana, 3ra exposición " +
      "del ciclo \"Arte y Territorio\" 2026). Rendimiento esperado bajo " +
      "proporcionalmente: cubre muchísimas disciplinas (milonga, " +
      "podcast, diáspora, arriendos, talleres varios), pero tiene un " +
      "\"Área Artes Visuales\" propia con programa curatorial real y " +
      "recurrente (el ciclo \"Arte y Territorio\" ya va en su 3ra " +
      "muestra en 2026). fixedLocation — un solo local físico.",
    addedAt: "2026-09-01",
    fixedLocation: { location: "Recoleta", placeName: "Anandamapu" },
  },
  {
    username: "teatromunicipalchillanoficial",
    note:
      "Evaluada 2026-09-02 en Chrome (logueado), no vía Apify. Teatro " +
      "Municipal de Chillán, cuenta oficial de la Corporación Cultural " +
      "Municipal de Chillán — 5892 publicaciones, 64.9 mil seguidores, " +
      "activa a diario. Encontrada vía una exposición real (\"Muestra " +
      "Internacional de Grabado Contemporáneo\", 2da versión del \"Mes " +
      "del Grabado Ñuble\", país invitado Argentina, curador José " +
      "Agustín Córdova, 34 obras de 22 artistas). Rendimiento esperado " +
      "muy bajo proporcionalmente: la cuenta cubre casi exclusivamente " +
      "teatro/ópera/danza/conciertos/cine/programas sociales — de ~30 " +
      "posts recientes muestreados, solo 1 era una exposición de arte " +
      "visual. Pero tiene una \"Escuela de Grabado\" y un highlight " +
      "\"Exposiciones\" propios, con programación real y recurrente en " +
      "sus Galerías Violeta Parra y Nicanor Parra — confirmado " +
      "independientemente por una segunda exposición ya vista este " +
      "mismo mes (\"Ñuble Insitu\", colectivo, 14 jul-28 ago 2026). " +
      "fixedLocation — un solo local físico.",
    addedAt: "2026-09-02",
    fixedLocation: { location: "Chillán", placeName: "Teatro Municipal de Chillán" },
  },
  {
    username: "culturarecoleta",
    note:
      "Evaluada 2026-09-03 en Chrome (logueado), no vía Apify. " +
      "Corporación de Cultura y Deporte de Recoleta, cuenta oficial " +
      "municipal — 30.5 mil seguidores, Inocencia 2711, Recoleta. " +
      "Encontrada vía una exposición real (\"Acción Xilográfica\", " +
      "Colectivo de Acción Xilográfica José Domingo Gómez Rojas — " +
      "autores de la gráfica oficial de Mil Guitarras y Mil Voces para " +
      "Víctor Jara 2026 — inauguración 10 de septiembre, Espacio Quinta " +
      "Bella). Contenido mixto (biblioteca, deporte, teatro, cine, " +
      "música), pero tiene un highlight \"Artes Visuales\" propio que " +
      "confirma programación curatorial recurrente. fixedLocation — un " +
      "solo local físico.",
    addedAt: "2026-09-03",
    fixedLocation: { location: "Recoleta", placeName: "Centro Cultural de Recoleta" },
  },
  // El resto de la lista la aporta Daniel — una decisión editorial, igual
  // que cada fuente brillante nueva se evaluó una por una. Confirmar
  // pública y activa antes de agregar cada cuenta.
];
