# Database setup

Two files, run once, in order. Nothing here needs a local Supabase CLI — the
SQL editor in the dashboard is enough.

## 1. Create the project

<https://supabase.com/dashboard> → **New project**. Any region near your
players. Note the database password somewhere safe; you will not need it for
the app, only for direct psql access.

## 2. Run the schema

Dashboard → **SQL Editor** → **New query** → paste all of `schema.sql` → **Run**.

Creates five tables, a read-only public policy on each, a `roster_feed` view
that flattens the join, and triggers that bump a version stamp whenever any
row changes. That version is how the client knows its cache has gone stale, so
**an edit you make in the dashboard reaches players on their next load** with
no deploy.

## 3. Run the seed

Same place, paste `seed.sql`, **Run**. It is 360 KB and takes a few seconds.

    289 squad-seasons · 3,819 player-seasons · 1,116 players · 41 teams

Every insert is `on conflict do nothing`, so re-running it is harmless.

## 4. Give the app its keys

Dashboard → **Project Settings → API**. Copy the **Project URL** and the
**anon public** key into `.env.local` at the repo root:

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

The anon key is safe in the browser: row level security allows `select` and
nothing else. Writes happen through the dashboard or a service-role key, which
must never reach the client.

## Editing the archive afterwards

Dashboard → **Table Editor**. Add a player, fix a rating, add a whole
squad-season — the version stamp bumps and clients pick it up. The shapes:

| Table | What it holds |
| --- | --- |
| `teams` | franchise or nation identity, and which league it belongs to |
| `players` | one row per cricketer — **nationality lives here**, and the overseas cap counts off it |
| `squads` | a team in a season: its name that year, competition, which formats it plays |
| `squad_players` | the roster rows: role, overall, optional sub-ratings, alternate roles |
| `challenges` | the daily-puzzle rotation |

`s1`/`s2`/`s3` may be left null — the client derives sub-ratings from the
overall and the role. Fill them in only for cards worth the detail.

## Regenerating the seed

`node scripts/generate-seed.mjs` rebuilds `seed.sql` from the TypeScript
archive and reports data-quality problems on the way through: players whose
nationality disagrees across squads, squads too thin to field an XI. Worth
running after any bulk edit to the TypeScript source.
