# Caldearte — Curation Policy (operational v2)

> **This file is the protected one.** Per `CLAUDE.md`, changes to this
> document need your review before merging — these are editorial decisions
> made by the two curators, not something to "improve" unilaterally.

Explicit, non-neutral editorial curation, defined by two people (the two
curators): default-exclude across five axes (religion, war/violence, far
right, pseudoscience/superstition, explicit physical/sexual aggression) plus
an institutional-location filter, with an exception only for explicit
critical stance.

Product decision: this specific curatorial stance **is the value
proposition**, not something to hide. It's worth making explicit on the site
itself — shipped as `/privacidad`'s "Cómo curamos" section, see
`apps/web/src/i18n/es-CL.ts`'s `curatoriaText` for the live copy.

## Core rule: default-exclude, no middle ground

It doesn't matter whether the treatment has critical distance from an
aesthetic or "documentary/neutral" standpoint. Aesthetics are a product of
ethics — if the content doesn't convey values aligned with the curation, it's
excluded, no middle ground. The rule is **default-exclude**: any content with
religious, war-related, or far-right imagery or themes is excluded unless the
event takes an **explicit and unambiguous** critical stance against that
specific institution/ideology/conflict. "Half measures" (neutral
documentation, "exploring," "reflecting on," with no clear stance) don't
qualify — they're excluded just like affirmative content.

A fourth axis is added: **pseudoscience and superstition** (tarot, esotericism,
energy healing, and similar), also default-excluded. Buddhism is evaluated
case by case, with a more permissive standard than Christianity/Judaism, but
it's not automatically included.

## Classification examples by axis

| Event title | Short description | Axis | Decision | Why |
|---|---|---|---|---|
| "The Annunciation in Colonial-Era Painting" | A museum exhibit on Marian iconography in colonial painting, focused on technique and historical context. | Religion | **EXCLUDE** | Explicit Christian imagery. Historical/art-critical treatment doesn't qualify — it isn't criticism of the Church as an institution. |
| "A Night of Worship and Art for Christ" | A church hosts an evening of live painting, testimonials, and communal prayer. | Religion | **EXCLUDE** | Explicit evangelizing gathering. |
| "Church Inc.: A Critical Installation on Ecclesiastical Power and Money" | An installation denouncing the financial management of religious institutions, with an explicitly critical curatorial stance. | Religion | **INCLUDE** | Explicit stance against the Church as an institution, not a display of faith or its imagery. |
| "Eyes in the Trench: War Photojournalism 1936–1945" | A retrospective of war photographers, historical memory, and documentary archive, with no stated stance. | War/violence | **EXCLUDE** | "Neutral" documentation/memory doesn't qualify — missing an explicit critical stance against the war or period. |
| "After the Occupation: Art and Memory in Palestine" | An exhibit with an explicit curatorial statement denouncing the occupation and its consequences. | War/violence | **INCLUDE** | Explicit stance of denunciation/criticism, not neutral documentation. |
| "Tribute to Victory: The Heroic Feat" | An exhibit celebrating military glories of one side in a conflict, with a commemorative/exalting tone. | War/violence | **EXCLUDE** | Explicit glorification. |
| "Aesthetics of Fascism: Art, Propaganda, and Warning" | An exhibit displaying authoritarian-regime symbolism with "contextualizing" text, with no declared rejection. | Far right | **EXCLUDE** | Without an unambiguous, declared anti-fascist stance, it's excluded — "contextualizing" or "analyzing" without explicit rejection doesn't qualify. |
| "Gathering of National Identity Art" | An exhibit with the aesthetic of a recognized far-right movement, with no critical distance, calling to "reclaim values." | Far right | **EXCLUDE** | Promotes the ideology with no critical framing. |
| "Stations of the Cross: A Retrospective of [Religious Painter]" | A retrospective of an established artist, including religious Christian-themed work from one period of their career. | Religion | **EXCLUDE** | Explicit religious imagery, even in a recognized retrospective — excluded regardless. |
| "Vigil and Blessing of Images Ahead of the Pilgrimage" | A parish hosts a display of religious imagery as part of a devotional ritual. | Religion | **EXCLUDE** | An act of worship. |
| "Tarot, Cards, and Energy Healing: Exhibitor Fair" | A fair of tarot, energy reading, and esoteric-practice exhibitors. | Pseudoscience/superstition | **EXCLUDE** | Esoteric/pseudoscientific content with no critical framing. |

## Institutional exclusion (independent of content)

There is no venue entity: every event has a freeform `location` (see
[region-discovery.md](region-discovery.md)), and this filter is judged
directly from the source text during Event Discovery's own curation call —
not a separate per-venue classification step. It's independent from, and
takes priority over, the content filter: even if the event itself had an
explicit critical stance (e.g. the "Church Inc." example above), if the
location is literally a temple or a party headquarters, it's excluded
anyway — the calendar's purpose isn't to drive visits to those institutions.

Excludes any event whose venue/location is **explicitly and unambiguously**
identifiable as: a church, temple, or house of worship of any religious
cult; or the headquarters of a right-wing or far-right political party.
Applies only when the source text states this plainly (the venue's own
name, or an explicit statement) — not inferred from indirect signals. When
it's merely ambiguous, this filter doesn't force a rejection; ordinary
curation on the event's own content still applies. There's no
human-escalation path for this filter — Event Discovery's `status` is
binary (approved/rejected), unlike the Event Crawler's old three-state
flow, and as of 2026-09-07 there is no human escalation path anywhere in
curation (see "Cross-source axis safety net" below).

This is unrelated to the Chile-location whitelist in region-discovery.md,
which is a *geographic* check (is this really in Chile?), not an
institutional one.

Coverage is not restricted to formal art circuits: interventions/art in
urban and street spaces, cultural centers, community centers, and
neighborhood associations are exactly as valid as an opening at an
established gallery. This filter only excludes institutions aligned with
what the content policy already rejects (temples, party headquarters).

## Axis 5: explicit physical and sexual aggression (different from the other four)

Excludes any event whose visual content shows physical or sexual aggression
in an **explicit** way (graphic images of violence, sexual assault, gore) —
unlike the other four axes, here **denunciation intent does not enable
inclusion if the image is explicit**. Denunciation is included when handled
textually, thematically, or symbolically, without explicit imagery (e.g. an
exhibit on gender violence using non-graphic documentary photography,
testimonials, or symbolic work).

Important scope clarification, to avoid over-excluding: this axis is about
**aggression/violence**, not sexuality or nudity in general. Artistic nudity,
eroticism, or non-violent sexuality don't fall under this axis — they're a
normal part of the visual-art repertoire and aren't excluded by this
criterion. Worth stating explicitly in the prompt so the model doesn't
confuse "sexual content" in general with "explicit sexual aggression."

Architectural implication: this axis is the clearest use case for the vision
call already planned as optional Phase 3 hardening — that's where it's
actually possible to evaluate whether the chosen image is graphic, not just
whether "this is real art." Worth bringing that check forward to Phase 1 for
this specific axis (not for general image quality control), because here the
cost of a false negative — showing an explicit image on the calendar — is
higher than on the other axes, which are text-only.

## Operational instruction for Claude Haiku's system prompt

> Apply a default-exclusion policy across four axes: (1) religion — explicit
> religious imagery or themes, especially Christian or Jewish; Buddhism is
> evaluated case by case with a more permissive standard, but isn't
> automatically included; (2) war or extreme violence; (3) far right or
> authoritarian ideologies; (4) pseudoscience and superstition (tarot,
> esotericism, energy healing, and similar). For any of these four axes, the
> default decision is **EXCLUDE**. The only exception is when the event
> declares an **explicit and unambiguous** critical stance against that
> specific institution, ideology, or conflict — for example, an installation
> that explicitly denounces the Church's economic power, or an exhibit with
> an explicit curatorial statement denouncing an occupation or a
> dictatorship. "Exploring," "reflecting on," "contextualizing,"
> "documenting," or showing ambiguous aesthetic/curatorial distance isn't
> enough — without an explicit, declared rejection stance, the event is
> excluded. There's no middle ground: either the event explicitly criticizes
> the institution/ideology/conflict, or it's excluded, regardless of
> artistic quality or the venue's prestige.
>
> Also apply a fifth axis, independent of the logic above: exclude any event
> whose image shows physical or sexual aggression explicitly (graphic
> violence, sexual assault, gore), regardless of whether the event has
> denunciation intent — denunciation only enables inclusion when expressed
> textually, thematically, or symbolically, not through explicit imagery.
> This axis is about explicit aggression/violence, not sexuality or nudity in
> general: artistic nudity, eroticism, or non-violent sexuality aren't
> excluded by this criterion.

*Implementation note: this system prompt is presented here in English for
documentation consistency; the actual Event Discovery prompt
(`apps/curator/src/event-discovery/discover.ts`) is written in Spanish —
Claude handles Spanish-language event descriptions equally well either
way.*

## Cross-source axis safety net — replaced the escalation flow, 2026-09-07

**The rule:** when two different sources describe what is likely the same
real event (similar title + same región + anchor dates within ±30 days,
different source URL) and disagree, **if either side rejected on one of
the five axes, the event stays out** — whichever source was crawled
first. Everything else flows through the ordinary dedup path.

Concretely, in both directions:

- A candidate about to be **approved**, when another source's rejection
  of the same event named an axis → not published (`axis_blocked`).
- A candidate being **rejected on an axis**, when a vaguer source already
  got the same event **approved onto the calendar** → that published
  event is **soft-removed** (the same `removed_at`/`removed_reason`
  columns the admin "Quitar" button writes, so it stays visible and
  reversible in admin, not deleted).

This is the same default-exclude principle as the Core rule above, just
applied across sources instead of within one.

**What it replaced.** From 2026-07-30 to 2026-09-07 this was a *human*
escalation: both versions were emailed to the site owner with
Accept/Reject links, and the existing decision stayed untouched until one
was clicked. Daniel's call to remove it, 2026-09-07, after reviewing
every conflict it ever produced:

- It fired **15 times in 5 weeks and not one was ever resolved.** The
  de-facto behaviour was always "keep the existing decision."
- **14 of the 15 were not editorial disagreements at all.** They were the
  same event described with different metadata completeness in two
  sources, where a *code* filter (date completeness, grounding, location
  whitelist) forced one side to `rejected` while Haiku judged both in
  scope. The clearest is "Albergue Transitorio" (Espacio O, 2026-09-06),
  where both sides' reasoning explicitly clears all five axes — there was
  nothing for a human to decide, and holding it kept a real exhibition
  off the calendar.
- **1 of the 15 was genuine**: "Existen otros mundos, pero están en este"
  (2026-08-17) — a more detailed source revealed religious imagery the
  vaguer one never surfaced. The default was right there, but **only by
  luck of crawl order.** Reversed, "keep the existing" would have left an
  axis-disqualified event published.

So the human step is gone and the ordering luck with it. The one case
that genuinely needed protecting is now enforced deterministically, and
the other fourteen no longer generate an email or hold up a real event.

**How the axis is known.** Haiku reports it directly, in a
`rejectionAxis` field on its own output (`packages/curation-policy`'s
`REJECTION_AXIS_POLICY`), stored on `rejected_candidates.rejection_axis`.
**This changed nothing about what gets excluded** — the editorial rules
above are byte-identical; Haiku is only asked to *name* the axis it
already applied, and the field is explicitly a report on the decision,
never an input to it.

It has to be structured rather than parsed out of the reasoning prose,
because that prose mentions the axes in both directions constantly: as of
2026-09-06, about a fifth of the rejection reasons containing an axis
word used it only to **rule the axis out** ("Temática ecológica sin
contenido religioso, violento o pseudocientífico"; "no
religious/ideological exclusion issues — purely archaeological"). Any
regex over that text would have wrongly excluded real events.

The net **fails open** by construction: it acts only on an explicit,
recognised axis value. A null, unrecognised or missing axis — including
every `rejected_candidates` row written before 2026-09-07 — means no
action at all, i.e. exactly the plain "keep the existing decision"
default that was in effect for those 5 weeks anyway. Older rows age out
via the existing 90-day prune.

See
[region-discovery.md](region-discovery.md#cross-source-axis-safety-net-2026-09-07)
for the technical detail.

## Human escalation for general ambiguity: not currently implemented

Event Discovery (the only pipeline in production) uses a binary
`approved`/`rejected` decision — there's no `pending_review` tier today.
Ambiguous cases currently fall through to ordinary curation rather than
escalating to a human. Whether to add a broader escalation tier for
Haiku's own uncertainty (distinct from the cross-source conflict case
above, which is now handled deterministically, with no human in the
loop) is an open question, not decided either way yet. The 2026-09-07
removal of the cross-source escalation is a data point for it: the one
human-review flow this project actually shipped went 15-for-15
unanswered, which is worth weighing before building another. Candidate signals for it, if it's ever built:

- The event appears to meet the exception (explicit critical stance) but the
  text isn't clear enough to confirm the rejection is unambiguous and not
  just "contextualization" or aesthetic distance.
- Insufficient context: a very short description, no image, or curatorial
  text that doesn't allow determining whether there's an explicit stance.
- The event mixes axes (e.g. explicit criticism of a dictatorship that also
  uses religious symbolism) and it isn't obvious how to weigh each one.
- Cases involving Buddhism or other non-Christian/non-Jewish traditions,
  where it's unclear whether the more permissive standard applies.
- It's unclear whether an image is "explicit" or is non-graphic artistic
  treatment of a violence/aggression theme.
- Any case where the model itself would otherwise be forcing a low-confidence
  binary decision.
