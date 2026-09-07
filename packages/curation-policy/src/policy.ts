// Shared verbatim policy text, used by event-discovery/discover.ts
// (search-based discovery, full curation applied at find-time). Single
// source so it doesn't drift out of sync with docs/curation-policy.md
// and docs/overview.md.

// Mirrors docs/overview.md's "What counts as art" section, ported
// verbatim — this is the scope filter, applied BEFORE the exclusion axes
// below. First version only excluded "conventional concerts/shows" and
// still let theater plays through (a real pilot run captured 4 of them at
// Matucana 100) — rewritten after user clarification to explicitly exclude
// theater/concerts/gigs and to actually recognize a genuine artistic
// intervention, not just "not a concert."
// Real bug (found 2026-07-20, via a user-requested Event Discovery audit):
// this used to tell Haiku to use "pending_review" for ambiguous
// scope calls — but Event Discovery's status is strictly binary
// (approved/rejected; see docs/overview.md's "Ambiguous cases... not
// built"). "pending_review" was never a real option in the actual JSON
// schema (discover.ts's buildSystemPrompt), so that instruction was
// unsatisfiable — Haiku had to pick approved or rejected anyway with no
// real guidance for the ambiguous case, which likely contributed to real
// scope-creep approvals found in the same audit: "Conversatorio Quebrada
// Honda" and "Catastro Arte Público Constitución" (both literally panel
// talks/"conversatorios," approved with reasoning stretching them into
// "intervención artística participativa"). Fixed to explicitly say
// "reject" for the ambiguous case, consistent with the default-exclude
// philosophy the four content axes already use ("no middle ground"), and
// to name "conversatorios"/generic cultural-day activities as their own
// explicit exclusion — the same class of mistake, but not really an
// "ambiguous artistic intervention" call at all: a panel discussion is
// just not a visual-art exhibition or a performance staged as an artistic
// gesture, regardless of how it's framed.
// Real bug (found 2026-07-30, via a user-requested manual audit of the
// approved/rejected production data): "3° Recital Poético Regional" was
// approved even though Haiku's own curationReasoning admitted the doubt
// ("un recital poético es más cercano a una performance/intervención
// artística que a una exhibición visual tradicional") — a poetry
// recital/reading is a literary format, not a visual-art exhibition or an
// artistic intervention in the sense this policy means, so it should have
// been rejected under the same "ambiguous -> reject" rule already stated
// below, but wasn't named explicitly the way conversatorios/charlas are.
// Fixed by naming it explicitly, same pattern as that earlier fix.
export const ART_SCOPE_POLICY = `Before applying the exclusion axes below, first confirm this event is actually in scope for an art-opening calendar. Included — visual/plastic art exhibitions: painting, drawing, sculpture, printmaking, installations (sound, tactile, or otherwise), and similar visual-art media shown as an exhibition. Included — genuine artistic interventions: a performance or happening staged specifically as an artistic gesture, not as a conventional show — for example a street performance blending dance and theater as a single artistic intervention, an artist inhabiting a public installation, a mass nude-portrait photography event, or a nude-body walk as performance art. Explicitly excluded, regardless of venue prestige or setting: conventional theater plays (in their usual theater format), concerts, gigs ("tocatas"), and dance performances in their traditional format/venue — even at a legitimate cultural center that also hosts real exhibitions. Also explicitly excluded: conversatorios, charlas, mesas redondas, or presentaciones de libros (a discussion or talk is not a visual-art exhibition or a performance staged as an artistic gesture, even when it's about art, has musical accompaniment, or is framed as "participatory"), poetry recitals or spoken-word readings ("recital poético," a literary reading is not a visual-art exhibition or a performance staged as an artistic gesture, even when described as "expresión artística"), and generic cultural/heritage days or community festivals ("Día de los Patrimonios," "Fiesta a la Chilena," and similar) unless the specific activity being reported is itself a visual-art exhibition or genuine artistic intervention, not just one activity among many at a broader cultural event. The test is the format, not the medium or the venue: is this a genuine artistic intervention or a visual-art exhibition, or is it a conventional performing-arts show, talk, or generic cultural gathering being staged as usual? The latter is out of scope even when it shares elements (body, music, dance, "art") with what is accepted. If it's ambiguous whether something is a genuine artistic intervention or essentially a themed concert/show/talk with visual elements, reject it — status is strictly binary (approved/rejected), there is no intermediate review tier, so treat scope ambiguity the same default-exclude way the content axes below already do: no middle ground. If it's clearly a conventional theater play, concert, gig, talk, or show with no artistic-intervention framing, use "rejected" — out of scope, not merely low-priority.`;

// Mirrors docs/curation-policy.md's "Operational instruction for Claude
// Haiku's system prompt" block, ported verbatim — kept in sync with that
// doc, not re-derived independently. Axes 1-4 only; axis 5 is separate
// (see VISION_AXIS5_POLICY) because it needs the actual image, not text.
export const TEXT_CURATION_POLICY = `Apply a default-exclusion policy across four axes: (1) religion — explicit religious imagery or themes, especially Christian or Jewish; Buddhism is evaluated case by case with a more permissive standard, but isn't automatically included; (2) war or extreme violence; (3) far right or authoritarian ideologies; (4) pseudoscience and superstition (tarot, esotericism, energy healing, and similar). For any of these four axes, the default decision is EXCLUDE. The only exception is when the event declares an explicit and unambiguous critical stance against that specific institution, ideology, or conflict — for example, an installation that explicitly denounces the Church's economic power, or an exhibit with an explicit curatorial statement denouncing an occupation or a dictatorship. "Exploring," "reflecting on," "contextualizing," "documenting," or showing ambiguous aesthetic/curatorial distance isn't enough — without an explicit, declared rejection stance, the event is excluded. There's no middle ground: either the event explicitly criticizes the institution/ideology/conflict, or it's excluded, regardless of artistic quality or the venue's prestige.`;

// Structured axis reporting, added 2026-09-07 alongside the removal of
// the cross-source escalation flow (see docs/curation-policy.md).
//
// This changes NOTHING about what gets excluded — the editorial rules in
// TEXT_CURATION_POLICY above are byte-identical. It only asks Haiku to
// NAME which axis it applied when it rejects on one, so code downstream
// has a structured signal instead of having to parse free prose.
//
// Why it has to be structured: the cross-source safety net needs to tell
// "rejected BECAUSE of the religion axis" apart from "mentions religion
// while clearing it", and the reasoning text does both constantly. Of the
// rejected_candidates rows mentioning an axis word as of 2026-09-06, a
// fifth mention it only to rule it out ("Temática ecológica sin contenido
// religioso, violento o pseudocientífico", "no religious/ideological
// exclusion issues — purely archaeological"). Any regex over that prose
// would wrongly exclude real events; a field Haiku fills in itself
// doesn't have that failure mode.
export const REJECTION_AXIS_POLICY = `Additionally, whenever you set status to "rejected", report which exclusion axis drove that decision in \`rejectionAxis\`, using EXACTLY one of these values: "religion", "guerra_violencia", "ultraderecha", "pseudociencia", "agresion_explicita", or null. Use null — not a guess — whenever the rejection was for ANY other reason: out of scope (a concert, a talk, a workshop, a convocatoria), missing or unconfirmable dates, an unclear location, a source outside Chile, a duplicate, or anything else that isn't one of the five content axes. This field is a report on the decision you already made, never an input to it: it must never change whether you approve or reject, and it must be null on every approved event. If you rejected for several reasons at once and only one of them is an axis, name that axis.`;

// The five axes as machine values, matching REJECTION_AXIS_POLICY's own
// enumeration. Ordered as docs/curation-policy.md numbers them.
export const REJECTION_AXES = ["religion", "guerra_violencia", "ultraderecha", "pseudociencia", "agresion_explicita"] as const;

export type RejectionAxis = (typeof REJECTION_AXES)[number];

// Anything Haiku returns that isn't exactly one of the five is treated as
// "no axis" rather than trusted — the safety net that consumes this
// must fail OPEN (behave as if there were no axis) rather than exclude on
// a value it doesn't recognise.
export function isRejectionAxis(value: unknown): value is RejectionAxis {
  return typeof value === "string" && (REJECTION_AXES as readonly string[]).includes(value);
}

// Added 2026-08-29, editorial decision by Daniel after a real production
// bug: a "visita guiada junto al artista" post (an already-running
// exhibition's guided tour) got its own date written into
// openingDatetime, indistinguishable from the exhibition's actual
// opening party — the calendar showed it as if the show opened that day.
// Root cause: no concept of event TYPE existed at all, only two date
// shapes (a single dated instance vs. a run range), so ANY confirmed
// dated instance collapsed onto the same field/meaning. These 3
// categories, ordered by how much interaction with the work they
// involve, are Daniel's own framing — keep the language close to his
// wording, it's the actual editorial rationale, not just a technical
// label.
export const EVENT_TYPE_POLICY = `Además de decidir si el evento está dentro de alcance, clasifícalo en UNA de estas 3 categorías (\`eventType\`), ordenadas de mayor a menor interacción con la obra:
1. \`inauguracion\` — la fiesta de apertura misma: el artista, el público y la obra conviviendo en un mismo momento. Es el evento que marca el inicio de la muestra.
2. \`visita_guiada\` — una instancia mediada de una muestra que YA está abierta/corriendo: alguien (el artista u otra persona) guía o acompaña la experiencia, y hay personas viviendo la exposición juntas — pero no es la apertura de la muestra, es una actividad puntual dentro de su exhibición ya en curso (ej. "visita guiada junto al artista este sábado", "recorrido mediado").
3. \`exposicion\` — la muestra en sí, sin una instancia puntual con gente reunida: el espectador se enfrenta solo a la obra, en el horario normal de la sala/galería. Es la categoría por defecto cuando el texto solo confirma que la muestra existe y está corriendo (o corrió), sin describir una fiesta de apertura ni una actividad guiada específica.

Regla dura para no confundir \`inauguracion\` con \`visita_guiada\`: si el texto describe una fiesta/evento de apertura de la muestra (el momento en que la muestra empieza a mostrarse al público por primera vez), es \`inauguracion\`. Si el texto describe una actividad posterior sobre una muestra que el propio texto trata como ya abierta/en curso (aunque la lidere el mismo artista, aunque use la palabra "inauguración" de forma laxa en el copy), es \`visita_guiada\` — el criterio es si la muestra YA estaba abierta antes de esta actividad puntual, no quién la encabeza.

Los talleres siguen completamente excluidos del calendario, sin importar esta clasificación — un taller nunca es \`visita_guiada\` solo porque describe gente reunida en torno a una muestra. Si lo que se anuncia es la actividad de taller en sí (inscripción, cupos, aprender una técnica), rechaza el evento igual que siempre, incluso si ocurre en el marco de una exposición o inauguración real.`;

export const VISION_AXIS5_POLICY = `Apply a fifth axis, independent of the four above: exclude any event whose image shows physical or sexual aggression explicitly (graphic violence, sexual assault, gore), regardless of whether the event has denunciation intent — denunciation only enables inclusion when expressed textually, thematically, or symbolically, not through explicit imagery. This axis is about explicit aggression/violence, not sexuality or nudity in general: artistic nudity, eroticism, or non-violent sexuality aren't excluded by this criterion. If the image is not graphic/explicit under this definition, respond with exactly APPROVE. If it is, respond with exactly REJECT.`;

// Institutional exclusion, independent of the axes above. Previously
// enforced via a separate per-venue classification step (the Event
// Crawler's venue filter, now retired along with the venues table) — Event
// Discovery has no venue entity, so this is judged directly from the
// source text during curation instead.
export const INSTITUTIONAL_EXCLUSION_POLICY = `Independent of and prior to the axes above: if the event's venue/location is explicitly identifiable as a church, temple, or house of worship of any religious cult, or the headquarters of a right-wing or far-right political party, reject it regardless of the event's own content or any critical stance it claims — the calendar's purpose isn't to drive visits to those institutions. This only applies when the institutional nature is explicit and unambiguous (the venue's own name or the source text states it plainly) — don't infer it from indirect signals, and don't let it override an otherwise-clear approval when the institutional nature is merely ambiguous.`;
