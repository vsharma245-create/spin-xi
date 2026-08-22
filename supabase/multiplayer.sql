/*
 * SPIN XI — playing against other people.
 *
 * Two modes, deliberately different in kind.
 *
 *   Leagues are asynchronous. A host locks a set of rules, plays their own
 *   season, and shares a link. Everyone who follows it plays those exact
 *   rules whenever they like, and the best season by the deadline wins. It
 *   needs no realtime anything, which is why it is first.
 *
 *   Live drafts are four people at once, taking turns out of one shared pool
 *   of squads. A player somebody else has taken is gone. That is what makes
 *   it a draft rather than four solo games with a shared clock.
 *
 * Run after players.sql. Additive and re-runnable; it drops nothing that
 * holds a season.
 */

/* ── Leagues ───────────────────────────────────────────────────────────── */

create table if not exists leagues (
  id   uuid primary key default gen_random_uuid(),
  -- What goes in the link. Short enough to read down a phone, long enough
  -- that leagues cannot be found by guessing.
  code text not null unique check (code ~ '^[a-z0-9]{6,12}$'),

  name     text not null check (char_length(name) between 2 and 40),
  category text,
  host     uuid not null references profiles (id) on delete cascade,

  /*
   * The rules, locked at creation. Every column here has a counterpart on
   * results, and a trigger below refuses any season whose settings disagree —
   * otherwise "same rules for everyone" is a promise the host makes and the
   * database does not keep.
   */
  format      text not null check (format in ('T20L', 'ODIWC', 'T20WC', 'TEST')),
  preset_id   text not null,
  rating_mode text not null check (rating_mode in ('SEASON', 'PRIME')),
  difficulty  text not null check (difficulty in ('EASY', 'NORMAL', 'HARD')),
  from_year   smallint,
  to_year     smallint,
  world_teams boolean not null default true,

  /*
   * Whether a replay replaces your score or has to beat it. Locked, because a
   * host who can change this once they are losing is not running a league.
   */
  scoring text not null check (scoring in ('latest', 'best')),

  -- null means no cap and no deadline respectively.
  max_players smallint check (max_players is null or max_players between 2 and 1000),
  closes_at   timestamptz,

  -- One entry each, which needs an account to be worth anything.
  signed_in_only boolean not null default false,

  /*
   * The host has to play before anybody can join. Otherwise they can watch
   * everyone else's seasons land and tune their own run against them.
   */
  host_played_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists leagues_host_idx on leagues (host, created_at desc);

create table if not exists league_entries (
  league_id uuid not null references leagues (id) on delete cascade,
  player    uuid not null references profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, player)
);

create index if not exists league_entries_player_idx on league_entries (player);

-- A season played in a league. Null for ordinary solo runs, which is every
-- row that already exists.
alter table results add column if not exists league_id uuid references leagues (id) on delete set null;
create index if not exists results_league_idx on results (league_id, points desc) where league_id is not null;

/* ── Keeping the rules ─────────────────────────────────────────────────── */

/**
 * Refuse a season that did not follow the league it claims to belong to.
 *
 * This cannot catch a doctored score — that needs the season replaying from
 * its seed, which is a later job. It does catch the ordinary way a league
 * gets spoiled: playing on Easy, or with the ratings showing, or across a
 * wider span of years than everyone else agreed to.
 */
create or replace function league_rules_kept() returns trigger
language plpgsql as $$
declare l leagues;
begin
  if new.league_id is null then return new; end if;

  select * into l from leagues where id = new.league_id;
  if not found then
    raise exception 'That league does not exist.';
  end if;

  if l.closes_at is not null and now() > l.closes_at then
    raise exception 'That league has closed.';
  end if;

  if not exists (select 1 from league_entries e
                 where e.league_id = l.id and e.player = new.player) then
    raise exception 'You have not joined that league.';
  end if;

  if new.format <> l.format
     or new.preset_id <> l.preset_id
     or new.rating_mode <> l.rating_mode
     or new.difficulty <> l.difficulty
     or new.world_teams <> l.world_teams
     or new.from_year is distinct from l.from_year
     or new.to_year   is distinct from l.to_year then
    raise exception 'That season was not played under this league''s rules.';
  end if;

  -- The daily is one shared draw; it is not a league entry.
  if new.mode <> 'quick' then
    raise exception 'Only a quick draft can be entered into a league.';
  end if;

  return new;
end $$;

drop trigger if exists league_rules_kept_trg on results;
create trigger league_rules_kept_trg before insert on results
  for each row execute function league_rules_kept();

/* ── Joining ───────────────────────────────────────────────────────────── */

/**
 * Look a league up by its code without being able to list the others.
 *
 * Selecting leagues directly is restricted to members, so a code is the only
 * way in. This runs as the owner to make that possible, and returns only what
 * a joining player needs to see before they commit.
 */
create or replace function league_preview(join_code text)
returns table (
  id uuid, name text, category text, format text, preset_id text,
  rating_mode text, difficulty text, from_year smallint, to_year smallint,
  world_teams boolean, scoring text, closes_at timestamptz,
  signed_in_only boolean, players int, is_open boolean
)
language sql security definer set search_path = public as $$
  select l.id, l.name, l.category, l.format, l.preset_id, l.rating_mode,
         l.difficulty, l.from_year, l.to_year, l.world_teams, l.scoring,
         l.closes_at, l.signed_in_only,
         (select count(*)::int from league_entries e where e.league_id = l.id),
         l.host_played_at is not null
           and (l.closes_at is null or now() <= l.closes_at)
           and (l.max_players is null
                or (select count(*) from league_entries e where e.league_id = l.id) < l.max_players)
  from leagues l where l.code = lower(join_code);
$$;

/** Take a place in a league. Idempotent: opening the link twice is not two entries. */
create or replace function league_join(join_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare l leagues; taken int;
begin
  select * into l from leagues where code = lower(join_code);
  if not found then raise exception 'No league with that link.'; end if;

  if exists (select 1 from league_entries e where e.league_id = l.id and e.player = auth.uid()) then
    return l.id;
  end if;

  if l.host_played_at is null then
    raise exception 'The host has not played yet.';
  end if;
  if l.closes_at is not null and now() > l.closes_at then
    raise exception 'That league has closed.';
  end if;

  select count(*) into taken from league_entries e where e.league_id = l.id;
  if l.max_players is not null and taken >= l.max_players then
    raise exception 'That league is full.';
  end if;

  insert into league_entries (league_id, player) values (l.id, auth.uid());
  return l.id;
end $$;

/* ── The table ─────────────────────────────────────────────────────────── */

drop view if exists league_table;

/**
 * One row per player per league: the season that counts, under the league's
 * own scoring rule.
 *
 * The membership test is inside the view rather than left to row level
 * security, because a view reads as its owner — without it, anybody could
 * read the standings of every league on the site.
 */
create view league_table as
select
  r.league_id,
  r.player,
  p.handle,
  r.points, r.wins, r.losses, r.draws, r.runs, r.wickets, r.nrr,
  r.outcome, r.perfect, r.team_name, r.created_at
from results r
  join profiles p on p.id = r.player
  join leagues l  on l.id = r.league_id
where r.league_id is not null
  and (l.closes_at is null or r.created_at <= l.closes_at)
  and exists (select 1 from league_entries me
              where me.league_id = r.league_id and me.player = auth.uid())
  and r.id = (
    select r2.id from results r2
    where r2.league_id = r.league_id and r2.player = r.player
      and (l.closes_at is null or r2.created_at <= l.closes_at)
    order by
      case when l.scoring = 'best' then r2.points end desc nulls last,
      case when l.scoring = 'latest' then r2.created_at end desc nulls last,
      r2.created_at desc
    limit 1
  );

/* ── Row level security ────────────────────────────────────────────────── */

alter table leagues        enable row level security;
alter table league_entries enable row level security;

drop policy if exists "leagues visible to members" on leagues;
drop policy if exists "own league insert"          on leagues;
drop policy if exists "host may update own league" on leagues;
drop policy if exists "entries visible to members" on league_entries;
drop policy if exists "own entry insert"           on league_entries;

-- A league is readable by the people in it. Everyone else needs the code,
-- which goes through league_preview.
create policy "leagues visible to members" on leagues for select
  using (host = auth.uid()
         or exists (select 1 from league_entries e
                    where e.league_id = id and e.player = auth.uid()));

create policy "own league insert" on leagues for insert with check (host = auth.uid());

-- The host may record that they have played. The rules themselves are locked
-- by the trigger below rather than by trusting this policy.
create policy "host may update own league" on leagues for update using (host = auth.uid());

create policy "entries visible to members" on league_entries for select
  using (player = auth.uid()
         or exists (select 1 from league_entries mine
                    where mine.league_id = league_id and mine.player = auth.uid()));

create policy "own entry insert" on league_entries for insert with check (player = auth.uid());

/** The rules are what everybody agreed to. Only the host's own progress moves. */
create or replace function league_rules_are_locked() returns trigger
language plpgsql as $$
begin
  if new.code <> old.code or new.format <> old.format or new.preset_id <> old.preset_id
     or new.rating_mode <> old.rating_mode or new.difficulty <> old.difficulty
     or new.world_teams <> old.world_teams or new.scoring <> old.scoring
     or new.from_year is distinct from old.from_year
     or new.to_year is distinct from old.to_year
     or new.host <> old.host then
    raise exception 'A league''s rules cannot change once it exists.';
  end if;
  return new;
end $$;

drop trigger if exists league_rules_are_locked_trg on leagues;
create trigger league_rules_are_locked_trg before update on leagues
  for each row execute function league_rules_are_locked();

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant select, insert on leagues, league_entries to anon, authenticated;
    grant update on leagues to anon, authenticated;
    grant select on league_table to anon, authenticated;
    grant execute on function league_preview(text), league_join(text) to anon, authenticated;
  end if;
end $$;
