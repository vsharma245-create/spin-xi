/*
 * SPIN XI — what happened, as opposed to what was achieved.
 *
 * players.sql records finished seasons, which is the right thing for ladders
 * and the wrong thing for understanding the game. Fifteen accounts and two
 * results says almost nothing on its own: it cannot distinguish somebody who
 * abandoned a draft halfway from somebody who never pressed start from
 * somebody who hit an error, because only the finish was ever written down.
 *
 * Kept apart from players.sql deliberately. Nothing here is read by a ladder,
 * a profile or a board, so a mistake in this file cannot cost anybody their
 * record. Run it after players.sql; it is safe to re-run.
 */

/* ── Coming back ───────────────────────────────────────────────────────── */

-- Retention is the number that matters for a daily game, and created_at alone
-- cannot answer it: every account looks identical the day after it was made.
alter table profiles add column if not exists last_seen_at timestamptz;
alter table profiles add column if not exists first_result_at timestamptz;

create index if not exists profiles_last_seen_idx on profiles (last_seen_at desc nulls last);

/* ── What a finished season cost ───────────────────────────────────────── */

-- The home page claims three minutes to a full XI. This is how that claim
-- becomes checkable rather than a hope.
alter table results add column if not exists duration_ms integer
  check (duration_ms is null or duration_ms between 0 and 86400000);

-- Ratings are recomputed when the archive is rebuilt, and a season played
-- against the old numbers is not strictly comparable with one played against
-- the new. Without this, that difference is invisible for ever afterwards.
alter table results add column if not exists dataset_version uuid;

/* ── The parts of a session that are not a result ──────────────────────── */

/*
 * One row per thing that happened. Deliberately thin: a name, who it belonged
 * to, and a small bag of detail whose shape depends on the name. A wide table
 * with a column per question would need a migration every time a new question
 * occurred to somebody, and this is exactly the kind of data whose questions
 * are not known in advance.
 *
 * No update or delete policy, same as results: a client that can rewrite its
 * own history can rewrite anybody's conclusions.
 */
create table if not exists events (
  id       bigint generated always as identity primary key,
  player   uuid not null references profiles (id) on delete cascade,

  -- Which names are allowed is settled below, not here. See the note there.
  name     text not null,

  -- Which draft this belonged to, so a started and an abandoned row can be
  -- matched up without guessing from timestamps.
  draft_id uuid,

  -- Format, preset, difficulty, how many picks were made before leaving —
  -- whatever the event has to say. Capped so a client cannot post an essay.
  detail   jsonb not null default '{}'::jsonb
             check (pg_column_size(detail) < 2048),

  created_at timestamptz not null default now()
);

create index if not exists events_player_idx on events (player, created_at desc);
create index if not exists events_name_idx   on events (name, created_at desc);
create index if not exists events_draft_idx  on events (draft_id) where draft_id is not null;

/*
 * The permitted event names, dropped and re-added on every push.
 *
 * They used to live in the `create table if not exists` above, which does
 * exactly nothing when the table is already there — constraint included. So
 * adding a name to that list changed nothing on any database that had ever
 * been pushed to before, and the client sending the new name got a 23514 back
 * for its trouble. This is the only version of it that is actually applied.
 *
 * The old constraint is found by what it says rather than by what it is
 * called, because Postgres named it itself the first time.
 */
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'events'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%draft_started%'
  loop
    execute format('alter table events drop constraint %I', c);
  end loop;
end $$;

alter table events add constraint events_name_check check (name in (
  'draft_started',
  'draft_abandoned',
  'draft_completed',
  'season_simulated',
  'account_claimed',
  'handle_changed',
  -- A season sent somewhere, and a season arrived at from one. Both halves,
  -- because a share nobody opens is not growth and an arrival with nothing
  -- sent cannot be attributed to anything.
  'result_shared',
  'challenge_opened'
));

alter table events enable row level security;

drop policy if exists "own event insert" on events;
drop policy if exists "events are private" on events;

-- A player may record their own activity and nobody else's.
create policy "own event insert" on events for insert with check (auth.uid() = player);

-- Nothing reads these from the browser. Analysis happens in the SQL editor,
-- where the service role is not bound by row level security, so no select
-- policy is granted at all: one player cannot enumerate another's session.
create policy "events are private" on events for select using (false);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant insert on events to anon, authenticated;
    grant usage, select on all sequences in schema public to anon, authenticated;
  end if;
end $$;

/* ── The funnel, ready to read ─────────────────────────────────────────── */

/*
 * Started, abandoned and finished per day. The question that fifteen accounts
 * and two results could not answer.
 */
create or replace view funnel_daily as
select
  date_trunc('day', created_at)::date                          as day,
  count(*) filter (where name = 'draft_started')::int          as started,
  count(*) filter (where name = 'draft_abandoned')::int        as abandoned,
  count(*) filter (where name = 'draft_completed')::int        as completed,
  count(distinct player)::int                                  as players
from events
group by 1
order by 1 desc;

/* Accounts that came back on a later day than the one they were made on. */
create or replace view retention as
select
  created_at::date                                             as cohort,
  count(*)::int                                                as accounts,
  count(*) filter (where last_seen_at::date > created_at::date)::int as returned,
  count(*) filter (where first_result_at is not null)::int     as played
from profiles
group by 1
order by 1 desc;
