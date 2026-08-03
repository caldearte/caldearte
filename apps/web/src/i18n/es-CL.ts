// Minimal i18n scaffold — only es-CL exists today (Chile-only for now, per
// an earlier decision on sensitivity copy). Add further locale files
// alongside this one and a lookup keyed by locale if/when the project
// expands beyond Chile — no lookup mechanism exists yet since there's only
// ever one locale to resolve to.
//
// IMPORTANT for the next locale file (es-AR.ts, es-CO.ts, ...): write it in
// that country's actual dialect and modismos — verified, not assumed by
// copying this file's phrasing. Real bug (found 2026-07-19): several
// strings here were written in Rioplatense voseo ("Elegí", "Buscá",
// "Contanos", "Escribinos") instead of the neutral Chilean "tú" register
// used everywhere else in the site — an easy mistake to make when Spanish
// variants sound superficially similar, but "es-CL" specifically promises
// Chilean Spanish. Don't let that happen to the next locale: get a native
// speaker's review (or equivalent verification) of the target country's
// real conjugation/imperative forms before shipping, not after.

function pluralize(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

// "Muestra lo que hay": a zero count carries no information worth reading
// (nobody wants "0 inauguraciones y 2 exposiciones"), so it's dropped
// entirely rather than shown as a zero. When both are zero, callers decide
// their own fallback — this returns "" so the caller can detect that case.
function countsPhrase(inauguracionesCount: number, exposCount: number, joiner: string): string {
  const parts: string[] = [];
  if (inauguracionesCount > 0) {
    parts.push(`${inauguracionesCount} ${pluralize(inauguracionesCount, "inauguración", "inauguraciones")}`);
  }
  if (exposCount > 0) {
    parts.push(`${exposCount} ${pluralize(exposCount, "exposición", "exposiciones")}`);
  }
  return parts.join(joiner);
}

export const esCL = {
  appName: "CALDEARTE",
  appDescription: "Calendario de inauguraciones de arte en Chile.",
  // Rediseño 2.0.0 — wordmark de dos líneas ("CALDE" / "ARTE.") tal como
  // está en Figma, distinto del appName de una sola línea usado en
  // metadata/otros lugares.
  wordmarkLine1: "CALDE",
  wordmarkLine2: "ARTE.",
  heroTagline: "GUÍA INDEPENDIENTE DE ARTE SEMANAL",
  // Mobile forces this onto 3 explicit lines (design decision, not just
  // natural text wrap) — desktop keeps heroTagline as one line.
  heroTaglineMobileLines: ["GUÍA", "INDEPENDIENTE", "DE ARTE SEMANAL"],
  weekNumberLabel: (n: number) => `SEMANA N°${n}`,
  prevWeekAriaLabel: "Semana anterior",
  nextWeekAriaLabel: "Semana siguiente",
  // Header's location pill, e.g. "SANTIAGO, CHILE" — was hardcoded inline
  // in Header.tsx (real gap found 2026-08-03), now routed through i18n
  // like every other visible string.
  locationPillSuffix: (cityName: string) => `${cityName.toUpperCase()}, CHILE`,
  chooseCity: "Elige tu ciudad",
  cityPickerAriaLabel: "Selector de ciudad",
  closeCityPicker: "Cerrar selector de ciudad",
  citySearchPlaceholder: "Buscar comuna o región...",
  citySearchAriaLabel: "Buscar comuna o región",
  noCityResults: "No encontramos resultados.",
  cityPickerCurrentLocation: "Tu ubicación actual",
  cityPickerRecentlyVisited: "Últimas visitadas",
  // Opt-in browser Geolocation upgrade — the automatic IP-based location
  // shown below (as a CityRow) is a coarse estimate; this note + button
  // pair asks the visitor's permission for a much more precise reading.
  // Nested INSIDE the "Tu ubicación actual" section, directly above the
  // coarse city it's offering to improve — real feedback 2026-07-30: "que
  // se vea el banner solo donde corresponde" (only shows where the coarse
  // location itself is already showing, not as a generic standalone
  // prompt) and a distinct button so it reads as informational text +
  // action, not "the whole row is vaguely clickable". Never shown as an
  // error toast — errorText renders inline, small, non-blocking
  // (denial/no-support are expected, normal outcomes, not failures).
  cityPickerUseExactLocation: "Esta ubicación es aproximada. Comparte tu ubicación real para verla siempre correcta aquí.",
  cityPickerShareLocationButton: "Compartir ubicación",
  cityPickerLocatingExact: "Buscando...",
  cityPickerExactLocationError: "No pudimos obtener tu ubicación.",
  cityPickerHints: {
    navigate: "↑↓ navegar",
    select: "↵ seleccionar",
    close: "esc cerrar",
  },
  // First-visit banner (GeoConsentBanner.tsx) — asks once, up front,
  // whether to use the visitor's real location, rather than burying that
  // option inside the city picker. Answered either way exactly once (see
  // GEO_CONSENT_COOKIE); "decline" also covers a native browser permission
  // denial — both read as "don't ask again", not just an explicit click.
  geoConsentPrompt: "¿Quieres compartir tu ubicación para ver las inauguraciones y exposiciones cerca de ti ahora?",
  geoConsentAccept: "Sí, compartir",
  geoConsentDecline: "No, gracias",
  // GeoLocationChangedBanner — shown only after a real precise reading is
  // already known (silent background re-check on page load detected a
  // different comuna than last time). Declining just quietly updates the
  // cached reading so it doesn't keep asking about the same move; only
  // accepting changes what's actually shown.
  geoLocationChangedPrompt: (cityName: string) => `Tu ubicación cambió a ${cityName}. ¿Quieres ver qué hay ahí?`,
  geoLocationChangedAccept: "Sí, ver ahí",
  geoLocationChangedDecline: "No, gracias",
  menu: "Menú",
  curatoria: "Curatoría",
  familyMode: "Modo familiar",
  otherCity: "Otro",

  // Global search panel — scope is every active/upcoming event in every
  // comuna, not just what's currently on screen (see SearchPanel.tsx).
  searchAriaLabel: "Buscar eventos",
  closeSearch: "Cerrar búsqueda",
  searchTitle: "Buscar eventos",
  searchPlaceholder: "Buscar por título, artista o lugar...",
  searchHint: "Busca entre todos los eventos vigentes y próximos, en cualquier comuna.",
  noSearchResults: "No encontramos eventos con ese término.",

  // Desktop only — see headerSummaryMobile below for mobile's more compact
  // single-total version.
  headerSummary: (inauguracionesCount: number, exposCount: number) => {
    const phrase = countsPhrase(inauguracionesCount, exposCount, " y ");
    return phrase ? `${phrase} que visitar en` : "Descubre el arte que hay en";
  },
  // Mobile-only, where the header has less horizontal room — a single
  // total instead of headerSummary's inauguración/exposición breakdown.
  // `totalCount` is exposActuales' own count, not inau+expo summed —
  // inauguraciones is an overlapping HIGHLIGHTED SUBSET of exposActuales
  // (an opening-this-week event counts in both), so exposActuales alone
  // already IS the full "everything happening" total; summing both would
  // double-count it.
  headerSummaryMobile: (totalCount: number) =>
    totalCount > 0 ? `${totalCount} ${pluralize(totalCount, "evento", "eventos")} en` : "Descubre el arte que hay en",
  // Used by the empty-state fallback message — "hoy" when the Hoy filter
  // pill is on, "esta semana" otherwise (the always-on default).
  todaySuffix: "hoy",
  thisWeekSuffix: "esta semana",
  // Leads the header's summary line ("Esta semana 1 inauguración y 32
  // exposiciones que visitar en [Santiago]") — capitalized, since the week
  // is always the default now (no more Hoy/Semana toggle to distinguish).
  thisWeekPrefix: "Esta semana",

  // Filtros section (FiltersSection.tsx) — collapsible, pill-style toggles
  // right below the Header. Replaces the old Hoy/Semana window-mode
  // toggle: everything always operates on the current week now, these
  // pills just narrow what's shown from it.
  filtersTitle: "Filtros",
  filterToday: "Hoy",
  filterVigentes: "Vigentes",
  // "HOY" badge on an event card (top-right of the image) — shown when
  // that specific event is active today, useful for spotting at a glance
  // which of the week's items are happening right now.
  todayBadge: "HOY",

  sectionInauguraciones: "INAUGURACIONES DE LA SEMANA",
  sectionInauguracionesLabel: "APERTURAS DESTACADAS",
  sectionInauguracionesLabelMobile: "Inauguración destacada",
  sectionExposActuales: "EXPOS ACTUALES",
  sectionArteEnTodasPartes: "ARTE EN TODAS PARTES",

  // Rediseño 2.0.0 — bento-card toolbar (Inauguraciones/Exposiciones):
  // grid⇄list view toggle + pagination.
  viewToggleGridAriaLabel: "Ver como cuadrícula",
  viewToggleListAriaLabel: "Ver como lista",
  prevPageAriaLabel: "Página anterior",
  nextPageAriaLabel: "Página siguiente",
  pageIndicator: (page: number, total: number) => `${page} / ${total}`,

  // Appended after the opening date on an InauguracionCard when the source
  // confirms a date but never an hour (see EventRecord.openingTimeConfirmed).
  consultHourWithVenue: "consulta la hora con el lugar",

  // Aria-label for the "how to get there" icon on an event card — opens
  // Google Maps directions in a new tab.
  directionsAriaLabel: (venue: string) => `Cómo llegar a ${venue}`,
  // Aria-label for the whole-card link to /eventos/[id] (EventCardBase) —
  // the card itself has no visible link text, just an overlay.
  eventCardAriaLabel: (title: string) => `Ver ${title}`,
  // Mobile-only: the directions/link icons collapse into a single "more
  // options" (kebab) button, which opens a small menu with these two
  // labeled entries instead.
  cardMoreOptionsAriaLabel: "Más opciones",
  cardMenuDirections: "Cómo llegar",
  cardMenuSource: "Ver fuente original",
  // Inauguraciones only — see EventCardBase's gating on variant + openingDatetime.
  cardMenuAddToCalendar: "Agregar a mi calendario",
  // "Compartir" is a row/button that reveals the targets below (with a
  // "← Volver" to go back), not all listed flat — explicit web intents,
  // not navigator.share (see EventCardBase's own doc comment: the
  // OS-native sheet is inconsistent, and WhatsApp specifically is the
  // dominant channel for this audience). Instagram/TikTok have no public
  // web share-intent URL at all, so "Copiar link" is the deliberate
  // catch-all for those and anywhere else.
  cardMenuShare: "Compartir",
  cardMenuBack: "Volver",
  cardMenuWhatsApp: "WhatsApp",
  cardMenuTwitter: "X (Twitter)",
  cardMenuFacebook: "Facebook",
  cardMenuCopyLink: "Copiar link",
  shareLinkCopied: "Link copiado",

  // /eventos/[id] — the shareable, individually-linkable page for one
  // event (see docs/risks.md's ToS note on scraped sources: this page's
  // whole point is to make attribution unmissable, not buried in a menu).
  eventPageBackToHome: "Ver más eventos en Caldearte",
  eventPageSourceLabel: (domain: string) => `Fuente: ${domain}`,
  eventPageSourceLink: "Ver publicación original ↗",
  eventPageAttributionNote: (domain: string) =>
    `Esta información fue recopilada por Caldearte a partir de una publicación pública de ${domain}.`,

  archiveLink: "Revisa expos anteriores",
  archiveMonthTitle: (label: string) => `Expos anteriores — ${label}`,
  archiveMonthDescription: (count: number, label: string, sample: string) =>
    count > 0
      ? `${count} ${pluralize(count, "exposición", "exposiciones")} que abrieron en Chile en ${label}: ${sample}${count > 5 ? "…" : "."}`
      : `Exposiciones que abrieron en Chile en ${label}.`,
  archiveSearchPlaceholder: "Buscar por título, artista o lugar...",
  archiveFiltersAriaLabel: "Filtros",
  archiveFilters: {
    title: "Filtros",
    desde: "Desde",
    hasta: "Hasta",
    lugar: "Lugar",
    comuna: "Comuna",
    comunaAll: "Todas",
    clear: "Limpiar filtros",
  },
  archiveNoResults: "No encontramos expos con esos filtros este mes.",
  archiveResultsCount: (n: number) => `${n} ${pluralize(n, "resultado", "resultados")}`,
  archivePrevMonth: "← Mes anterior",
  archiveNextMonth: "Mes siguiente →",

  cityStats: (inauguracionesCount: number, exposCount: number) => countsPhrase(inauguracionesCount, exposCount, " · "),

  tellUs: "Cuéntanos →",
  doYouKnowOne: "¿Conoces una que deberíamos sumar?",
  // Shown when a section (inauguraciones or expos actuales) has nothing in
  // the current window, but there's a real upcoming event to point to
  // instead. `suffix` is todaySuffix/thisWeekSuffix, so both modes share
  // one function instead of forking the copy.
  emptyWithNextEvent: (cityName: string, suffix: string, nextDateShort: string, nextTitle: string) =>
    `No hay nada que mostrar ${suffix} en ${cityName}. La próxima es el ${nextDateShort} — ${nextTitle}.`,
  emptyNoEventsYet: (cityName: string) => `Todavía no tenemos inauguraciones ni exposiciones para ${cityName}.`,

  sensitiveOverlay: {
    label: "Contenido sensible",
    reveal: "Ver contenido",
  },

  footer: {
    tagline: "Calendario de arte curado por inteligencia humana potenciada por IA",
    copyright: (year: number) => `© ${year} Caldearte`,
    contacto: "Contacto",
    privacidad: "Privacidad",
  },

  privacidad: {
    title: "Privacidad",
    dataTitle: "Qué datos guardamos",
    dataBody:
      "Guardamos varias cookies de preferencia en tu navegador, por un año: la comuna que elegiste, si tienes activado el modo familiar, tus filtros de vista, tus últimas comunas visitadas, y tu ubicación si la compartiste. Si te suscribes al newsletter, guardamos tu correo y la comuna elegida, y cada envío incluye un link para darte de baja en un clic. No creamos cuentas, no usamos rastreadores de terceros, y no guardamos nada de lo que escribas en el formulario de contacto: solo lo reenviamos por correo. Usamos Vercel Analytics para ver estadísticas agregadas de visitas, sin cookies ni datos que te identifiquen.",
    contactTitle: "¿Encontraste un error o algo que reportar?",
    contactBody: "Escríbenos desde el ",
    contactLinkLabel: "formulario de contacto",
  },

  newsletter: {
    title: "Recibe la semana en arte",
    headerLabel: "Boletín semanal",
    entryTitle: "No te pierdas ninguna inauguración",
    entrySubtitle: "Cada lunes, un resumen de lo mejor del arte en tu región — directo a tu correo.",
    emailPlaceholder: "tu@correo.cl",
    cityPlaceholder: "Tu comuna",
    regionPlaceholder: "Tu región",
    submit: "Suscribirme",
    sending: "Enviando…",
    successTitle: "Un paso más",
    success: "Te enviamos un correo con un link para confirmar tu suscripción. Si no lo ves en unos minutos, revisa la carpeta de spam.",
    alreadySubscribed: "Tu dirección de correo ya está suscrita a nuestro boletín semanal.",
    error: "No pudimos suscribirte. Intenta de nuevo.",
    dismiss: "Ahora no",
    close: "Listo",
    footerLink: "Suscríbete al boletín",
    confirmar: {
      title: "Confirmar suscripción",
      confirmedTitle: "¡Listo! Ya eres parte de Caldearte",
      confirmed: "Cada lunes recibirás lo mejor del arte de tu región, directo a tu correo.",
      alreadyConfirmed: "Tu suscripción ya estaba confirmada.",
      unsubscribed: "Esta suscripción ya fue dada de baja.",
      invalid: "Este link de confirmación no es válido.",
      error: "Ocurrió un error al confirmar. Intenta de nuevo desde el correo.",
    },
    baja: {
      title: "Darse de baja",
      unsubscribed: "Te diste de baja del newsletter de Caldearte. No recibirás más correos.",
      alreadyUnsubscribed: "Ya estabas dado de baja.",
      invalid: "Este link no es válido.",
      error: "Ocurrió un error al dar de baja. Intenta de nuevo desde el correo.",
    },
  },

  curatoriaPage: {
    title: "Curatoría",
  },

  // Rediseño 2.0.0 — teaser corto del home que enlaza a /curatoria, no
  // reemplaza curatoriaText (el manifiesto completo, más abajo) que sigue
  // viviendo solo en esa página.
  curatoriaWordmarkLines: ["CURA", "TOR", "IA."],
  curatoriaTeaser: "LA ESTÉTICA NO ES NEUTRAL, Y NUESTRA SELECCIÓN TAMPOCO.",
  verMas: "ver mas",

  contacto: {
    title: "Contacto",
    intro: "¿Viste algo mal curado, una inauguración que nos falta, o simplemente quieres escribirnos? Déjanos tu mensaje.",
    nameLabel: "Nombre (opcional)",
    emailLabel: "Tu email",
    messageLabel: "Mensaje",
    submit: "Enviar",
    sending: "Enviando...",
    success: "¡Gracias! Recibimos tu mensaje.",
    error: "Algo falló al enviar tu mensaje. Prueba de nuevo en un rato.",
  },

  // Already-approved copy, not a placeholder.
  curatoriaText:
    "Caldearte no es un agregador neutral. Elegimos con criterio qué inauguraciones mostramos, guiados por un compromiso con el arte como espacio de encuentro, reflexión y comunidad — no como vehículo de proselitismo religioso, glorificación de la violencia o plataforma de discursos de odio. Priorizamos el arte que abre preguntas: memoria histórica, crítica social, denuncia, experimentación — sea en un museo consagrado o en una intervención callejera de barrio. Usamos inteligencia artificial para ayudarnos a rastrear y evaluar inauguraciones todos los días, siempre bajo revisión humana en los casos donde el criterio no es obvio. Si crees que nos equivocamos con un evento, o quieres contarnos de una inauguración que no encontramos, escríbenos — leemos cada mensaje.",
};

export type Locale = typeof esCL;
