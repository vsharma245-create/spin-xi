# SPIN XI

A cricket drafting game. Spin for a historical squad, draft one
player, build an XI, then simulate a tournament and chase a perfect unbeaten run.

Not fantasy cricket, not a stats site — a historical drafting game where the
limited random choices *are* the strategy.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

## The loop

```
SPIN → HISTORICAL SQUAD + SEASON → DRAFT ONE PLAYER → SLOT THEM IN THE ORDER
     → REPEAT ×11 → REVIEW YOUR XI → SIMULATE → SEASON REVIEW → CHAMPIONS TROPHY
```

A first run takes about three minutes.

## Tournaments

All four are fully playable and each simulates differently.

| Tournament | Shape | Perfect run |
| --- | --- | --- |
| T20 League | 14 league games, Qualifier, Final | 14–0 |
| ODI World Cup | 9 group games, Semi-Final, Final | 11–0 |
| T20 World Cup | 7 group games, Semi-Final, Final | 9–0 |
| Test Championship | 12 Tests (draws count), Final | 12–0 |
| Champions Trophy | Invitational: 3 knockout ties | 3–0 |

The Champions Trophy is optional and only offered to sides that finish in the
league's top three. Its eight-team field is redrawn every single time you enter,
from the strongest recent squads in T20 leagues **around the world** — the Big
Bash, PSL, CPL, SA20, the Hundred, MLC, the T20 Blast and the Indian league — so
the bracket in front of you has never been played before.

The field is drawn from a shortlist of the best thirty-odd sides rather than the
best ten, so a bracket has favourites and outsiders the way an invitational
actually does. Drawn from the very top it came out all one calibre, every tie a
coin toss, and how well you had drafted barely showed in whether you lifted it.
Ties are decided on the same curve as every other match, with each round a
little harder than the last: measured over five hundred entries a side, a
strongly drafted XI wins it about **one time in five** and an ordinary one about
**one in ten**.

## Draft options

- **Pool** — All-time or one club's history. Sides too thin to fill the chosen
  batting order are left out of the list rather than offered and then refused
  (exact bipartite feasibility check in `game/draft.ts`).
- **Seasons** — a two-handled year bar spanning whatever the chosen tournament
  actually covers, which differs by format: T20 internationals begin in 2005
  because that is when the format was invented, the Indian league in 2008, Tests
  and one-day internationals at the start of the archive. Narrow it and only
  sides that played in those years are in the draw — one club's great side and
  the one that followed it, or a single season. It stacks on the pool, so
  "Chennai, 2010 to 2014" is a sentence the setup can say.
- **Player ratings** — *Season form* rates every card for the season printed on
  it; *Prime* rates each player at their career peak, wherever that came. Prime
  needs no second dataset: a player's peak is simply their best season in the
  archive. Opponents are rated the same way you are, so switching modes changes
  the texture of the draft without handing you the tournament.
- **Team balance** — Balanced XI, Classic Order, Pace Battery, All-Rounder Army.
  Each is an ordered eleven-slot batting card, not an unordered set, and the
  order can be rearranged before you simulate: moving a player onto a team-mate
  swaps the two, which is the only way reordering works once all eleven slots
  are filled.
- **Difficulty** — Easy (5 re-rolls), Normal (3), Hard (none, ratings hidden).
- **Restarting** — a draft can be abandoned mid-way, but not by accident: the
  button asks first, says how many you have picked, and lets you change the
  tournament, the rating mode and the difficulty for the next one before
  starting it. Quitting used to drop you on the home screen without a word,
  which loses an XI to a mistapped button — and assumed the reason for quitting
  was wanting to stop, when much more often it is wanting to start again.
- **Match rules** — call the toss yourself before each knockout. In the T20
  League, a switch decides whether clubs from around the world join the draw. On,
  it is a world league and the overseas cap is meaningless, because with every
  country in the draw nobody is an import; off, it is the Indian league alone and
  the four-import cap becomes a rule you can choose. That switch also fixed
  something that looked like broken shuffling: with a world pool *and* a cap, a
  full quota of imports left only Indian squads holding a player you could still
  place — 195 of 882 — so the wheel appeared to stop being random.

## What makes the simulation more than a coin flip

- **You play real sides.** Every opponent in every mode is a squad-season from
  the same archive you draft from — MUMBAI INDIANS 2020, PAKISTAN 2022 — with
  ratings built from its own players. A match is decided by the gap between two
  rated teams, not by an abstract measure of how good you are. A side is rated on
  the eleven it would actually pick, by exactly the formula that rates yours.
- Every match is played on one of four surfaces — batting paradise, pace deck,
  spin track, neutral — and the pitch decides which of your ratings matter, for
  *both* teams. A spin-heavy XI eats turners and struggles on green decks.
- Winning a knockout toss and reading the surface correctly is worth a real edge.
- Test cricket resolves to win/draw/loss, and dominant sides force results while
  evenly matched ones drift to draws.
- You finish in a **table** of eight to ten real sides. Top four make the
  knockouts (top two for the Test final), top three earn a Champions Trophy
  invitation.
- Opponents are rated from their own roster, best eleven first — so a side listed
  with a whole season's churn is not rated below the same side listed with a
  settled team, which would say something about record-keeping rather than about
  cricket.

Difficulty is measured, not guessed — 960 simulated seasons at a time. A
strongly drafted XI wins about **70%** of its T20 League matches in season form
and **57%** in prime, where the whole field is at its peak too; an ordinary draft
sits near 50%. A perfect unbeaten run is genuinely rare.

Three things had to be true for that. Both sides are rated by **the same
formula** — yours was measured on its top seven batters and theirs on a top four
then discounted, two yardsticks that disagreed by twelve points. Each opponent is
drawn as the strongest of four of its seasons, because you pick every player in
his best year and a side taken from one random season was beaten before the toss.
And a rating edge converts to results at a **format-specific rate**: no team in
any T20 league wins 80% of its games, while a Test gives quality five days to
assert itself.

That curve is now the only one. The league table was playing your rivals off a
separate hard-coded slope, so their records spread further apart than yours
could and the position you finished in was measured against a different game;
the Champions Trophy had a third, more than twice as steep, so a strong side was
more certain of a trophy tie than of an ordinary league match against a weaker
opponent. Two competitions cannot disagree about what a five-point advantage is
worth.

## Watching a match

Every match generates a **full scorecard for both sides**: all eleven batters
for each team — with real names from that squad-season — extras, totals, and both
sets of bowling figures. A side that lost four wickets shows six batters, four
out and exactly two not out; the rest are listed **DNB**. Runs are shared
across the order on a skewed curve, because innings are lumpy: somebody goes
big, somebody gets a jaffa. Nothing on the card can disagree with the scoreboard,
because the card explains a result the simulator has already decided.

**The card adds up.** How long an innings lasted, in deliveries, is decided once,
and the overs figure, the balls each batter faced and the overs each bowler sent
down are all derived from that one number. They used to be invented separately,
which is how a card could report twenty overs, five bowlers of four each, and a
batting side that faced ninety-four balls between them — with every strike rate
inflated to match. Cricket fixes the deliveries and lets the runs vary; so does
the card. Verified across 800 innings with no discrepancy.

Tap any match — mid-simulation from the live feed, or afterwards from the match
log — to read it back. The simulation runs at 1×, 2× or skip-to-end, can be
paused, and narrates each result in words as it lands.

**Nothing happens without being explained.** The league stage ends on the final
table, with your position, the qualification cut and what comes next spelled
out, and you press on when you're ready. Every knockout is introduced with the
opponent, their rating, their danger men, the surface and what is at stake —
then the toss, then the result, then whether you are through or out.

## The season review

The result screen closes with a written review, assembled entirely from the
scorecards the tournament produced:

- **The story**, in four or five paragraphs — where you finished, who carried the
  batting, what the attack did and on which surfaces, the night of the season and
  the one to forget.
- **Awards** — player of the tournament, leading run-scorer, leading wicket-taker
  and the surprise of the season (the lowest-rated card that played above itself).
- **Squad performance** — runs, average, strike rate, wickets and economy for
  every player, with player-of-the-match counts.
- **Notes** — record batting first versus chasing, longest winning run, highest
  total, best scalp, tightest win, and who never got a game.

## Data

Every number in the game is computed from **ball-by-ball records of matches that
were actually played** — 12,337 of them, from [Cricsheet](https://cricsheet.org),
which publishes them freely for exactly this use.

```
168 teams · 3,989 players · 2,487 squad-seasons · 42,178 player-seasons · 2002–2026
```

| Competition | Teams | Seasons |
| --- | --: | --- |
| T20 internationals | 23 | 2005–2026 |
| One-day internationals | 23 | 2002–2026 |
| Test cricket | 11 | 2002–2026 |
| Indian T20 League | 15 | 2008–2026 |
| T20 Blast, Big Bash, BPL, CPL, PSL, The Hundred, LPL, SA20, MLC, MSL | 130 | 2011–2026 |

A squad is **everyone who actually took the field** for that side that season —
eleven to thirty-four players, eighteen on average. Players who were signed but
never played are absent, because a ball-by-ball record cannot see them and
inventing them would put men in XIs they never belonged to.

### How a rating is made

A player-season's rating is its **percentile against everyone who played the same
format**, computed from what they did:

- **Batting** — runs per innings, scaled by strike rate against the format's par.
- **Bowling** — wickets per match, scaled by economy against the format's par.
- **The three figures on a card** are the record, not decoration. `BAT / CONS / SR`
  for a batter is the batting rating, the average and the strike rate; `GUILE /
  WKT / ECON` for a spinner is the bowling rating, wickets per match and economy.
  Where a player did too little to judge — a batter who faced nine balls — the
  figure is **left null** rather than guessed, and the client derives one.

Two corrections matter, and both were found by measuring rather than by eye:

- **Small seasons regress to the mean.** Impact is a per-match rate, so a short
  season inflates it. Andrew McBrine's two Tests in 2024 — 189 runs, 11 wickets —
  came out the highest-rated Test season in the archive. Ratings now regress by
  matches played, and the top of each format reads as it should: Narine 2024,
  Watson 2007/08, Jason Holder 2018, Jadeja 2016/17, Flintoff 2003.
- **Opposition counts.** A hundred against Bermuda is not a hundred against
  Australia. International impact is weighted by ICC status of the side faced.

### Facts a scorecard does not state

Three things have to be inferred, and each is validated:

- **Nationality** drives the overseas cap, so a wrong one silently lets a fifth
  import into an XI. Caps settle 2,551 players — a man who has represented a
  country is of it. Wikidata settles 967 more, joined on the Cricinfo and
  CricketArchive identifiers that Cricsheet's own register publishes, which is an
  identifier-to-identifier join rather than a guess at whose name is whose. The
  remaining 471 are uncapped domestic professionals who appear in no public
  registry; they take the home nation of the league they play. Measured against a
  matched holdout that inference is **90% accurate**, putting nationality at
  **98.8%** overall. It is the least certain thing in the dataset and the only
  field below 99%.

  Cricsheet withholds every Afghanistan men's match as a matter of policy, so no
  Afghan can appear to hold a cap. Without Wikidata, Rashid Khan came out Indian
  and walked into an Indian XI without using an import slot.

- **Pace or spin** is read from where in the innings a bowler is used, decided
  once for a whole career rather than season by season — nobody changes their
  action between years, and judged annually 35% of bowlers came out as both.
  Only T20 cricket counts toward the reading, because "middle overs" is a
  limited-overs idea: measured across his Tests, Ashwin looks like a quick. The
  threshold was validated against 29 bowlers of known type, and got all 29 right.
  **99.1%** of bowlers are now consistent.

- **Who kept wicket** is read from dismissals. Stumpings alone missed every
  keeper who went a season without one, leaving a quarter of squads with nobody
  to take the gloves; catches count too, and the best candidate in each squad
  keeps. **99.7%** of squads have a keeper.

### Where it lives

The archive is in Postgres (Supabase) and the app pulls it once at start-up.

```
supabase/schema.sql       tables, a read-only public policy, a version stamp
supabase/archive.sql      the whole archive, generated — never edited by hand
src/data/repository.ts    one paged fetch, cached in IndexedDB against the stamp
src/data/squads.ts        the query layer — seasons, prime, pools, feasibility
```

**Why a database**, when the data never changes mid-game: so it can change
*between* games. Fixing a rating is an edit in the Supabase table editor, not a
deploy. A trigger bumps the version stamp on every write, the client compares it
on load, and a returning player who is already current downloads **one row**.

**Why the game still holds it all in memory**: a spin has to feel instant, and a
spin that waits on a round trip does not. Reads go through plain `fetch` against
PostgREST — the full Supabase client would have added 400 KB of auth, storage and
realtime code to make three GETs. The client asks for the eighteen columns it
renders, not the whole table, so the record behind the ratings can live in the
database without riding down the wire.

Ratings are stored; averages and strike rates are stored as the counts they came
from. A rating is a percentile across a whole population and cannot be recomputed
from one row, so it is written down. Runs and balls are facts about the player, so
they are kept as a scorecard would print them and divided when needed. Era, prime
ratings and a player's batting and bowling contribution stay derived in the
client: they are functions of the data rather than facts about it, and storing a
derived value only gives it room to disagree with what it came from.

Player-season is the draftable unit: 2016 Kohli and 2023 Kohli are different
cards, and you can only field one version of a player. Seasons are kept exactly
as the source writes them — `2019/20` as well as `2019` — because taking the year
before the slash merged tournaments a year apart, and 70 pairs of seasons
collapsed that way before it was caught.

### Building and checking it

```bash
npm run ingest    # download Cricsheet, aggregate ball-by-ball into ratings
npm run nations   # nationality and full names, by identifier join to Wikidata
npm run archive   # write supabase/archive.sql
npm run db:check  # run schema + archive against a real Postgres, in process
npm run audit     # is the cricket right?
npm run db:push   # apply to Supabase
```

`db:check` runs the SQL against Postgres compiled to WebAssembly — same parser,
same constraints, nothing to install. It applies the schema twice and the archive
twice, so idempotency and re-runnability are proven rather than hoped for.

`audit` asks what Postgres cannot: whether the ratings put the right players on
top, whether anyone is playing for the wrong country, whether a bowler changes
discipline between seasons, whether a name would be recognised by someone who
follows the game. It prints what it found rather than only whether it passed,
because most of these are judgements of degree.

Two of the audit's own checks were wrong before they were right: it compared card
figures across formats, where a strike rate of 60 is a fine Test innings and a
dreadful T20 one; and it called "conceded runs off no legal delivery" impossible,
which an over of wides does perfectly legally.

## Rankings and ladders

**Where you finish in a season** is a league table of eight to ten real sides.
Two points a win in limited overs, twelve for a Test win and four for a draw,
sorted on points and then net run rate — or, in a Test championship, on the
percentage of available points won, which is how the World Test Championship is
actually decided.

**Net run rate is real.** Runs scored per over, less runs conceded per over,
with the rule that catches people out: a side bowled out is charged the **full
quota** of overs, not the ones it survived — collapsing for 90 in twelve overs
counts as 90 off twenty. Yours is added up from the scorecards you played;
your rivals' matches are played out for runs too, even though nobody will ever
read a card for them, because a rate over runs cannot be compared with a formula
on wins. It was a formula on wins until recently, which meant two sides on the
same record had the same net run rate give or take some noise, and the number
that decides who reaches a knockout was decided by neither runs nor overs.

**Ladders are per tournament.** One board cannot rank a fourteen-game league
against a twelve-Test championship: sorted on a raw win column, the longer
season wins before anybody drafts a player. Each tournament keeps its own table,
and the Global / India / Friends tabs cut across whichever one you are looking
at.

**Within a board you are ranked on points**, built from the three things a
cricket season actually produces:

| | Win | Draw | Per run | Per wicket |
| --- | --: | --: | --: | --: |
| T20 League | 100 | — | 0.30 | 10 |
| T20 World Cup | 100 | — | 0.32 | 10 |
| ODI World Cup | 100 | — | 0.18 | 12 |
| Test Championship | 100 | 35 | 0.13 | 8 |

Results dominate, because winning is the point. Runs and wickets separate sides
that won the same number — a 12–2 season with a heavy run column can catch a
modest 13–1 — and they are granular enough that ties essentially do not happen:
across thirty simulated seasons in each format, **every score was distinct**.
Ranking on wins alone gives a fourteen-game league fifteen possible records, so
hundreds of players share one and the order inside a tie is whatever the sort
does.

The run rate is scaled per format so a par innings is worth about the same
everywhere — 165 in a T20, 285 in a one-dayer and 380 in a Test are the same
afternoon's work, and a Test batter should not out-rank a T20 one merely for
playing a longer game. Rival scores on the board are invented, but they are run
through **the same scoring function**, so the ordering is honest even while the
field is not.

**Rating is the competitive number.** A level and a rating answer different
questions, and one number cannot do both — which is why every game that has both
keeps them apart, an account level beside a competitive rank. Ranked on career
points, somebody who plays seventy ordinary seasons finishes above somebody who
plays ten brilliant ones, and that measures stamina rather than cricket.

The method is golf's, because golf has the same problem: players competing
against each other while playing different courses, different numbers of times.
Your rating is the average of your **best eight seasons out of the last twenty**
— comparable however much you play, rewarding your peak without demanding you
hit it every time, and drifting down when recent form does.

Each season is first put on a scale every tournament shares: how far above or
below par it scored, where **par is 1000 and each standard deviation is 100**.
Par and spread were measured across roughly 120 simulated seasons per format at
a range of draft qualities, so a par season indexes to exactly 1000 in all four
and a strong one to about 1128 in all four.

It behaves the way a rating should:

| | Rating |
| --- | --: |
| 20 ordinary seasons | 1012 |
| 8 excellent seasons | **1170** |
| 20 great, then 5 poor | 1170 — a bad patch is forgiven |
| …15 poor | 1061 |
| …20 poor, the good ones aged out | 880 |
| …8 great again | 1170 |

Quality beats volume, a bad week does not undo a good year, and sustained
decline shows. It is provisional until eight seasons are on the board.

**Your level is your career.** Experience *is* the points a season scores — the
same number the ladder ranks that season by — so every draft in every format
feeds one level rather than four. They used to be two currencies, with XP at
forty a run plus eight a win while boards sorted on something else, and neither
number explained the other. A title adds 250 and an unbeaten season 500, for the
things points alone under-reward.

Levels are set in **seasons played** rather than raw points, so the pace is the
same whatever you play — about three seasons a level to begin with, easing to
two once you are past thirty and the levels themselves are the achievement:

| Level | Seasons | Career XP | Title |
| --: | --: | --: | --- |
| 1 | 3 | 6,000 | Club cricketer |
| 5 | 15 | 30,000 | Grade cricketer |
| 10 | 30 | 60,000 | List A regular |
| 20 | 50 | 100,000 | International |
| 30 | 70 | 140,000 | All-time great |

A season is worth about two thousand points averaged over the four tournaments —
a T20 League season scores more than a T20 World Cup simply because it is longer
— so the bigger tournaments advance you a little faster, which is the point of
earning it in points rather than in appearances. Levels show beside every name
on a ladder, so a board reads as a field of players rather than a list of scores.

**Your record** lives in `localStorage` under `spinxi:v1`, kept apart by the
things that make two runs incomparable: **by tournament**, **by rating mode**
(season form or prime) and **by difficulty**. Each keeps its own drafts, W–L,
trophies, runs, wickets and best points. Career totals hid what they were made
of — a hundred wins says nothing about whether they came in T20 leagues on Easy
or Test championships with the ratings hidden.

There is still **no server**, so the rival rows are mock data and only your own
row is real. The screen says so.

## Look

A floodlit evening at the cricket, not a dashboard:

| Token | Colour | Stands for |
| --- | --- | --- |
| `ink` | deep navy-black | the night sky above the ground |
| `willow` | warm tan `#E3A54B` | the primary accent — anything you act on |
| `pitch` | cut grass `#4FA96B` | wins, positives |
| `leather` | cherry `#C8453A` | defeats, pace bowling |
| `gold` | brass `#C9902F` | seasons, silverware, immortals |
| `cream` | whites `#F4F1E6` | text, batters |

Roles are colour-coded once, in `components/roles.ts`, and every surface reads
from it: whites for batters, brass for keepers, grass for all-rounders, cherry
for quicks and a dusk teal for spinners — the one role that isn't any of the
others, so a spinner is spotted at a glance.

The four pitch types are **drawn marks, not emoji** (`components/icons.tsx`):
emoji render differently on every platform and none of them mean "this track
will turn square". A bat and ball, a seam-up delivery bouncing off a length, a
ball turning past the outside edge, and a set of scales. The logo is the cherry
itself, seam and all, and doubles as the favicon.

## Structure

```
src/
  data/       repository (the fetch), squads (the query layer), challenges,
              nations, team identity, mock ladder
  game/       types, draft, opponents, sim, card, review, trophy, storage
  components/ PlayerCard, TeamSheet, MatchView, Review, SpinReel, YearRange,
              ArchiveGate, Field, icons and crests, ui kit
scripts/      ingest, nations, archive, audit, db-check, db-push
supabase/     schema.sql, archive.sql (generated)
  screens/    Home, Play (setup→draft→XI→sim→result→trophy), Daily, Leaderboard,
              Profile
```

One draft engine, one simulation module, one design system. `Play.tsx` owns the
game flow as a phase machine; every other screen is a leaf.

The game modules split by job: `opponents.ts` turns squads into rated sides,
`sim.ts` decides results, `card.ts` explains them, `review.ts` reads the whole
tournament back as prose, `trophy.ts` runs the invitational. `types.ts` holds
every shared type — including `Opponent` — so nothing imports in a circle.

## Notes for whoever picks this up

- **framer-motion is pinned to 11.18.2 deliberately.** On v13 with React 19,
  `AnimatePresence` exit animations never resolve, which strands drawers on
  screen and deadlocks `mode="wait"` transitions. Nothing in the app gates
  functionality on an animation completing — the spin reveal runs off a timer,
  not an animation callback — but don't reintroduce exit-gated unmounting.
- The archive comes from Supabase over plain `fetch`; there is no auth, no user
  accounts and no writes. Progress lives in `localStorage` under `spinxi:v1`, and
  the leaderboard is static mock data with your own daily result spliced in.
- Daily challenges are deterministic from the browser date: fixed draw sequences
  in `data/challenges.ts`, and the tournament is seeded so the same XI always
  plays out the same way. Every `rand()` call in `sim.ts` is part of that
  sequence, so adding or reordering calls changes historical daily results.
- Balance is measurable rather than guessed. `EDGE_WEIGHT` in `sim.ts` sets how
  far a rating advantage carries in each format, the best-of-four season draw in
  `opponents.ts` sets how strong a league field is, and `bestOf` in `trophy.ts`
  sets how wide the invitational's shortlist is. All three move championship
  rates by tens of percent. Re-measure after touching any of them — and
  `EDGE_WEIGHT` now feeds the league, the knockouts, the table and the trophy,
  so a change there moves everything at once.
- **The simulation is merit, not noise, and it is checkable.** Across three
  thousand matches the observed win rate tracks the predicted one within a few
  points at every rating edge (61% observed against 61% predicted at an edge of
  eight, 73% against 70% at fourteen). Holding the field constant and varying
  only the XI, the stronger side finishes higher in **71%** of pairs, with a
  clean gradient from 12% of tables won at strength 80–85 to 56% at 95+.
- **Wikidata's query service answers a request it cannot finish inside sixty
  seconds with partial results, a 200, and no warning.** Two earlier versions of
  `fetch-nations.mjs` were quietly wrong because of it — Pakistan came back with
  3,254 claims one run and 1,205 the next. It now sends the exact list of
  identifiers in batches, so it can state how many of a known list came back.
- `rosters.ts` is the old hand-written archive. Nothing imports it any more; it
  survives only as a source of full names for `npm run archive`.

SPIN XI is an independent fan-made prototype, unaffiliated with any cricket
board, league, franchise or player association.
