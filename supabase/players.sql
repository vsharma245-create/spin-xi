-- SPIN XI — players, and what they have done
--
-- Run this once. Unlike schema.sql it is **additive and never dropped**: the
-- cricket archive is rebuilt from Cricsheet whenever the data improves, and
-- that rebuild wipes and reloads every table it owns. Player accounts cannot
-- live in the same file as something designed to be deleted.
--
-- Design notes
-- ------------
--   * A profile holds almost nothing. Experience, levels, streaks, records and
--     ladder position are all *derived from results*, because a stored total
--     and the rows it came from will disagree eventually, and when they do
--     there is no way to tell which was right.
--
--   * Results are append-only. There is no update or delete policy, so a
--     season, once played, is a fact. That is most of an anti-cheat story: a
--     player can post a result but cannot revise one.
--
--   * Every result carries the seed and the XI it was played with. The
--     simulation is deterministic, so a claimed season can be replayed and
--     checked later without having to trust the client now.

/* ── Who ───────────────────────────────────────────────────────────────── */

create table if not exists profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  -- Shown on ladders. Generated at first launch so nobody meets a signup form.
  handle     text not null unique check (char_length(handle) between 2 and 24),
  created_at timestamptz not null default now()
);

/* ── What they did ─────────────────────────────────────────────────────── */

create table if not exists results (
  id        uuid primary key default gen_random_uuid(),
  player    uuid not null references profiles (id) on delete cascade,

  format    text not null check (format in ('T20L', 'ODIWC', 'T20WC', 'TEST')),
  -- 'trophy' is the Champions Trophy: three knockout ties, not a season, so it
  -- is kept off the season boards while still counting toward a career.
  mode      text not null check (mode in ('quick', 'daily', 'trophy')),
  -- Set for daily runs: the day everyone shared a draw.
  daily_key date,

  -- The settings it was played under. Two seasons are only comparable when
  -- these match, so a ladder can be split by them rather than pretending a
  -- run on Easy is the same as one on Hard.
  preset_id   text not null,
  rating_mode text not null check (rating_mode in ('SEASON', 'PRIME')),
  difficulty  text not null check (difficulty in ('EASY', 'NORMAL', 'HARD')),
  from_year   smallint,
  to_year     smallint,
  world_teams boolean not null default true,

  -- What happened.
  wins     smallint not null check (wins   >= 0),
  losses   smallint not null check (losses >= 0),
  draws    smallint not null check (draws  >= 0),
  runs     integer  not null check (runs    >= 0),
  wickets  smallint not null check (wickets >= 0),
  nrr      numeric(6, 3) not null default 0,
  standing smallint,
  outcome  text not null,
  perfect  boolean not null default false,

  -- What it is worth: results, runs and wickets, and that score against par.
  points  integer  not null check (points > 0),
  idx     smallint not null,

  team_name text not null default 'YOUR XI',

  -- Enough to replay it. The simulation is deterministic, so these are all a
  -- verifier would need to recompute the season and compare.
  seed bigint,
  xi   jsonb,

  /*
   * Set when the season is an entry in a league.
   *
   * Declared here rather than in multiplayer.sql because the ladder below
   * filters on it, and a view cannot reference a column added by a file that
   * runs afterwards. The reference to leagues is added with that table.
   */
  league_id uuid,
  -- Set when the season came out of a live draft. Same reasoning as a league:
  -- somebody else's room, somebody else's rules.
  room_id uuid,
  seat    smallint,
  round   smallint,

  created_at timestamptz not null default now()
);

-- Added after the first release, for databases created before leagues existed.
alter table results add column if not exists league_id uuid;
alter table results add column if not exists room_id uuid;
alter table results add column if not exists seat smallint;
alter table results add column if not exists round smallint;

-- Added after the first release: 'trophy' joined the modes, and a database
-- that already exists keeps the constraint it was created with.
alter table results drop constraint if exists results_mode_check;
alter table results add constraint results_mode_check
  check (mode in ('quick', 'daily', 'trophy'));

create index if not exists results_player_idx on results (player, created_at desc);
create index if not exists results_board_idx  on results (format, points desc);
create index if not exists results_daily_idx  on results (daily_key, points desc)
  where daily_key is not null;

-- One daily per player per day. The daily is a shared contest; entering it
-- repeatedly until the draw goes your way is not the same game.
create unique index if not exists results_one_daily_idx
  on results (player, daily_key) where daily_key is not null;

/* ── Derived views ─────────────────────────────────────────────────────── */

/**
 * Dropped before they are created, every time.
 *
 * "create or replace view" cannot rename or reorder a column — it will only
 * accept a definition whose column list starts exactly as the old one did. So
 * adding a field anywhere but the end fails on any database that already has
 * the view, which is every database except a brand new one. Views hold no
 * data; dropping them costs nothing and makes this file survive its own
 * evolution.
 *
 * Order matters: ladder reads player_stats, so it goes first.
 */
drop view if exists ladder;
drop view if exists daily_board;
drop view if exists player_splits;
drop view if exists player_stats;

/* ── Derived: everything a profile screen shows ────────────────────────── */

create view player_stats as
select
  p.id,
  p.handle,
  p.created_at,
  count(r.id)::int                                        as drafts,
  coalesce(sum(r.wins), 0)::int                           as wins,
  coalesce(sum(r.losses), 0)::int                         as losses,
  coalesce(sum(r.draws), 0)::int                          as draws,
  coalesce(sum(r.runs), 0)::int                           as runs,
  coalesce(sum(r.wickets), 0)::int                        as wickets,
  count(*) filter (where r.outcome = 'CHAMPIONS')::int    as trophies,
  count(*) filter (where r.perfect)::int                  as perfect_runs,
  coalesce(max(r.wins), 0)::int                           as best_wins,
  -- Experience is the points a season scored, plus what points alone
  -- under-reward: a title, and an unbeaten season.
  coalesce(
    sum(
      r.points
        + case when r.outcome = 'CHAMPIONS' then 250 else 0 end
        + case when r.perfect then 500 else 0 end
    ),
    0
  )::int as xp
from profiles p
  left join results r on r.player = p.id
group by p.id, p.handle, p.created_at;

/* ── Derived: a career, split the ways that make runs comparable ───────── */

/**
 * The same career cut three ways: by tournament, by rating mode, by
 * difficulty.
 *
 * One long table rather than three views, because a profile screen wants all
 * of them at once and three round trips to draw one page is three too many.
 * `kind` says which cut a row belongs to and `key` says which bucket.
 *
 * They are kept apart because summing them hides what they are made of: a
 * hundred wins says nothing about whether they came in T20 leagues on Easy or
 * Test championships with the ratings hidden.
 */
create view player_splits as
with runs as (
  select
    player, format, rating_mode, difficulty,
    wins, losses, draws, runs, wickets, points, outcome, perfect, nrr
  from results
  -- Leagues are left out for the same reason they are left off the ladder:
  -- these splits sit beside a public rating, and a season played under
  -- somebody else's rules does not describe how you draft.
  where mode <> 'trophy' and league_id is null and room_id is null
)
select player, 'format' as kind, format as key,
       count(*)::int as drafts,
       sum(wins)::int as wins, sum(losses)::int as losses, sum(draws)::int as draws,
       sum(runs)::int as runs, sum(wickets)::int as wickets,
       count(*) filter (where outcome = 'CHAMPIONS')::int as trophies,
       count(*) filter (where perfect)::int as perfect_runs,
       max(points)::int as best_points, max(wins)::int as best_wins,
       max(nrr) as best_nrr
from runs group by player, format
union all
select player, 'rating_mode', rating_mode,
       count(*)::int, sum(wins)::int, sum(losses)::int, sum(draws)::int,
       sum(runs)::int, sum(wickets)::int,
       count(*) filter (where outcome = 'CHAMPIONS')::int,
       count(*) filter (where perfect)::int,
       max(points)::int, max(wins)::int, max(nrr)
from runs group by player, rating_mode
union all
select player, 'difficulty', difficulty,
       count(*)::int, sum(wins)::int, sum(losses)::int, sum(draws)::int,
       sum(runs)::int, sum(wickets)::int,
       count(*) filter (where outcome = 'CHAMPIONS')::int,
       count(*) filter (where perfect)::int,
       max(points)::int, max(wins)::int, max(nrr)
from runs group by player, difficulty;

/* ── Derived: the ladders ──────────────────────────────────────────────── */

-- A player's best season in each tournament, which is what a board ranks.
-- Career experience rides along so a board can show what level each player is,
-- which is a fact about them rather than about the season being ranked.
create view ladder as
select distinct on (r.player, r.format)
  r.player,
  p.handle,
  s.xp,
  r.format,
  r.points,
  r.runs,
  r.wickets,
  r.wins,
  r.losses,
  r.draws,
  r.nrr,
  r.perfect,
  r.created_at
from results r
  join profiles p on p.id = r.player
  join player_stats s on s.id = r.player
-- Seasons only, and public ones.
--
-- A three-tie invitational on the same board as a fourteen-game league reads
-- as a very short season rather than a different thing. A league season is
-- the same argument from the other side: it was played under rules somebody
-- else chose, against a field of their mates, and it belongs on their table
-- rather than silently ranking you against strangers who never agreed to
-- those rules. Both still count toward a career, which is where the playing
-- is recorded.
where r.mode <> 'trophy' and r.league_id is null and r.room_id is null
order by r.player, r.format, r.points desc, r.created_at asc;

-- The daily: one shared draw, so the fairest contest the game has.
create view daily_board as
select
  r.daily_key,
  r.player,
  p.handle,
  r.format,
  r.points,
  r.runs,
  r.wickets,
  r.wins,
  r.losses,
  r.draws,
  r.nrr,
  r.perfect,
  r.created_at
from results r
  join profiles p on p.id = r.player
where r.daily_key is not null;

/* ── Row level security ────────────────────────────────────────────────── */

alter table profiles enable row level security;
alter table results  enable row level security;

drop policy if exists "profiles are public" on profiles;
drop policy if exists "own profile insert"  on profiles;
drop policy if exists "own profile update"  on profiles;
drop policy if exists "results are public"  on results;
drop policy if exists "own result insert"   on results;

-- Handles appear on ladders, so profiles are readable by everyone.
create policy "profiles are public" on profiles for select using (true);
create policy "own profile insert"  on profiles for insert with check (auth.uid() = id);
create policy "own profile update"  on profiles for update using (auth.uid() = id);

-- Results are public to read and only ever yours to write. There is
-- deliberately no update or delete policy: a season, once played, is a fact.
create policy "results are public" on results for select using (true);
create policy "own result insert"  on results for insert with check (auth.uid() = player);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant select on player_stats, player_splits, ladder, daily_board to anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on player_stats, player_splits, ladder, daily_board to authenticated;
  end if;
end $$;
