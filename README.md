# SPIN XI

A cricket drafting game. Spin for a historical squad, draft one
player, build an XI, then simulate a tournament and chase a perfect unbeaten run.

Not fantasy cricket, not a stats site — a historical drafting game where the
limited random choices *are* the strategy. Play it alone, or against people you
know: a league everyone drafts into on the same locked rules, or a live draft
where four of you take turns out of one shared pool.

Every rating is computed from ball-by-ball records of **15,270 matches that were
actually played**, and every match is simulated one delivery at a time — the
score is what comes out of them, and so is the result. Nothing is copied from
another rating system and no result is decided in advance.

Live at **[www.spin-xi.com](https://www.spin-xi.com)**.

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

## The match engine

Every delivery is bowled. The score is what comes out of them, and so is the
result.

That is the whole design, and it was not the first one. The engine used to be
handed a win or a loss, invent a scoreline that fitted, and ask the card to
spread that total across the eleven — the direction of causation backwards, and
everything wrong with it followed from that. Two sides with the same average
made the same runs, so an eleven built around Gayle and de Villiers scored
exactly what an eleven of accumulators scored. The bowler at the other end never
entered into it. And because the result came first, a side of the best players
in the archive could lose to a modest one for no reason a viewer could see.

### What is decided on each ball

- **Who is bowling.** Quotas, no consecutive overs, and a captain rather than a
  rota: the best bowlers take the new ball and are held for the death, a man
  being hit about is taken off sooner than one who is not, and when wickets are
  wanted — a new batter in, a chase with all ten standing — the ball goes to
  whoever is likeliest to take one.
- **The bowler against the batter.** His threat and his economy against the
  batter's quality and tempo, and specifically against *this kind of bowling*.
- **Whether he is set.** Nobody arrives at the crease in form. A batter plays
  himself in over about six balls in a Twenty20 and half an hour in a Test, and
  a tail-ender never gets there.
- **Where the innings is.** Powerplay, middle, death.
- **The situation.** Wickets in hand and the rate still required. Nine down
  needing fifty is a plea, not a licence.
- **Conditions.** The surface, dew under lights, cloud cover, and the toss.

### Pace and spin are different problems

Every batter carries two batting ratings — one against pace, one against spin —
computed from **4.5 million deliveries** classified by the bowler's own stated
style. Gayle in 2018/19 comes out at 55 against pace and 99 against spin; Irfan
Pathan in 2011 the exact reverse. **46% of players differ by eight rating points
or more** between the two.

It is the argument every cricket conversation about a batter arrives at within a
minute — he cannot play spin — and until it was measured a turning pitch meant
nothing to any *particular* player, only to a side's average.

Half the measured difference is taken rather than all of it. The raw split
swings enormously on a season where the spinners never got somebody out, and
taken whole it drowned out how good the batter is at all: elite sides stopped
beating good ones because every one of their batters had a hole somewhere.

### Catches go down, bowlers tire, captains declare

- **About one chance in thirty is dropped**, weighted by what the fielding side
  actually caught per match, and a drop is a life. The rate matters more than it
  looks: at one in ten the better side lost **twelve points of win rate**,
  because it creates most of the chances and therefore forfeits most of the
  drops. An attack that keeps beating the bat has to be worth having.
- **A spell is consecutive overs and the fourth is not the first.** Pace drops,
  length goes, about a run an over comes off it. That is the whole reason a
  captain rotates an attack, and without it there was no cost to bowling your
  best man straight through.
- **A captain declares; he does not run out of overs.** A side bats until its
  lead is enough and until enough of the match remains to bowl the opposition
  out, and those pull against each other.
- **A fourth innings is not always a chase.** Four hundred to get with a day left
  is not a target, it is a warning, and a side in that position blocks. Without
  that, a Test was drawn three times in a hundred; with it, twenty-five.

### Rain

About one limited-overs match in twenty is interrupted, likelier under an
overcast sky than a clear one. When rain takes overs off a chase the target is
revised *upward per over* rather than scaled straight down — a side with all ten
wickets and half its overs has far more than half its scoring left in hand. So a
side can win having made fewer runs than the other, which the card says out loud
and which the scorecard checks had to be taught is not a fault.

### Form moves through a season

A season is not eleven players at their average, eleven times over. Somebody is
in the form of his life by the sixth game and somebody has not middled it since
the first, and both come out of what actually happened rather than a dice roll
before each match. A hundred pulls a man out of a trough; three failures put him
in one. Worth about a sixth either way, and weighted toward how often he gets
out rather than how fast he scores, so it is felt without drowning out the strike
rates the cards are built on.

### Class tells further the longer the game is

The same gap in ability is worth more over fifty overs than twenty, and more
again over five days. It is why Twenty20 is the format upsets live in — there is
not enough of it for the better side to be proved better, which is close to why
it was invented. Without this a one-day match came out *flatter* than a Twenty20,
which is backwards.

### Where it lands

| | Twenty20 | One-day | Test |
| --- | ---: | ---: | ---: |
| Par score | 160 | 262 | 384 |
| Run rate, powerplay | 8.2 | 5.2 | — |
| Run rate, middle | 8.5 | 5.1 | 3.1 |
| Run rate, death | 12.2 | 6.8 | — |
| Matches drawn | none | none | 25% |

None of those is a target the code aims at. Each is what came out of playing the
deliveries, and each is checked on every change.

Against drafts a player can actually make — spin, take the best man on offer,
repeat:

| Tournament | Drafting well | Drafting loosely |
| --- | --- | --- |
| T20 League | 72% of group games, 15 titles in 40 | 65%, 12 |
| ODI World Cup | 69%, 10 titles | 63%, 9 |
| T20 World Cup | 57%, 5 titles | 45%, 3 |
| Test Championship | 50%, 17 titles | 38%, 7 |

Drafting well is worth about ten points of win rate and roughly doubles the
title rate, which is what a draft game is for.

A note on measuring this. An earlier version of this section reported 93% and
called season mode too easy. That was the win rate of an XI with every top-six
batter on 99 — free choice of the eleven best players in history, which the
spin-and-pick draft never offers anybody. The benchmark was unreachable and the
worry was imaginary.

### The field you play

A league is not a random sample of every club that ever existed. Each club draws
six of its seasons and fields the best of them, and the fixture list is sampled
with a bias toward the top of the table rather than uniformly — so the good
sides are nearly always in it and the weak ones turn up now and then.

Not scaled to the player. A field that improves because you drafted well is a
field that never lets you feel you drafted well.

## Watching a match

Every match can be **watched, ball by ball**. The scoreboard climbs, the strike
rotates, wickets land and hold the screen, and a chase counts down what is needed
off how many. It runs at 1×, 2× or 4×, pauses, and skips — a Twenty20 takes about
ninety seconds if you sit through all of it. Tests go over by over, because two
thousand deliveries is not a thing anybody will sit through inside a tournament.

Knockouts and Champions Trophy ties play this way by default; any league match can
be replayed on demand, from the live feed during the season or from the match log
afterwards.

A knockout used to resolve on the click. You chose to bat and the result was
already on screen, so the final of a tournament took less time to play than a
single group game took to animate.

**The replay is the match.** Not a reconstruction of it — the deliveries the
engine bowled, replayed. There was once a second implementation here that
recovered partnerships from the balls each batter faced and laid the runs back
over them: a good guess at an innings that had never happened. Now there is
nothing to guess at, and that code is gone.

### The card is a reading of the match, not an explanation of it

Every match generates a full scorecard for both sides — all eleven batters with
real names from that squad-season, extras, totals, and both sets of bowling
figures. A side that lost four wickets shows six batters, four out and exactly two
not out; the rest are **DNB**.

Every figure on it is something that happened. A batter's 43 off 29 is
twenty-nine deliveries he faced and forty-three runs he hit. A bowler's 4-0-22-3
is his four overs and his three wickets, and the man who bowled the eighteenth is
the man who went for sixteen in it.

That sounds obvious and it was not true before. The old card shared a decided
total across the order on a skewed curve and shared the wickets out on another,
so a four-for belonged to nobody in particular, and the two cards agreed with the
scoreboard only because both were built backwards from it. 627 lines of that are
gone. There is one account of the match now, and everything else is read off it.

**A Test is four innings** — two visits to the crease a side, so a first-innings
lead and a fourth-innings chase are both on the card.

Every match also records **the biggest hit and the fastest ball** — 106 metres,
153 kph. Neither is in the ball-by-ball data and neither could be: Cricsheet says
a six was hit, not where it landed. But the match is simulated in the first
place, so these belong to the same fiction as the runs, and they are drawn from
the players who did it. What would not be allowed is a fabricated figure attached
to a real career, and neither of these is that.

`npm run cards:check` reads a thousand cards across all four formats looking for
cricket a scorer would refuse to write down, and it has caught real things: a
batter three not out off one ball and given lbw — the single delivery he faced was
the one that got him — eleven dismissals against ten wickets, and 4.4 overs in a
twenty-over game.

`npm run play:check` replays every innings of sixteen hundred matches, about 1.4
million deliveries, and checks the innings coming out is the one that went in.

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
were actually played** — 15,270 of them, from [Cricsheet](https://cricsheet.org),
which publishes them freely for exactly this use.

```
168 teams · 3,989 players · 2,486 squad-seasons · 42,165 player-seasons · 2002–2026
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

A player-season's rating is **how far it stands from the middle**, in standard
deviations, against everyone who played the same format — not its percentile.
Percentile was the first attempt and it cannot express distance: rank says a player
was better than 85% of the field, never whether by a little or a lot. So the great
and the merely good landed a point apart and 669 players sat at 90 or above. Now
thirteen players reach 95 across the whole archive, and the top of it reads Shakib,
Watson, Jadeja, Hafeez, Afridi, Yuvraj.

- **Batting** — runs per innings, scaled by strike rate against the format's par.
- **Bowling** — wickets per match, scaled by economy against the format's par.
- **The three figures on a card** are the record, not decoration. `BAT / CONS / SR`
  for a batter is the batting rating, the average and the strike rate; `GUILE /
  WKT / ECON` for a spinner is the bowling rating, wickets per match and economy.
  A quick bowler's headline figure is **THREAT**, not PACE — nothing in ball-by-ball
  data records how fast a delivery was, and calling it PACE invited exactly the
  question it could not answer.

Three corrections matter, and all three were found by measuring rather than by eye.

**Competitions are graded against each other.** `standardOf()` returned 1 for
anything that was not an international, so a hundred in the Bermuda league counted
like a hundred in the IPL, and John Davison — five Canadian seasons — came out the
best player in the game at 95, above Tendulkar, Dravid, Ponting, Kallis and Sehwag,
who all sat at 91. Competitions are now graded from the cricket itself: a two-way
model over players and competitions, solved by alternating, tied together by the
people who play in several. It reports SA20 and the IPL as the hardest places to bat
and the T20 Blast and BPL the easiest — nobody's opinion, just what the same players
did in both.

**Weak isolated cricket is less evidence, not just less value.** Fourteen wickets in
eight matches against Bermuda's neighbours survived a 40% haircut and still came out
in the high eighties. Discounting the value could not fix it, because a player who
never leaves that cricket has nobody to be compared with — the model believes the
record because nothing contradicts it. Eight untested matches is closer to three
matches' worth of knowing, and three matches is not enough to be rated above
Tendulkar on. Leverock 94 to 84, Dhaniram 87 to 79, Davison 95 to 88.

**Short seasons still regress to the mean**, measured in matches rather than
deliveries, because impact is a per-match rate: it is a short season that inflates
it, not a short spell.

### What he does against pace, and against spin

Two batting ratings per player-season, not one, computed from **4.5 million
deliveries** classified by the bowler's own stated style — read off his Wikipedia
entry and joined by Cricsheet identifier, because a medium-pacer and an
off-spinner can have identical figures and nothing in the deliveries
distinguishes them. 2,077 bowlers are typed that way.

Gayle 2018/19: **55 against pace, 99 against spin**. Irfan Pathan 2011 the exact
reverse. 46% of players differ by eight points or more.

Anchored to the overall batting rating and moved from it by how much better or
worse the split actually was, weighted by the balls it rests on — 120 deliveries
is where it starts to be believed. Below that it stays close to what he is
generally worth, because a good week against spin is not a fact about anybody.

### How safe a pair of hands

Catches taken per match, which is the only fielding record the ball-by-ball data
keeps. A blunt instrument — a slip fielder gets more chances than a man on the
boundary — but a real one, and without it every dropped catch in the game would
have been drawn from thin air.

### What a player was, as against what they did in one summer

`squad_players` holds a player-season. `players` holds the **player** — primary role,
peak rating and the format and season it happened in, the side they are remembered
for, and career totals. The distinction matters because a single season is often too
thin to say: a spinner who bowled nothing on one tour reads as a batter.

**Roles come from the player's own article where one exists.** 2,704 players have
their role stated in words — "Batsman", "All-rounder", "Wicket-keeper-batsman" — which
is a fact about the player rather than an inference from a sample. The rest are read
from career totals, with bars scaled to a career: three dismissals is a season's
evidence of keeping and a career's evidence of standing in once.

A season overrules the career only when it has the volume to, and the volume has to be
in the discipline being claimed. Overs bowled and dismissals taken are evidence that
something happened; runs scored are not evidence that nothing else did. And the
fallback never contradicts the row it is written on: a bowler's role is not applied to
a season with no overs in it, and a keeper's is not applied to a season spent bowling
seam.

Tendulkar, Sehwag, Dravid, Kohli and Rohit bat. Gilchrist, Dhoni, Sangakkara and
Buttler keep. Kallis, Stokes, Shakib, Jadeja and Dilshan are all-rounders. Warne and
Murali spin; McGrath, Steyn, Akram, Malinga and Bumrah bowl quick.

### Prime is a believable peak, not the best number they ever posted

Taking the single best season sounds like what "prime" means and quietly wrecked the
mode. The maximum of a noisy run is worth more the noisier the run: an all-time great
is near his best most years and gains almost nothing, while a fringe player's one good
summer sits far above everything else he did. Priming lifted Zimbabwe's XI twenty-one
points and Australia's eight, the whole field bunched at the top, and a drafted
all-star side lost to Scotland.

The peak is now pulled back toward the player's own ordinary level in proportion to
how little cricket stands behind it — and it is drawn **per format**. Half the archive
used to take its prime from a different kind of cricket entirely: Shane Watson's T20
league card went from 65 to 98 on the strength of a World Cup season.

Identity is the **player**, never the name. Forty-one names in the archive belong to
more than one cricketer — there are two Rashid Khans — so keying on the name made
drafting one block the other, and lent the better one's peak to the other. And names
come from the article title where there is one: Cricsheet records Prabhsimran Singh as
"P Simran Singh", and trimming the initial produced a player who does not exist.

### Facts a scorecard does not state

Three things a scorecard leaves out. One is now looked up rather than inferred;
the other two are inferred and validated.

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

- **Pace or spin** used to be read from where in the innings a bowler is used.
  That is a proxy, and a proxy is wrong at the edges: it made Ajit Agarkar a
  spinner, because a fast-medium containment role is bowled in exactly the overs
  a spinner bowls. Moving the threshold only changes who it is wrong about.

  So it is asked instead. `npm run bowling` takes Cricsheet's identifier for a
  player, reads the Cricinfo key beside it, turns that into an English Wikipedia
  article through Wikidata, and reads the style out of the infobox in words —
  "right-arm fast medium", "leg spin". **2,077 of 3,482 bowlers** are typed from
  their own article, written to `data/bowling.json` and committed, so the answer
  is auditable and the build needs no network. A re-run only asks about players
  it has no answer for.

  Cricsheet has no bowling-style field of its own: its register is identifiers
  and its match data is deliveries. It supplies the identity, Wikipedia the
  fact. Everyone still unanswered keeps the middle-over reading, whose threshold
  now sits at 0.62 — in the gap between every genuine spinner (0.64 and up) and
  every quick (0.58 and below). Fourteen bowlers nobody argues about are an
  audit check so it stays there.

- **Who kept wicket** is read from dismissals, and only a stumping proves it —
  nobody but the keeper makes one. Scoring catches alongside them put Virat
  Kohli behind the stumps for Bengaluru in 2024: 464 catches, not one stumping
  in a hundred seasons, and a formula that cannot tell a brilliant outfielder
  from a keeper. So stumpings are proof rather than weight, read across a whole
  career, and catches only rank the men who have already proved they keep. Among
  those, the one who has kept most often: ranking by catches in a single season
  found the best pair of hands, which handed Bangladesh's 2019 T20 gloves to
  Mahmudullah while Mushfiqur Rahim stood in the same squad as a batter. **Every
  squad has a keeper**, and 12 of 2,766 bowl more than an over a match.

### Where it lives

The archive ships as a **single static file** and the database is the fallback.

```
supabase/schema.sql       tables, a read-only public policy, a version stamp
supabase/archive.sql      the whole archive, generated — never edited by hand
public/archive.json       the same archive, one file, ~980 KB over the wire
src/data/repository.ts    the file first, the cache second, Postgres last
src/data/squads.ts        the query layer — seasons, prime, pools, feasibility
```

It used to be read out of Postgres on every visit: **forty-three paged requests**
against a view joining four tables, each one ordering all 42,165 rows and
counting them again. Sixteen and a half seconds when it worked, and a cancelled
statement when the instance was busy — which is the "rain delay" players were
getting. Measured on the live database, a bare `COUNT(*)` on that view timed out
at 7.5 seconds.

None of that work needed doing. The archive changes when it is rebuilt and not
otherwise, so the build writes it out as one file and the CDN serves it
compressed. **Two database calls on a cold visit**, and the archive itself in
about 160 ms.

The build stamps one id into both the file and the SQL, so the id is also the
cache key: a returning player whose copy matches downloads nothing and parses
nothing.

Postgres stays the source of truth and the fallback. The file is asked for twice
before the database hears about it — nearly every failure is transient, and a
dropped connection on a phone used to send that visitor into forty-three requests
fetching *more* bytes from a slower place than the file that had just failed.
Anything already on the device is served next. Only then does it read the tables,
and it reads `roster_pages`, a materialized copy held in read order with a unique
index, so a page is an index scan rather than a sort of the whole join.

And it no longer arrives as a stampede. Those pages went out as forty-two
simultaneous requests — forty-two pooled connections held by one visitor, so two
or three unlucky people at once could exhaust the pool and error out everybody
else. Four lanes now.

The trade is that a rating edited straight in the Supabase dashboard waits for a
deploy to reach players rather than arriving on their next load. That property was
costing sixteen seconds on every visit and taking the site down.

**Why the game holds it all in memory**: a spin has to feel instant, and a spin
that waits on a round trip does not. Reads go through plain `fetch` against
PostgREST — the full Supabase client would have added 400 KB of auth, storage and
realtime code to make three GETs.

Ratings are stored; averages and strike rates are stored as the counts they came
from. A rating is a distance across a whole population and cannot be recomputed
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
npm run bowling      # each bowler's stated style, from their own article
npm run ingest       # parse ball-by-ball, split every batter's record by
                     #   bowling type, count partnerships and catches
npm run rerate       # grade the competitions and re-score every player-season
npm run nations      # nationality and full names, by identifier join to Wikidata
npm run roles        # each player's stated role, from their own article
npm run facts        # the figures the written pages are built from
npm run archive      # write supabase/archive.sql and public/archive.json
npm run db:push      # apply to Supabase
npm run deploy       # build and ship
```

The order matters, twice over. `bowling` comes first because `ingest` needs to
know who bowls pace and who bowls spin before it can split anybody's record by
it. And `ingest` writes its own ratings with the old percentile model, which
`rerate` then replaces — skipping that step silently undoes the whole rating
pass, which is the sort of thing that is obvious once and never again.

`archive` stamps one build id into both `archive.sql` and `public/archive.json`,
so the id doubles as the cache key. Which means the sequence after any data
change is **archive → db:push → deploy**, in that order, or a returning player
re-downloads an archive that has not changed.

Ten checks, each catching a different kind of wrong:

```bash
npm run audit        # is the cricket right? rates, distributions, outliers
npm run rows:check   # all 42,165 roster rows, 19 rules each, failures printed
npm run data:check   # the questions only the whole archive can answer
npm run cards:check  # a thousand scorecards, hunting for impossible cricket
npm run play:check   # 1.4m deliveries replayed, checked against the cards
npm run combos:check # every draft setting, checked for actually doing it
npm run draft:check  # 2,600 drafts across every crossing of every filter
npm run db:check     # the SQL against a real Postgres — and as a non-owner
npm run live:check   # a whole live draft played with nobody watching
npm run live:prod    # two real clients racing each other on production
npm run engine:check # thousands of innings: par scores, run-rate shape, who wins
```

`audit` reports rates, which is the right shape for judging a dataset and the
wrong shape for trusting a row — so `rows:check` puts every row through every
invariant and prints what fails instead of a percentage. `cards:check` reads a
thousand match cards looking for cricket a scorer would refuse to write down: it
found eleven dismissals against ten wickets, and 4.4 overs in a twenty-over
game. `db:check` applies each file twice, over the *previous* release's shape,
and reads the tables as a non-owner — because a fresh database run by its owner
has no history and bypasses row-level security, which is how three separate
bugs reached production. `live:check` exists because a backgrounded browser tab
suspends network IO, so a draft driven through one proves nothing.

`engine:check` is the one that keeps the cricket honest. It plays thousands of
innings between real sides and asserts the things a follower of the game would
notice within one over: what a par score is, that the death overs are faster than
the middle, that the top order outscores the tail, that a good attack is worth
runs, that a batting surface beats a turner, that catches go down but not
constantly, that a Test can be drawn, and that the better side wins more often
the wider the gap. None of those numbers is aimed at; all of them are measured.
It caught a powerplay running at eleven an over against a death at five, and a
one-day match coming out flatter than a Twenty20.

`data:check` asks what a single row cannot answer: whether a player is the same
player wherever they appear, whether their prime is really their prime, whether a
squad can field an attack, whether the ratings mean anything as a population. It
found identity keyed on names, primes drawn from the wrong format, and a Kenyan
squad with three men who could bowl.

`draft:check` plays whole drafts pick by pick — every crossing of format, preset,
rating mode, world teams, overseas cap and year range, each drafted best-first,
worst-first and imports-first — and checks the finished XI against the settings that
opened it. It found that a draft could reach ten of eleven with nothing in the pool
able to fill the last place, reachable by simply taking the best card offered each
time.

`live:prod` is the one no offline test can stand in for. Two anonymous accounts, a
room joined by code, and pick 0 written by both at the same moment: one lands, one is
refused, one row survives. It also waits out the real thirty-second ready window and
a real pick clock, because those two rules only exist in wall-clock time. Twenty of
ninety-six rooms froze before the fix it found.

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

## Paying for itself

The site can carry advertising, and carries none unless it is told to. With
`VITE_ADSENSE_CLIENT` unset — which is how it ships — no slot renders, no script
is fetched, no `ads.txt` is written, and the privacy policy says in as many words
that there is no advertising on the site. Set the publisher id and the ad unit
ids and the slots appear; the policy text switches with the same flag, so the
page cannot promise one thing while the site does another.

Three rules shape where and how.

**Never on the critical path.** The archive already costs about a second on a
cold load, and getting that down from sixteen was most of a day's work; a
blocking script from an ad network hands it straight back. The library is not
requested until a slot is within about a screen and a half of being seen, and
never before the game is up. A blocked or failed script is not an error — the
game does not need it.

**Never in the middle of the game.** Slots exist on the result screen, the home
page below the fold, and the ladder. There is none on the draft board, the spin,
the live match or a multiplayer room, and that is deliberate: those are the game,
and an advert in the middle of one is a reason to stop playing.

**Never a hole in the page.** Each slot reserves its height before anything
fills it, so nothing shifts under a thumb, and an unfilled slot gives the space
back instead of leaving a labelled empty box.

```
VITE_ADSENSE_CLIENT=ca-pub-…      # publisher id; unset means no advertising
VITE_AD_SLOT_RESULT=…             # any slot left blank stays empty
VITE_AD_SLOT_HOME=…
VITE_AD_SLOT_LEADERBOARD=…
```

Consent, where the law requires it, is handled by Google's own privacy messaging
in the AdSense dashboard rather than by anything in this repository.

Verification is a `google-adsense-account` meta tag rather than the snippet
AdSense offers first, and that is the point: the snippet wants the ad library in
`<head>` on every page, which puts a third-party script on the critical path of
screens that carry no advertising at all. The meta tag proves the same ownership
and loads nothing. `ads.txt` is emitted at build time from the same variable, so
the publisher id is written down once.

## The written pages

Seven of them, about 6,700 words, rendered to standalone HTML at build time and
served as real files.

```
/how-ratings-work           the method, and the three times it was wrong
/how-the-simulation-works   why the ball is bowled before the result is known
/best-cricket-seasons       the forty highest-rated player-seasons on record
/t20-league-strength        which competition is hardest, measured
/how-to-draft               what ten thousand simulated seasons say
/the-archive                15,270 matches, and what is deliberately left out
/about                      what the game is, and what it is not
```

**Not React routes.** A single-page app leaves an empty div behind for anybody
not running its scripts, and the three readers who matter most for a page like
this — somebody with scripts off, a search crawler, and a human reviewing the
site — are all in exactly that position. On a static host a real file is served
ahead of the application's catch-all, so these are real files: 1,244 words of
readable article at `/how-ratings-work` with no application to boot first.

The three data pages are generated from the same archive the game deals cards
from, by `npm run facts`, so a table on a page and a card in a draft cannot
disagree. The league-strength table is the two-way competition model the ratings
already use, printed rather than hidden — SA20 and the Caribbean Premier League
hardest to bat in, the Bangladesh Premier League and the T20 Blast easiest.

This exists because AdSense rejected the site for **low value content**, and the
verdict was right: every route was the game or a legal page, so somebody arriving
had a thing to play and nothing whatsoever to read. The `<noscript>` description
added for crawlers is never seen by a reviewer with scripts running.

## Playing against people

Two modes, different in kind rather than in degree.

**Leagues** are asynchronous, and are the ones that fit how the game gets
shared. A host settles the rules once, plays their own season, and sends a link;
everybody who opens it plays those exact rules whenever they like, and the best
season by the deadline wins. Nobody has to be online at the same time, which
matters because the arguing happens in a group chat.

The rules are the league, so the database keeps them. Every rule column on
`leagues` has a counterpart on `results`, and a trigger refuses any season whose
settings disagree — playing on Easy in a Hard league is rejected at the write
rather than noticed afterwards. Three more things it holds rather than the
interface: the scoring rule (whether a replay replaces your score or has to beat
it) is chosen once and locked, because a host who can change the terms while
losing is not running a league; the host must have played before anybody can
join, so they cannot watch the field land and tune their own run against it; and
a league is readable only by its members, so the standings of every league on the
site are not one unfiltered request away.

**Live drafts** are up to four people at once, taking turns out of one shared
pool. A squad somebody else has taken is gone — that is what makes it a draft
rather than four solo games sharing a clock. Order snakes 1-2-3-4-4-3-2-1,
because straight rotation hands the first seat the best of every round.

A room stores almost nothing. Which squad comes up on pick *n* is computed from
the seed and *n*; whose turn it is, is snake order from *n*; when that turn
expires is the previous pick's timestamp plus the clock. So there is no mutable
state for two clients to disagree about, and reconnecting is fetching the picks
and replaying them.

That is also what lets a seat keep drafting when somebody leaves. The bot's
choice is deterministic — best available for the neediest slot, ties broken by
identifier — so every client works out the same pick, and the primary key on
`(room, round, pick_no)` means the first write wins and the rest bounce off. No
referee, no server. Empty seats become bots the moment the host starts, because a
seat nobody is sitting in is not deciding.

A room is a session, not one draft: when the XIs are full each seat plays its
season, the four are set against each other, and everybody has thirty seconds to
say whether they want another. Saying nothing is exactly what a closed tab looks
like, so anybody who does not is out.

Neither mode's seasons appear on the public ladder or move your match rating.
They were played under rules somebody else chose, against a field who agreed to
them; ranking them against strangers who did not is not a comparison. They still
count toward a career, because they were still played.

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
read all-time, **this week**, or for today alone. There were Global / India /
Friends tabs above them for a while; they filtered nothing, showing the same
field whichever was pressed, and a control that does nothing is worse than an
absent one because the player concludes the data is wrong rather than the
feature missing.

The week exists because the other two do not serve a newcomer. All-time is
decided long before most people find it and today's is gone before they come
back; the week is the one somebody arriving on a Wednesday can still win.

**You are on it whether or not you are on it.** The board shows fifty rows.
Somebody in three hundred and forty-seventh used to open it and find a list of
strangers with nothing about themselves anywhere on it, which is a good reason
never to open it again. Your own line is pinned below with your rank out of
everybody, and it opens like any other.

**Tap any row for the eleven that scored it.** Every result has carried its XI
since the first one was saved and nothing had ever read it, so a row was a name
and a number and the only question a leaderboard actually raises — *how did they
get that* — had no answer anywhere in the game. Now you get the side, the
settings it was drafted under, and what it did.

**The daily keeps a streak.** Counted back from the last day played, and zero if
that was before yesterday: a run you broke in March is not a run, and showing it
as one teaches people to ignore numbers.

All of that costs **one request fewer than before**. The board used to fetch four
hundred seasons so the browser could throw away seven in eight of them keeping
one per player, then fetch everybody's experience separately from a view the
seasons could not be joined to. Postgres has had `DISTINCT ON` for this the whole
time. One call now returns fifty rows, the total, your rank and your streak: two
sequential round trips become one, 11.9 KB becomes 8.3, and the naive way to add
rank would have made it three.

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

**Your record** lives on the server, against an account made silently on your
first visit, and it is kept apart by the things that make two runs
incomparable: **by tournament**, **by rating mode** (season form or prime) and
**by difficulty**. Each keeps its own drafts, W–L, trophies, runs, wickets and
best points. Career totals hid what they were made of — a hundred wins says
nothing about whether they came in T20 leagues on Easy or Test championships
with the ratings hidden.

Every row on every board is a season somebody played. Results are stored with
the seed and the eleven that produced them, and the simulation is deterministic,
so any run on a ladder can be recomputed and checked. For a while the screen
said the rivals were invented and only your own row real — that stopped being
true when the boards started reading from the database, and a game that
disowns its own leaderboard is worse than one without a leaderboard.

**A public number only moves on seasons you chose the settings for.** League and
live-draft seasons stay off the ladder and out of your match rating: they were
played under rules somebody else set, against a field who agreed to them.
Ranking them against strangers who did not is not a comparison. They still count
toward a career and toward your level, because they were still played.

## Sharing a season

A share has to do three things, and this did none of them. It copied a block of text
with no address in it, so whoever read it had no way back. The site carried no Open
Graph tags, so any link that did get posted unfurled in a group chat as a bare URL.
And the draw was seeded off the clock, so "I went 11-3, try this" could not mean
anything even if it had been sent.

- **A picture.** The season is drawn on a canvas — headline, record, points, every
  match as a block of colour, and the eleven names the argument is actually about —
  and shared as a file where the browser allows it.
- **A link**, in every share, which there had never been.
- **The draw.** It is a number now, carried on the draft state and out to the result,
  so the link is a challenge rather than a boast: open it and you face the same eleven
  spins. Nothing changes for the player — the seed advances with each pick and re-roll,
  so the reel still turns up something new. It is only repeatable from the outside.

`content/` holds thirty days of posts built on figures read out of this archive, and
two tools that need nothing installed: `images/generate.html` renders every card at
both aspect ratios, and `video/generate.html` animates six promos on a canvas and
saves them as real video files. Both are browser pages; open and click.

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
  data/       repository (the fetch), squads (the query layer), account,
              records, leagues, live, challenges, nations, team identity
  game/       types, draft, opponents, engine (the deliveries), scorecard
              (reading them), playback (dressing them), sim (the season),
              review, trophy, live, conditions, chemistry, records, shareCard
  content/    pages.ts — the written pages; facts.json — their figures
  components/ PlayerCard, TeamSheet, MatchView, LiveMatch (the ball-by-ball
              scoreboard), SeasonXIDrawer, Review, SpinReel, YearRange,
              ArchiveGate, ClaimAccount, HandleEditor, AbandonDraft, Field,
              Ad, icons and crests, ui kit
  screens/    Home, Play (setup→draft→XI→sim→result→trophy), Daily, Leaderboard,
              Profile, Multiplayer, LeaguePage, LiveDraft, Legal
scripts/      ingest, rerate, nations, bowling, roles, challenges, archive,
              facts, render-pages, audit, row-probe, data-probe, card-probe,
              engine-probe, playback-probe, combo-probe, draft-probe,
              live-probe, two-client-probe, db-check, db-push
              lib/ratings.mjs — the rating model, shared by ingest and rerate
supabase/     schema.sql, archive.sql, challenges.sql   (generated)
              players.sql, analytics.sql, multiplayer.sql, live.sql
data/         bowling.json — each bowler's stated style, committed
              roles.json   — each player's stated role, committed
content/      thirty days of posts, and the tools that render them
```

One draft engine, one simulation module, one design system. `Play.tsx` owns the
game flow as a phase machine; every other screen is a leaf.

The game modules split by job, and the split follows the direction the cricket
flows in. `opponents.ts` turns squads into rated sides. `engine.ts` bowls every
delivery. `scorecard.ts` reads a card off them. `playback.ts` dresses them for
the scoreboard — names where the engine counts in indices. `sim.ts` runs the
season around all of it, `review.ts` reads the tournament back as prose,
`trophy.ts` runs the invitational, and `live.ts` holds the parts of a live draft
every client works out for itself.

`card.ts` used to sit between `sim` and the screen, inventing a scorecard to
explain a decided result. It is gone — 627 lines — along with the reconstruction
in `playback.ts` that recovered an innings from that card. Both existed only
because the match had never been played. 1,484 lines out, 1,148 in, and one
account of a match instead of two that had to be kept agreeing.

`types.ts` holds every shared type — including `Opponent` — so nothing imports in
a circle. `conditions.ts`, `chemistry.ts`, `records.ts` and `shareCard.ts` are
each one job: the weather, the partnerships, the season's best performances, and
the picture a player posts.

The SQL splits by what it owns. `schema.sql` and `archive.sql` are the cricket
and are rebuilt wholesale; `players.sql` holds accounts and results and is never
dropped; `analytics.sql`, `multiplayer.sql` and `live.sql` only ever add. They
apply in that order, and `db-check` runs each one twice — the second time over
the previous release's shape.

## Licence

**GNU Affero General Public License v3.0.** Copyright © 2026 Kirnesh Sharma.

You may read it, run it, change it and build on it. The one condition that
matters: if you run a modified version as a network service, you have to publish
your source too. That is the whole point of the Affero clause and the reason it
is this licence rather than MIT — the work is genuinely open to learn from and
to build on, and it is not open to being lifted wholesale onto a competing
domain with the changes kept private.

The full text is in [LICENSE](LICENSE).

Two things the licence does not cover, because they are not mine to license:

- **The match data** is [Cricsheet's](https://cricsheet.org), published freely
  for this kind of use. The ratings computed from it are this project's, but the
  underlying record is theirs and the credit belongs to them.
- **Player and team names** are used descriptively. Nothing here is affiliated
  with or endorsed by any board, league, franchise or player association, and no
  official logos, crests or player images are used.

## Notes for whoever picks this up

- **framer-motion is pinned to 11.18.2 deliberately.** On v13 with React 19,
  `AnimatePresence` exit animations never resolve, which strands drawers on
  screen and deadlocks `mode="wait"` transitions. Nothing in the app gates
  functionality on an animation completing — the spin reveal runs off a timer,
  not an animation callback — but don't reintroduce exit-gated unmounting.
- Everything speaks to Supabase over plain `fetch` — PostgREST and GoTrue
  directly, no SDK, which keeps 400 KB of realtime and storage code out of a
  bundle that already carries a megabyte of cricket. An account is created
  silently on the first visit, because a three-minute game that asks you to sign
  up before you have seen it loses most of the people it asks; linking Google
  later is how a record survives a cleared browser. Results, ladders, profiles
  and leagues are all server-side. Nothing but the session token and the cached
  archive lives in the browser.
- **Empty response bodies are answers, not errors.** PostgREST replies to a write
  with `Prefer: return=minimal` with no body — 204 for a PATCH but 201 for a
  POST — and handling only the first meant ten writes across the app succeeded on
  the server and threw on the client, into whichever catch was nearest. Most were
  fire-and-forget, so nothing ever said so.
- Daily challenges are deterministic from the browser date: fixed draw sequences
  in `data/challenges.ts`, and the tournament is seeded so the same XI always
  plays out the same way. Every `rand()` call in `sim.ts` is part of that
  sequence, so adding or reordering calls changes historical daily results.
- Balance is measurable rather than guessed, and the levers moved. `SHAPE` in
  `engine.ts` sets what a format is like — par rate, balls per wicket, how far
  class tells — and the best-of-six season draw in `opponents.ts` sets how strong
  a league field is. Both move championship rates by tens of percent.
  `engine:check` and a run of whole seasons is the only honest way to judge a
  change to either.
- **Measure against a draft somebody can actually make.** An earlier reading of
  this called season mode too easy at 93%, which was the win rate of an XI with
  every top-six batter on 99 — free choice of the eleven best players in history.
  The spin-and-pick draft never offers that to anybody, so the benchmark was
  unreachable and the conclusion drawn from it was wrong. Simulate the draft, then
  play the season.
- **A constraint inside `create table if not exists` is a constraint that never
  changes.** Two new event names were added to the `events` check constraint,
  the push reported success, and nothing happened — the table already existed, so
  the whole statement was skipped and the client posting those names got 23514
  back. The list now lives in an `alter table` that runs unconditionally. Worth
  remembering that `db:check` cannot see this class of bug at all: it applies
  every file to an empty database, where that statement always runs.
- **Wikidata's query service answers a request it cannot finish inside sixty
  seconds with partial results, a 200, and no warning.** Two earlier versions of
  `fetch-nations.mjs` were quietly wrong because of it — Pakistan came back with
  3,254 claims one run and 1,205 the next. It now sends the exact list of
  identifiers in batches, so it can state how many of a known list came back.
- **A fresh database run by its owner hides three whole classes of bug.** It has
  no history, so `create table if not exists` silently skips every column added
  after the first release. It bypasses row-level security, so a policy that
  recurses infinitely still passes. And its owner has every permission, so a
  trigger with no right to do its job still does it. All three reached
  production. `db:check` now applies each file over the previous shape and reads
  the tables as a non-owner role.
- **A backgrounded browser tab suspends network IO.** Two attempts to drive a
  live draft through one died halfway with `ERR_NETWORK_IO_SUSPENDED` and proved
  nothing. `npm run live:check` runs the same functions the four clients run
  against the archive in an in-process Postgres — no tab, no throttling. It is
  what would have caught the deadlock, where a seat with two slots left was
  offered a side that fitted neither and, the order being fixed by the seed,
  nobody could move.
- **Testing the database proves the rules are enforced, not that the game
  reaches them.** The schema refused a wrong-difficulty season correctly from the
  day it was written, while the interface walked players into drafting eleven
  players and simulating a whole season before the write was refused. Most of the
  bugs worth finding here were found by playing.

SPIN XI is an independent fan-made prototype, unaffiliated with any cricket
board, league, franchise or player association.
