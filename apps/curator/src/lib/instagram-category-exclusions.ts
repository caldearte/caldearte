// Fase 2 del plan de exclusión por cuenta×categoría (2026-10-02) — lista
// ESTÁTICA, revisada a mano, no generada ni aplicada automáticamente por
// scripts/measure-account-category-exclusions.ts (ese script solo mide).
// Mismo patrón que INSTAGRAM_ACCOUNTS/bright sources: cada entrada es una
// decisión editorial explícita, con su propia evidencia documentada,
// nunca algo que se recalcula solo en producción.
//
// Medido contra la ventana con atribución completa por cuenta (desde el
// 19-sep-2026, cuando empezó a existir instagram_source_post_stats, hasta
// el 2-oct-2026) — 13 días. Umbral: una cuenta entra a esta lista solo si
// tuvo >=2 rechazos reales en esa categoría Y CERO eventos reales
// insertados en esa categoría, nunca, en toda la ventana medida.
//
// Esta lista es INERTE por ahora — nada la importa todavía (Fase 3,
// pendiente de aprobación explícita antes de wirearla al filtro real de
// instagram-discovery/run.ts).
//
// Revisar de nuevo cada vez que se re-corra el script de medición (Fase
// 4) — una cuenta puede salir de aquí si alguna vez produce un evento
// real en esa categoría, y pueden sumarse cuentas nuevas que acumulen
// suficiente historial limpio.
export interface CategoryExclusion {
  account: string;
  category: string;
}

// NUNCA agregar estos pares — cada uno produjo al menos un evento REAL
// insertado que coincide con esa categoría dentro de la ventana medida:
//   - baj_antofagasta / taller (1 real, 2 rechazos — mezcla, no es ruido puro)
//   - culturallascondes / taller (1 real, 0 rechazos)
//   - galeria.artespacio / conversatorio (1 real, 0 rechazos)
//   - galeriacima / feria (1 real, 0 rechazos)
// Si alguna de estas cuatro aparece de nuevo en una medición futura con
// más rechazos de la misma categoría, sigue sin calificar para esta
// lista — ya demostró que no es ruido puro.

export const CATEGORY_EXCLUSIONS: CategoryExclusion[] = [
  // --- concierto (24 cuentas, 85 rechazos evitables, 0 reales) ---
  { account: "culturarecoleta", category: "concierto" }, // 9 rechazos
  { account: "teatromunicipalchillanoficial", category: "concierto" }, // 8
  { account: "centroculturalquillota", category: "concierto" }, // 8
  { account: "centroculturalceina", category: "concierto" }, // 5
  { account: "culturacopiapo.cl", category: "concierto" }, // 4
  { account: "culturallascondes", category: "concierto" }, // 4 — ojo: SÍ excluido aquí (concierto), distinto de taller donde está prohibido
  { account: "cultura_coquimbo", category: "concierto" }, // 4
  { account: "casadelaculturarancagua", category: "concierto" }, // 4
  { account: "ccm_la", category: "concierto" }, // 4
  { account: "culturaprovidencia", category: "concierto" }, // 4
  { account: "cultura.unab", category: "concierto" }, // 3
  { account: "vitacuracultura", category: "concierto" }, // 3
  { account: "culturanunoa", category: "concierto" }, // 3
  { account: "ccm_constitucion", category: "concierto" }, // 3
  { account: "casadelaculturachiguayante", category: "concierto" }, // 3
  { account: "valparaisoprofundo", category: "concierto" }, // 2
  { account: "culturacoyhaique", category: "concierto" }, // 2
  { account: "fundacionmecenas", category: "concierto" }, // 2
  { account: "laescalagaleria", category: "concierto" }, // 2
  { account: "culturaancud", category: "concierto" }, // 2
  { account: "museosaustral", category: "concierto" }, // 2
  { account: "concepcioncultural", category: "concierto" }, // 2
  { account: "lomattacultural", category: "concierto" }, // 2
  { account: "cultura_angol", category: "concierto" }, // 2

  // --- taller (26 cuentas, 75 rechazos evitables, 0 reales) ---
  // Excluida a propósito pese a pasar el umbral mecánico: taller_99 (3
  // rechazos, 0 reales en esta ventana de 13 días). Es un taller de
  // grabado real y conocido — el mismo mencionado en "Tinta Viva", un
  // evento real insertado fuera de esta ventana — y la muestra es chica.
  // Decisión humana (Daniel, 2026-10-02): el riesgo semántico de una
  // institución-taller real supera la evidencia de 3 rechazos.
  { account: "casadelaculturarancagua", category: "taller" }, // 7
  { account: "artequinvina", category: "taller" }, // 7
  { account: "cultura_puentealto", category: "taller" }, // 6
  { account: "fundacionmecenas", category: "taller" }, // 5
  { account: "anandamapu", category: "taller" }, // 4
  { account: "ccserhumano", category: "taller" }, // 4
  { account: "vitacuracultura", category: "taller" }, // 3
  { account: "cajacrisol_arte", category: "taller" }, // 3
  { account: "cultura_coquimbo", category: "taller" }, // 3
  { account: "baj_biobio", category: "taller" }, // 3
  { account: "museoregionaldeatacama", category: "taller" }, // 3
  { account: "lomattacultural", category: "taller" }, // 2
  { account: "concepcioncultural", category: "taller" }, // 2
  { account: "culturas_coronel", category: "taller" }, // 2
  { account: "bnchile", category: "taller" }, // 2
  { account: "centroculturalmob", category: "taller" }, // 2
  { account: "culturacoyhaique", category: "taller" }, // 2
  { account: "ko_panqui", category: "taller" }, // 2
  { account: "casaculturalyanulaque", category: "taller" }, // 2
  { account: "mavichile", category: "taller" }, // 2
  { account: "museotaller", category: "taller" }, // 2
  { account: "galeria_gabriela_mistral", category: "taller" }, // 2
  { account: "museoregionalrancagua", category: "taller" }, // 2
  { account: "factor__f", category: "taller" }, // 2
  { account: "galeriatallerespacioa", category: "taller" }, // 2
  { account: "artequin", category: "taller" }, // 2

  // --- teatro (18 cuentas, 62 rechazos evitables, 0 reales) ---
  { account: "casadelartediegorivera", category: "teatro" }, // 7
  { account: "culturaancud", category: "teatro" }, // 6
  { account: "ccm_la", category: "teatro" }, // 5
  { account: "teatromunicipalchillanoficial", category: "teatro" }, // 5
  { account: "centroculturalceina", category: "teatro" }, // 4
  { account: "centroculturalvillarricaliquen", category: "teatro" }, // 4
  { account: "centroculturalquillota", category: "teatro" }, // 4
  { account: "melipillacultura", category: "teatro" }, // 3
  { account: "chimkowecentro", category: "teatro" }, // 3
  { account: "vitacuracultura", category: "teatro" }, // 3
  { account: "centroculturalrojasmagallanes", category: "teatro" }, // 3
  { account: "ccserhumano", category: "teatro" }, // 3
  { account: "cultura_puentealto", category: "teatro" }, // 2
  { account: "baj_biobio", category: "teatro" }, // 2
  { account: "sppcultura", category: "teatro" }, // 2
  { account: "culturaquilpue", category: "teatro" }, // 2
  { account: "culturamunisanfelipe", category: "teatro" }, // 2
  { account: "culturaprovidencia", category: "teatro" }, // 2

  // --- danza (15 cuentas, 60 rechazos evitables, 0 reales) ---
  { account: "centroculturalvillarricaliquen", category: "danza" }, // 9
  { account: "anandamapu", category: "danza" }, // 8
  { account: "centroculturalquillota", category: "danza" }, // 6
  { account: "centroculturalceina", category: "danza" }, // 6
  { account: "casadelaculturachiguayante", category: "danza" }, // 4
  { account: "culturaprovidencia", category: "danza" }, // 4
  { account: "culturacoyhaique", category: "danza" }, // 4
  { account: "chimkowecentro", category: "danza" }, // 3
  { account: "culturanunoa", category: "danza" }, // 3
  { account: "casadelaculturarancagua", category: "danza" }, // 3
  { account: "fundacionmecenas", category: "danza" }, // 2
  { account: "culturaancud", category: "danza" }, // 2
  { account: "centrocultural_losandes", category: "danza" }, // 2
  { account: "cultura_puentealto", category: "danza" }, // 2
  { account: "corporacionculturallb", category: "danza" }, // 2

  // --- charla (22 cuentas, 54 rechazos evitables, 0 reales) ---
  { account: "culturanunoa", category: "charla" }, // 5
  { account: "vitacuracultura", category: "charla" }, // 5
  { account: "valparaisocasaarte", category: "charla" }, // 3
  { account: "lomattacultural", category: "charla" }, // 3
  { account: "bnchile", category: "charla" }, // 3
  { account: "cultura.unab", category: "charla" }, // 3
  { account: "mhnchile", category: "charla" }, // 2
  { account: "institutodearte.pucv", category: "charla" }, // 2
  { account: "biblioptovaras", category: "charla" }, // 2
  { account: "ko_panqui", category: "charla" }, // 2
  { account: "centrocultural_losandes", category: "charla" }, // 2
  { account: "mavichile", category: "charla" }, // 2
  { account: "arte_uah", category: "charla" }, // 2
  { account: "museoandino", category: "charla" }, // 2
  { account: "atacama_artgallery", category: "charla" }, // 2
  { account: "muarse", category: "charla" }, // 2
  { account: "ccm_la", category: "charla" }, // 2
  { account: "culturallascondes", category: "charla" }, // 2
  { account: "corporacionculturallb", category: "charla" }, // 2
  { account: "pabellon83", category: "charla" }, // 2
  { account: "melipillacultura", category: "charla" }, // 2
  { account: "ccesantiago", category: "charla" }, // 2

  // --- conversatorio (16 cuentas, 44 rechazos evitables, 0 reales) ---
  { account: "culturanunoa", category: "conversatorio" }, // 6
  { account: "ccesantiago", category: "conversatorio" }, // 5
  { account: "vitacuracultura", category: "conversatorio" }, // 4
  { account: "cultura.unab", category: "conversatorio" }, // 4
  { account: "bnchile", category: "conversatorio" }, // 3
  { account: "atacama_artgallery", category: "conversatorio" }, // 2
  { account: "museoandino", category: "conversatorio" }, // 2
  { account: "cajacrisol_arte", category: "conversatorio" }, // 2
  { account: "arte_uah", category: "conversatorio" }, // 2
  { account: "centrocultural_losandes", category: "conversatorio" }, // 2
  { account: "galeriabarriosbajos", category: "conversatorio" }, // 2
  { account: "ccgabrielamistral", category: "conversatorio" }, // 2
  { account: "ccm_la", category: "conversatorio" }, // 2
  { account: "valpocultura", category: "conversatorio" }, // 2
  { account: "culturallascondes", category: "conversatorio" }, // 2
  { account: "mhnchile", category: "conversatorio" }, // 2

  // --- circo (9 cuentas, 24 rechazos evitables, 0 reales) ---
  { account: "teatromunicipalchillanoficial", category: "circo" }, // 6
  { account: "culturalcurico", category: "circo" }, // 3
  { account: "ccm_la", category: "circo" }, // 3
  { account: "huechurabacultura", category: "circo" }, // 2
  { account: "casadelaculturachiguayante", category: "circo" }, // 2
  { account: "centroculturalvillarricaliquen", category: "circo" }, // 2
  { account: "chimkowecentro", category: "circo" }, // 2
  { account: "cultura_coquimbo", category: "circo" }, // 2
  { account: "espaciosculturalesarica", category: "circo" }, // 2

  // --- feria (3 cuentas, 11 rechazos evitables, 0 reales) ---
  { account: "espacioandreabrunson", category: "feria" }, // 5
  { account: "judasgaleria", category: "feria" }, // 4
  { account: "calamacultural", category: "feria" }, // 2
];
