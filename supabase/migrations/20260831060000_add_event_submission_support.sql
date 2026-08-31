-- "Agrega tu expo" — public form so a gallery/espacio can submit its own
-- exposición (with inauguración) directly, curated by Haiku synchronously
-- in the same request as everything else in Event Discovery (same 5 axes
-- + axis5 vision check). See apps/web/src/app/api/submit-event/route.ts
-- and supabase/functions/submit-event. Reuses the existing
-- source='submitted' enum value (defined since the original schema,
-- never actually used until now).

-- pipeline (20260815030000) needs a new value distinguishing form
-- submissions from the scraped/discovered pipelines it was built for.
alter table events drop constraint if exists events_pipeline_check;
alter table events add constraint events_pipeline_check
  check (pipeline in ('comuna_search', 'bright_source', 'instagram', 'google_alerts', 'headless', 'user_submission'));

-- Submitter contact, private — never exposed via events_public (that view
-- lists an explicit column set; these two are simply not in it). Only
-- populated when source = 'submitted'.
alter table events add column submitter_email text;
alter table events add column submitter_name text;

-- public_explanation (in the schema since 20260711171717, never actually
-- written by the scraped pipeline) is repurposed as the polite,
-- educational message shown back to whoever submits the form — approved
-- or rejected — instead of adding a new column for the same purpose.

-- Up to 2 extra images (the first stays in events.image_url, unchanged —
-- every existing display component keeps working as-is). Not yet surfaced
-- anywhere in apps/web; stored so nothing submitted is lost. Only
-- service_role can read/write — no multi-image gallery UI exists yet, so
-- there's no reason for anon/authenticated to see this table.
create table event_images (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  storage_path text not null,
  "position" smallint not null check ("position" in (2, 3)),
  created_at timestamptz not null default now(),
  unique (event_id, "position")
);

create index event_images_event_id_idx on event_images (event_id);

alter table event_images enable row level security;
grant all on event_images to service_role;
