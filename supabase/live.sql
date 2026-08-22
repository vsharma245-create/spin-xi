/*
 * SPIN XI — the live draft.
 *
 * Four people, one pool of squads, taking turns. A squad somebody else has
 * taken is gone; that is what makes it a draft rather than four solo games
 * sharing a clock.
 *
 * The whole room is a seed and a list of picks.
 *
 *   Which squad comes up on pick n is computed from the seed and n, the way
 *   the daily draw is. Whose turn it is, is snake order from n. When that turn
 *   expires is the previous pick's timestamp plus the clock. Nothing else is
 *   stored, because nothing else has to be: reconnecting is fetching the picks
 *   and replaying them, and two clients cannot disagree about a state neither
 *   of them keeps.
 *
 * That is also what makes the bot work without a server. Any client that sees
 * a turn overdue computes the same pick — the rule is deterministic — and
 * writes it. The primary key on (room, pick_no) means the first one wins and
 * the others bounce off. No referee.
 *
 * Run after multiplayer.sql. Additive and re-runnable.
 */

create table if not exists draft_rooms (
  id   uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9]{4,10}$'),
  host uuid not null references profiles (id) on delete cascade,

  -- lobby: waiting for people. drafting: turns are running. done: XIs are full.
  /*
   * lobby → drafting → review → drafting → … until the host closes it.
   *
   * A room is a session rather than a single draft. When the XIs are full each
   * seat plays its season, the four are set against each other, and everybody
   * is asked whether they want another. Those who say so within the window
   * draft again; those who do not are out, because three people should not
   * wait on a fourth who has wandered off.
   */
  status text not null default 'lobby'
    check (status in ('lobby', 'drafting', 'review', 'done', 'abandoned')),

  -- Which draft of this session is running. Picks and seasons carry it.
  round smallint not null default 0,
  -- While in review: the moment the door shuts on the next round.
  ready_until timestamptz,

  -- The draw. Every client derives the same sequence of squads from this.
  seed bigint not null,

  format      text not null check (format in ('T20L', 'ODIWC', 'T20WC', 'TEST')),
  preset_id   text not null,
  rating_mode text not null check (rating_mode in ('SEASON', 'PRIME')),
  difficulty  text not null check (difficulty in ('EASY', 'NORMAL', 'HARD')),
  from_year   smallint,
  to_year     smallint,
  world_teams boolean not null default true,

  seats        smallint not null default 4 check (seats between 2 and 4),
  pick_seconds smallint not null default 30 check (pick_seconds between 10 and 180),

  started_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists draft_seats (
  room_id uuid not null references draft_rooms (id) on delete cascade,
  seat    smallint not null check (seat between 0 and 3),
  player  uuid references profiles (id) on delete set null,

  /*
   * A seat becomes a bot rather than emptying.
   *
   * Eleven rounds is a long time to hold four people, and a draft that stops
   * because somebody's train went into a tunnel is a draft nobody finishes.
   * The seat keeps drafting; only the hand on it changes.
   */
  is_bot boolean not null default false,

  /*
   * The round this seat has said yes to. A seat that has not said yes to the
   * round about to start is not in it — saying nothing is how somebody who
   * has closed the tab looks, and the rest should not be held by them.
   */
  ready_round smallint not null default 0,

  last_seen_at timestamptz not null default now(),
  joined_at    timestamptz not null default now(),

  primary key (room_id, seat)
);

create unique index if not exists draft_seats_one_each
  on draft_seats (room_id, player) where player is not null;

create table if not exists draft_picks (
  room_id  uuid not null references draft_rooms (id) on delete cascade,
  round    smallint not null default 0,
  -- 0-based, and dense within its round.
  pick_no  smallint not null,
  seat     smallint not null,

  squad_id  text not null,
  player_id text not null,
  -- Which slot of their XI it went into.
  slot      smallint not null check (slot between 0 and 10),

  made_by text not null default 'human' check (made_by in ('human', 'bot')),
  created_at timestamptz not null default now(),

  primary key (room_id, round, pick_no)
);

/* ── Catching up a room that already exists ───────────────────────────── */

/*
 * "create table if not exists" leaves a table that already exists exactly as
 * it was, so every column added after the first release has to be added
 * again here. The first push of this file created draft_picks without a
 * round, and the second failed on an index that referenced one.
 */
alter table draft_rooms add column if not exists round smallint not null default 0;
alter table draft_rooms add column if not exists ready_until timestamptz;
alter table draft_rooms drop constraint if exists draft_rooms_status_check;
alter table draft_rooms add constraint draft_rooms_status_check
  check (status in ('lobby', 'drafting', 'review', 'done', 'abandoned'));

alter table draft_seats add column if not exists ready_round smallint not null default 0;

alter table draft_picks add column if not exists round smallint not null default 0;

-- The key gained the round, which means replacing it rather than adding to it.
do $$
begin
  if exists (
    select 1 from pg_constraint c
      join pg_class t on t.oid = c.conrelid
     where t.relname = 'draft_picks' and c.contype = 'p'
       and (select count(*) from unnest(c.conkey)) = 2
  ) then
    alter table draft_picks drop constraint draft_picks_pkey;
    alter table draft_picks add primary key (room_id, round, pick_no);
  end if;
end $$;

-- One player cannot be in two XIs in the same round: the pool is shared.
drop index if exists draft_picks_one_player;
create unique index if not exists draft_picks_one_player
  on draft_picks (room_id, round, player_id);

create index if not exists draft_picks_room_idx on draft_picks (room_id, round, pick_no);

/* ── Turn order ────────────────────────────────────────────────────────── */

/**
 * Snake order: 0 1 2 3, then 3 2 1 0, then 0 1 2 3 again.
 *
 * Straight rotation would hand seat 0 the best of every round and seat 3 the
 * leavings of all eleven, which decides the draft before anybody drafts.
 */
create or replace function snake_seat(pick_no int, seats int) returns int
language sql immutable as $$
  select case when (pick_no / seats) % 2 = 0
              then pick_no % seats
              else seats - 1 - (pick_no % seats)
         end
$$;

/** When the turn for the next pick runs out. */
create or replace function draft_deadline(r draft_rooms) returns timestamptz
language sql stable as $$
  select coalesce(
    (select max(p.created_at) from draft_picks p
      where p.room_id = r.id and p.round = r.round),
    r.started_at
  ) + make_interval(secs => r.pick_seconds)
$$;

/* ── The one rule a client cannot be trusted with ──────────────────────── */

/**
 * A pick has to be the next one, from the right seat, by the right person.
 *
 * Everything else about the room derives from the picks, so this is the only
 * place a client could lie: taking two turns, jumping the queue, or picking
 * for somebody who is still deciding. A seat's owner may act any time it is
 * their turn; anybody may act for a seat whose turn has already run out,
 * because that is how the bot moves without a server to run it.
 */
create or replace function draft_pick_is_legal() returns trigger
language plpgsql as $$
declare r draft_rooms; expected int; owner uuid; overdue boolean;
begin
  select * into r from draft_rooms where id = new.room_id;
  if not found then raise exception 'No such draft.'; end if;
  if r.status <> 'drafting' then raise exception 'That draft is not running.'; end if;

  if new.round <> r.round then
    raise exception 'That draft has moved on to round %.', r.round;
  end if;

  select count(*) into expected from draft_picks p
    where p.room_id = r.id and p.round = r.round;
  if new.pick_no <> expected then
    raise exception 'Out of turn: the draft is on pick %, not %.', expected, new.pick_no;
  end if;

  if new.seat <> snake_seat(new.pick_no, r.seats) then
    raise exception 'That is not seat %''s turn.', new.seat;
  end if;

  select s.player into owner from draft_seats s
    where s.room_id = r.id and s.seat = new.seat;

  /*
   * A seat anybody may play: its clock has run out, or whoever was in it has
   * left and handed it to the bot. Waiting out a full turn for a seat that has
   * announced it is empty only makes everybody else sit still.
   */
  overdue := now() > draft_deadline(r)
             or exists (select 1 from draft_seats s
                        where s.room_id = r.id and s.seat = new.seat and s.is_bot);
  if owner is distinct from auth.uid() and not overdue then
    raise exception 'It is not your turn.';
  end if;

  -- A pick made for somebody else, or after their clock, is the bot's.
  if owner is distinct from auth.uid() then new.made_by := 'bot'; end if;

  if r.status = 'abandoned' then raise exception 'That draft was abandoned.'; end if;

  return new;
end $$;

drop trigger if exists draft_pick_is_legal_trg on draft_picks;
create trigger draft_pick_is_legal_trg before insert on draft_picks
  for each row execute function draft_pick_is_legal();

/**
 * The draft is over when every seat has eleven.
 *
 * Security definer, because this runs as whoever made the last pick and only
 * the host may update a room. The last pick of a round belongs to whichever
 * seat the snake lands on, which is usually not the host — so the round ended
 * for the host and never for anybody else, and a full draft sat in "drafting"
 * with nothing left to draft.
 */
create or replace function draft_close_when_full() returns trigger
language plpgsql security definer set search_path = public as $$
declare r draft_rooms;
begin
  select * into r from draft_rooms where id = new.room_id;
  if (select count(*) from draft_picks p where p.room_id = r.id and p.round = r.round)
     -- The brackets matter: without them this reads as "(this room and
     -- occupied) or a bot anywhere", and every abandoned seat in every other
     -- room raised the bar for this one, so the draft never filled up.
     >= (select count(*) from draft_seats s
          where s.room_id = r.id and (s.player is not null or s.is_bot)) * 11
  then
    -- Full XIs mean the cricket, not the end. The seasons are played, then
    -- everybody is asked whether they want another.
    update draft_rooms set status = 'review', ready_until = now() + interval '30 seconds'
      where id = r.id and status = 'drafting';
  end if;
  return null;
end $$;

drop trigger if exists draft_close_when_full_trg on draft_picks;
create trigger draft_close_when_full_trg after insert on draft_picks
  for each row execute function draft_close_when_full();

/* ── Getting in ────────────────────────────────────────────────────────── */

/** What a room looks like from outside, before taking a seat. */
create or replace function draft_preview(join_code text)
returns table (
  id uuid, code text, status text, format text, preset_id text, rating_mode text,
  difficulty text, seats smallint, pick_seconds smallint, taken int, is_open boolean
)
language sql security definer set search_path = public as $$
  select d.id, d.code, d.status, d.format, d.preset_id, d.rating_mode, d.difficulty,
         d.seats, d.pick_seconds,
         (select count(*)::int from draft_seats s where s.room_id = d.id and s.player is not null),
         d.status = 'lobby'
           and (select count(*) from draft_seats s where s.room_id = d.id and s.player is not null) < d.seats
  from draft_rooms d where d.code = lower(join_code);
$$;

/** Take the lowest free seat. Opening the link twice keeps the one you have. */
create or replace function draft_sit(join_code text)
returns smallint
language plpgsql security definer set search_path = public as $$
declare r draft_rooms; mine smallint; free smallint;
begin
  select * into r from draft_rooms where code = lower(join_code);
  if not found then raise exception 'No draft with that link.'; end if;

  select seat into mine from draft_seats
    where room_id = r.id and player = auth.uid();
  if mine is not null then
    update draft_seats set last_seen_at = now(), is_bot = false
      where room_id = r.id and seat = mine;
    return mine;
  end if;

  if r.status <> 'lobby' then raise exception 'That draft has already started.'; end if;

  select s.seat into free from draft_seats s
    where s.room_id = r.id and s.player is null
    order by s.seat limit 1;
  if free is null then raise exception 'That draft is full.'; end if;

  update draft_seats set player = auth.uid(), joined_at = now(), last_seen_at = now()
    where room_id = r.id and seat = free;
  return free;
end $$;

/* ── Row level security ────────────────────────────────────────────────── */

alter table draft_rooms enable row level security;
alter table draft_seats enable row level security;
alter table draft_picks enable row level security;

/** Is the caller sitting in this room? Definer, to keep the seats policy from
    asking the seats table who is sitting there — the recursion that took the
    leagues down. */
create or replace function in_draft(d uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from draft_seats s where s.room_id = d and s.player = auth.uid())
$$;

drop policy if exists "rooms visible to players" on draft_rooms;
drop policy if exists "own room insert"          on draft_rooms;
drop policy if exists "host may update room"     on draft_rooms;
drop policy if exists "seats visible to players" on draft_seats;
drop policy if exists "seats seeded by host"     on draft_seats;
drop policy if exists "seat holders may update"  on draft_seats;
drop policy if exists "picks visible to players" on draft_picks;
drop policy if exists "players may pick"         on draft_picks;

create policy "rooms visible to players" on draft_rooms for select
  using (host = auth.uid() or in_draft(id));
create policy "own room insert" on draft_rooms for insert with check (host = auth.uid());
create policy "host may update room" on draft_rooms for update using (host = auth.uid());

create policy "seats visible to players" on draft_seats for select
  using (player = auth.uid() or in_draft(room_id));
create policy "seats seeded by host" on draft_seats for insert
  with check (exists (select 1 from draft_rooms d where d.id = room_id and d.host = auth.uid()));
-- Sitting down and marking yourself present go through draft_sit and a
-- heartbeat; the legality of a *pick* is the trigger's business, not this.
create policy "seat holders may update" on draft_seats for update using (in_draft(room_id));

create policy "picks visible to players" on draft_picks for select using (in_draft(room_id));
create policy "players may pick" on draft_picks for insert with check (in_draft(room_id));

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant select, insert, update on draft_rooms, draft_seats to anon, authenticated;
    grant select, insert on draft_picks to anon, authenticated;
    grant execute on function draft_preview(text), draft_sit(text), in_draft(uuid),
                              snake_seat(int, int) to anon, authenticated;
  end if;
end $$;

/* ── Seasons played out of a live draft ───────────────────────────────── */

/*
 * A live draft does not end when the XIs are full — that is when the cricket
 * starts. Each seat plays its season and the four are set against each other,
 * and the room stays open for another round until the host closes it.
 */
alter table results add column if not exists room_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'results_room_id_fkey') then
    alter table results add constraint results_room_id_fkey
      foreign key (room_id) references draft_rooms (id) on delete set null;
  end if;
end $$;

alter table results add column if not exists seat smallint;
alter table results add column if not exists round smallint;
create index if not exists results_room_idx on results (room_id, points desc) where room_id is not null;

drop view if exists draft_table;

/** One row per seat per round, for everybody sitting in the room. */
create view draft_table as
select
  r.room_id, r.seat, r.player, p.handle, r.round,
  r.points, r.wins, r.losses, r.draws, r.runs, r.wickets, r.outcome, r.perfect,
  r.team_name, r.created_at
from results r
  left join profiles p on p.id = r.player
where r.room_id is not null
  and in_draft(r.room_id);

/* ── Between rounds ────────────────────────────────────────────────────── */

/** Say you want the next one. Idempotent, and refused once the door shuts. */
create or replace function draft_ready(room uuid) returns smallint
language plpgsql security definer set search_path = public as $$
declare r draft_rooms;
begin
  select * into r from draft_rooms where id = room;
  if not found then raise exception 'No such draft.'; end if;
  if r.status <> 'review' then raise exception 'There is nothing to say yes to yet.'; end if;
  if now() > r.ready_until then raise exception 'Too late — that round has started without you.'; end if;

  update draft_seats set ready_round = r.round + 1, is_bot = false, last_seen_at = now()
    where room_id = room and player = auth.uid();
  if not found then raise exception 'You are not sitting in this draft.'; end if;
  return r.round + 1;
end $$;

/**
 * Start the next round, or close the session.
 *
 * Callable by anyone in the room once the window has passed, for the same
 * reason the bot is: waiting for a particular person to advance the game is
 * how a game stops. Whoever gets there first does it and the rest are no-ops,
 * because the guard is the room's own state.
 *
 * A session needs two. One person drafting against nobody is a solo game, and
 * there is a whole rest of the app for that.
 */
create or replace function draft_advance(room uuid) returns text
language plpgsql security definer set search_path = public as $$
declare r draft_rooms; staying int;
begin
  select * into r from draft_rooms where id = room;
  if not found then raise exception 'No such draft.'; end if;
  if r.status <> 'review' then return r.status; end if;
  if now() <= r.ready_until then return 'review'; end if;

  -- Anybody who did not say yes is out. Their seat empties for the next round.
  update draft_seats set player = null, is_bot = false, ready_round = 0
    where room_id = room and (ready_round <> r.round + 1 or player is null);

  select count(*) into staying from draft_seats
    where room_id = room and player is not null;

  if staying < 2 then
    update draft_rooms set status = 'done', ready_until = null where id = room;
    return 'done';
  end if;

  update draft_rooms
    set round = r.round + 1, status = 'drafting', started_at = now(), ready_until = null
    where id = room;
  return 'drafting';
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function draft_ready(uuid), draft_advance(uuid) to anon, authenticated;
  end if;
end $$;

/**
 * Start the draft, and hand every empty seat to the bot as it begins.
 *
 * A seat nobody is sitting in is not "deciding" — but it was treated as
 * though it were, so a four-seat room started by two people burned a full
 * clock per empty seat, every round, before anything happened. They are
 * flagged at the off instead, which makes them playable immediately by the
 * same rule that covers somebody who walks out.
 */
create or replace function draft_begin(room uuid) returns text
language plpgsql security definer set search_path = public as $$
declare r draft_rooms;
begin
  select * into r from draft_rooms where id = room;
  if not found then raise exception 'No such draft.'; end if;
  if r.host <> auth.uid() then raise exception 'Only the host can start it.'; end if;
  if r.status <> 'lobby' then return r.status; end if;

  if (select count(*) from draft_seats s where s.room_id = room and s.player is not null) < 1 then
    raise exception 'Nobody is sitting down.';
  end if;

  update draft_seats set is_bot = true where room_id = room and player is null;
  update draft_rooms set status = 'drafting', started_at = now() where id = room;
  return 'drafting';
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function draft_begin(uuid) to anon, authenticated;
  end if;
end $$;
