-- SPIN XI — database schema
--
-- Run this in the Supabase SQL editor (or via `npm run db:push`), then load
-- archive.sql. Running it again is safe: it rebuilds the tables from scratch.
-- Everything in them comes from archive.sql, so there is nothing to preserve
-- and no migration to get wrong.
--
-- Design notes
-- ------------
--   * A squad is a team in a competition in a season. Not a team in a season:
--     India in 2024 is three different sides — a Test XI, a one-day XI and a
--     T20 XI — and they do not share a team sheet.
--
--   * Nationality is NOT NULL with no default. It is what the overseas cap
--     counts off, and a default is exactly how a silent wrong answer gets in:
--     an unplaced player quietly became Indian and walked into an Indian XI
--     without using an import slot. Better that a bad load fails here.
--
--   * Ratings are stored; averages and strike rates are stored as the counts
--     they came from. A rating is a percentile across everyone who played
--     that format, which is a fact about the population and cannot be
--     recomputed from one row — so it is written down. Runs and balls are
--     facts about the player, so they are kept in the form a scorecard would
--     recognise and divided when needed.
--
--   * Era and prime ratings stay in the client. They are functions of this
--     data rather than facts about it, and storing a derived value only gives
--     it room to disagree with what it was derived from.

/* ── Rebuild ───────────────────────────────────────────────────────────── */

drop view if exists squad_index;
drop view if exists roster_feed;
drop table if exists squad_players cascade;
drop table if exists squads        cascade;
drop table if exists players       cascade;
drop table if exists teams         cascade;
drop table if exists challenges    cascade;

/* ── Teams ─────────────────────────────────────────────────────────────── */

create table teams (
  key         text primary key,                     -- 'MUMBAI', 'INDIA', 'BBL-SYDNEYSIXERS'
  region      text not null
              check (region in ('IN', 'WORLD', 'INTL')),
  home_nation text not null                         -- two-letter code
);

comment on column teams.region is
  'IN = Indian T20 League franchise, WORLD = overseas franchise, INTL = national side. '
  'The league fixture list draws from IN; the Champions Trophy invites the world; '
  'INTL sides play only the international formats.';

/* ── Players ───────────────────────────────────────────────────────────── */

create table players (
  id      text primary key,       -- Cricsheet registry identifier where one exists
  name    text not null,
  surname text not null,          -- shown where a scoreboard would abbreviate
  nation  text not null
);

create index players_nation_idx on players (nation);

/* ── Squad-seasons ─────────────────────────────────────────────────────── */

create table squads (
  id          text primary key,                     -- 'mumbai-ipl-2019'
  team_key    text not null references teams (key) on delete cascade,
  team_name   text not null,                        -- as the side was called that season
  team_short  text not null,
  season      text not null,                        -- '2019'
  competition text not null,                        -- 'T20 LEAGUE 2019'
  formats     text[] not null,                      -- {'T20L'} | {'ODIWC'} | {'TEST'}
  unique (team_key, season, competition)
);

create index squads_team_idx    on squads (team_key);
create index squads_season_idx  on squads (season);
-- Every draft and every fixture list starts by asking which squads can play a
-- given format, and that is an array membership test.
create index squads_formats_idx on squads using gin (formats);

/* ── The roster: TEAM × SEASON × PLAYER ────────────────────────────────── */

create table squad_players (
  squad_id  text not null references squads (id)  on delete cascade,
  player_id text not null references players (id) on delete cascade,

  role      text not null check (role in ('BAT', 'WK', 'AR', 'PACE', 'SPIN')),
  alt_roles text[] not null default '{}',

  -- Percentile ratings, 40–99, against everyone who played the same format.
  ovr       smallint not null check (ovr  between 40 and 99),
  bat       smallint          check (bat  between 40 and 99),
  bowl      smallint          check (bowl between 40 and 99),

  -- The three numbers the player card shows. What they mean depends on the
  -- role — BAT/CONS/SR for a batter, GUILE/WKT/ECON for a spinner — which is
  -- why they are numbered rather than named. Null where the player did too
  -- little of the relevant thing to rate honestly.
  s1        smallint check (s1 between 20 and 99),
  s2        smallint check (s2 between 20 and 99),
  s3        smallint check (s3 between 20 and 99),

  -- The record the ratings were computed from, as a scorecard would print it.
  matches    smallint not null check (matches    >= 0),
  runs       integer  not null check (runs       >= 0),
  balls      integer  not null check (balls      >= 0),
  outs       smallint not null check (outs       >= 0),
  wickets    smallint not null check (wickets    >= 0),
  bowl_balls integer  not null check (bowl_balls >= 0),
  bowl_runs  integer  not null check (bowl_runs  >= 0),

  -- One row per player per squad: a duplicate would bat twice in an innings.
  primary key (squad_id, player_id)
);

create index squad_players_squad_idx  on squad_players (squad_id);
create index squad_players_player_idx on squad_players (player_id);

/* ── Daily challenges ──────────────────────────────────────────────────── */

-- The day's puzzle is a rotation rather than a row per date, so everyone gets
-- the same challenge on the same day without a calendar to keep topped up.
create table challenges (
  slot           smallint primary key,
  format         text not null check (format in ('T20L', 'ODIWC', 'T20WC', 'TEST')),
  preset_id      text not null,
  objective      text not null,
  objective_desc text not null,
  active         boolean not null default true
);

/* ── Cache versioning and provenance ───────────────────────────────────── */

-- The client caches the whole archive. This is how it knows to throw that
-- cache away: any edit to any table below bumps the version, so a rating
-- corrected in the Supabase editor reaches players on their next load.
-- The one table that is not rebuilt. Dropping it would issue a fresh version
-- and expire every client's cache for no reason, so it is migrated in place.
create table if not exists dataset_meta (
  id         boolean primary key default true check (id),
  version    uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);

-- Added after the first release: "create table if not exists" leaves an
-- existing table exactly as it was, columns and all, so new ones arrive here.
alter table dataset_meta add column if not exists source text;
alter table dataset_meta add column if not exists note   text;

insert into dataset_meta (id, source, note)
values (true, 'https://cricsheet.org',
        'Ratings are percentiles within a format, computed from ball-by-ball data.')
on conflict (id) do update set source = excluded.source, note = excluded.note;

create or replace function bump_dataset_version() returns trigger
  language plpgsql security definer as $$
begin
  update dataset_meta set version = gen_random_uuid(), updated_at = now() where id;
  return null;
end $$;

create trigger teams_bump          after insert or update or delete on teams
  for each statement execute function bump_dataset_version();
create trigger players_bump        after insert or update or delete on players
  for each statement execute function bump_dataset_version();
create trigger squads_bump         after insert or update or delete on squads
  for each statement execute function bump_dataset_version();
create trigger squad_players_bump  after insert or update or delete on squad_players
  for each statement execute function bump_dataset_version();
create trigger challenges_bump     after insert or update or delete on challenges
  for each statement execute function bump_dataset_version();

/* ── Reads ─────────────────────────────────────────────────────────────── */

-- The whole archive, flattened, so the client joins nothing.
create view roster_feed as
select
  s.id as squad_id, s.team_key, s.team_name, s.team_short, s.season,
  s.competition, s.formats, t.region,
  sp.player_id, p.name, p.surname, p.nation,
  sp.role, sp.alt_roles, sp.ovr, sp.bat, sp.bowl, sp.s1, sp.s2, sp.s3,
  sp.matches, sp.runs, sp.balls, sp.outs, sp.wickets, sp.bowl_balls, sp.bowl_runs
from squad_players sp
  join squads  s on s.id  = sp.squad_id
  join players p on p.id  = sp.player_id
  join teams   t on t.key = s.team_key;

-- One row per squad, with the strength figures the fixture list picks on, so
-- the game can choose its opponents without downloading every roster first.
-- The three cuts match how a side is actually judged: its top order, its
-- front-line attack, and its best XI.
create view squad_index as
select
  s.id, s.team_key, s.team_name, s.team_short, s.season, s.competition,
  s.formats, t.region,
  count(*)::int as player_count,
  (select round(avg(x.ovr))  from (select ovr  from squad_players where squad_id = s.id
     order by ovr  desc limit 6) x)::int as ovr_top6,
  (select round(avg(x.bat))  from (select bat  from squad_players where squad_id = s.id
     and bat  is not null order by bat  desc limit 4) x)::int as bat_top4,
  (select round(avg(x.bowl)) from (select bowl from squad_players where squad_id = s.id
     and bowl is not null order by bowl desc limit 3) x)::int as bowl_top3
from squads s
  join teams t on t.key = s.team_key
  join squad_players sp on sp.squad_id = s.id
group by s.id, s.team_key, s.team_name, s.team_short, s.season, s.competition,
         s.formats, t.region;

/* ── Row level security ────────────────────────────────────────────────── */

-- The archive is public and read-only. Writes go through the dashboard or a
-- service-role key, never from a browser.

alter table teams         enable row level security;
alter table players       enable row level security;
alter table squads        enable row level security;
alter table squad_players enable row level security;
alter table challenges    enable row level security;
alter table dataset_meta  enable row level security;

create policy "public read" on teams         for select using (true);
create policy "public read" on players       for select using (true);
create policy "public read" on squads        for select using (true);
create policy "public read" on squad_players for select using (true);
create policy "public read" on challenges    for select using (true);
drop policy if exists "public read" on dataset_meta;
create policy "public read" on dataset_meta  for select using (true);

-- The browser reads through PostgREST as "anon". Those roles are created by
-- Supabase, so the grant is guarded: the same file then also applies to a
-- plain Postgres, which is what `npm run db:check` tests it against.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant select on roster_feed, squad_index to anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on roster_feed, squad_index to authenticated;
  end if;
end $$;
