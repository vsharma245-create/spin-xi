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
drop materialized view if exists roster_pages;
drop view if exists roster_feed;
drop table if exists squad_players cascade;
drop table if exists squads        cascade;
drop table if exists partnerships  cascade;
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

/*
 * A player, as against a player-season.
 *
 * squad_players holds what somebody did in one summer; this holds who they
 * were. The distinction matters because a single season is often too thin to
 * say: a spinner who bowled nothing on one tour reads as a batter, and a
 * batter who sent down a few overs reads as a bowler. The career answers that,
 * and a season only overrules it when the season has enough behind it to.
 */
create table players (
  id      text primary key,       -- Cricsheet registry identifier where one exists
  name    text not null,
  surname text not null,          -- shown where a scoreboard would abbreviate
  nation  text not null,

  -- What they were across everything they played, from career totals rather
  -- than any one season. The anchor a thin season falls back to.
  primary_role text not null check (primary_role in ('BAT', 'WK', 'AR', 'PACE', 'SPIN')),

  -- Their best season, and where it happened.
  peak_ovr     smallint not null check (peak_ovr between 40 and 99),
  peak_season  text     not null,
  peak_format  text     not null,

  -- The side they are most associated with, and what kind of side it is:
  -- IN = Indian T20 League franchise, WORLD = overseas franchise, INTL = country.
  main_team_key text not null,
  main_team     text not null,
  team_type     text not null check (team_type in ('IN', 'WORLD', 'INTL')),

  -- What the career adds up to.
  seasons  smallint not null,
  matches  integer  not null,
  runs     integer  not null,
  wickets  integer  not null
);

/*
 * Two players who have actually batted together, and for how long.
 *
 * Not a table of who got on with whom — that would be an opinion typed into
 * the data. Every delivery in the archive names the striker and the man at the
 * other end, so this is only what happened: how many balls two players have
 * spent at opposite ends, and how many runs came while they were there. The
 * difference between "once teammates" and "an opening pair who know each
 * other's running" is the number in this table.
 */
create table partnerships (
  player_a text not null references players (id) on delete cascade,
  player_b text not null references players (id) on delete cascade,
  balls    integer not null check (balls > 0),
  runs     integer not null check (runs >= 0),
  primary key (player_a, player_b)
);

create index partnerships_a_idx on partnerships (player_a);
create index partnerships_b_idx on partnerships (player_b);

create index players_primary_role_idx on players (primary_role);
create index players_team_type_idx    on players (team_type);

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
/*
 * The challenges table deliberately has no such trigger.
 *
 * The other four hold the archive, and a change to any of them genuinely means
 * every cached copy is out of date. The daily rotation is not part of the
 * archive: it is fetched live on every load and needs no cache-busting.
 *
 * Worse, it cannot have one. The version is the build id that archive.sql and
 * public/archive.json are both stamped with, and it is what pairs them — a
 * client whose cached copy carries that id knows it is current. db:push runs
 * archive.sql, which stamps the id, and then challenges.sql, which rebuilds
 * the rotation; with a trigger here that rebuild fired last and replaced the
 * id with a random one. Every push left the database claiming an archive
 * version that existed nowhere, so any client falling back to the database was
 * told its copy was stale and re-read all forty-three pages to be handed
 * exactly the rows it already had.
 */

/* ── Reads ─────────────────────────────────────────────────────────────── */

-- The whole archive, flattened, so the client joins nothing.
create view roster_feed as
select
  s.id as squad_id, s.team_key, s.team_name, s.team_short, s.season,
  s.competition, s.formats, t.region,
  sp.player_id, p.name, p.surname, p.nation,
  -- Who the player was across their whole career, carried alongside what they
  -- did in this one season, so a card can show both.
  p.primary_role, p.peak_ovr, p.peak_season, p.peak_format,
  p.main_team, p.team_type, p.seasons as career_seasons,
  sp.role, sp.alt_roles, sp.ovr, sp.bat, sp.bowl, sp.s1, sp.s2, sp.s3,
  sp.matches, sp.runs, sp.balls, sp.outs, sp.wickets, sp.bowl_balls, sp.bowl_runs
from squad_players sp
  join squads  s on s.id  = sp.squad_id
  join players p on p.id  = sp.player_id
  join teams   t on t.key = s.team_key;

/*
 * The same rows, kept on disk in the order they are read in.
 *
 * roster_feed is a join across four tables, and paging it means Postgres
 * building and sorting all 42,165 rows again for every page — forty-three
 * times, at better than half a second each. Measured on the live database it
 * was seventy-four per cent of every millisecond the instance spent, and the
 * statement timeouts players saw as "rain delay" came out of the same place.
 *
 * Almost nobody reads it any more: the archive ships as a static file and the
 * database is only consulted when that file cannot be had. But a fallback that
 * costs twenty-three seconds of database time is not a fallback, it is an
 * outage waiting for a bad afternoon — so the join is done once, when the
 * archive is built, and a page of it is now an index scan.
 *
 * No RLS, and none wanted: this is the same public archive roster_feed already
 * grants to anon, and every row of it ships to the browser as a file anyway.
 */
create materialized view roster_pages as
  select * from roster_feed order by squad_id, player_id;

-- Unique, not merely sorted. Ordering by squad alone leaves rows within a
-- squad free to shuffle between requests, and a row that moves across a page
-- boundary is silently dropped or counted twice.
create unique index roster_pages_key on roster_pages (squad_id, player_id);

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
    grant select on roster_feed, roster_pages, squad_index to anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on roster_feed, roster_pages, squad_index to authenticated;
  end if;
end $$;
