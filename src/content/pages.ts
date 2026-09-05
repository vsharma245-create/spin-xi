/**
 * The written pages: what the game is, where its numbers come from, and how
 * the cricket in it is decided.
 *
 * These are not React routes. They are rendered to standalone HTML at build
 * time and served as real files, which means a reader with scripts turned off,
 * a search crawler and a human reviewer all see the same thing — the whole
 * page, immediately, with no application to boot first. A single-page app
 * leaves an empty div behind for all three of them.
 */

export interface Page {
  slug: string
  title: string
  /** Shown in search results and on the card when the link is shared. */
  blurb: string
  /** One line under the heading. */
  standfirst: string
  body: Section[]
}

export type Section =
  | { h: string }
  | { p: string }
  | { list: string[] }
  | { quote: string }
  | { table: { head: string[]; rows: string[][] } }

export const PAGES: Page[] = [
  {
    slug: 'how-ratings-work',
    title: 'How SPIN XI rates a cricketer',
    blurb:
      'Every rating in SPIN XI is computed from ball-by-ball records of matches that were actually played. This is the method, including the three times it was wrong.',
    standfirst:
      'No rating here is copied from anywhere, and none is anybody’s opinion. This is how 42,165 player-seasons were scored, and the three corrections that were found by measuring rather than by eye.',
    body: [
      {
        p: 'A rating in SPIN XI is a number between 40 and 99 attached to one player in one season of one competition — Chris Gayle in the 2011 Indian T20 League, not Chris Gayle in general. It is computed from what he did in the matches that season, delivery by delivery, and from nothing else.',
      },
      { h: 'Distance from the middle, not rank' },
      {
        p: 'A player-season’s rating is how far it stands from the middle of the field, in standard deviations, against everyone who played the same format. It is deliberately not a percentile.',
      },
      {
        p: 'Percentile was the first attempt and it fails for a reason worth stating: rank cannot express distance. It says a player was better than eighty-five per cent of the field but never whether by a little or a lot. Under that method the great and the merely good landed a point apart, and 669 players sat at 90 or above — which makes 90 meaningless. Measuring distance instead, thirteen players reach 95 across the entire archive.',
      },
      { h: 'What the numbers are' },
      {
        list: [
          '<strong>Batting</strong> — runs per innings, scaled by strike rate against the format’s par. Scoring 40 at a run a ball in a Twenty20 is not the same achievement as scoring 40 at a run a ball in a Test, and the par figure is what makes them comparable.',
          '<strong>Bowling</strong> — wickets per match, scaled by economy against the format’s par. Wickets alone rewards the bowler who buys them; economy alone rewards the bowler who never threatens.',
          '<strong>The three figures on a card are the record, not decoration.</strong> A batter’s <code>BAT / CONS / SR</code> is his batting rating, his average and his strike rate. A spinner’s <code>GUILE / WKT / ECON</code> is his bowling rating, his wickets per match and his economy.',
        ],
      },
      {
        p: 'A quick bowler’s headline figure is <strong>THREAT</strong> rather than PACE. Ball-by-ball data records no delivery speeds at all, and calling the number PACE invited precisely the question it could not answer.',
      },
      { h: 'Three corrections, all found by measuring' },
      {
        p: 'Each of these was a real fault in a shipped version, and each was caught by checking outputs against cricket rather than by reading the code.',
      },
      { h: 'Competitions are graded against each other' },
      {
        p: 'The first version treated every non-international competition as equivalent, so a hundred in a weak league counted like a hundred in the Indian T20 League. John Davison — five Canadian seasons — came out the best player in the game at 95, above Tendulkar, Dravid, Ponting, Kallis and Sehwag, who all sat at 91.',
      },
      {
        p: 'Competitions are now graded from the cricket itself: a two-way model over players and competitions, solved by alternating between them and tied together by the people who appear in several. The output is not an opinion about which league is strongest — it is a measurement of what the same players did in both. It reports the SA20 and the Indian T20 League as the hardest places to bat, and the T20 Blast and the Bangladesh Premier League among the easiest.',
      },
      { h: 'Weak isolated cricket is less evidence, not just less value' },
      {
        p: 'Discounting a weak competition’s value could not fix the problem on its own, and this is the subtle part. A player who never leaves that cricket has nobody to be compared with, so the model believes his record because nothing contradicts it. Fourteen wickets in eight matches survived a forty per cent haircut and still came out in the high eighties.',
      },
      {
        p: 'Eight untested matches is closer to three matches’ worth of knowing, and three matches is not enough to be rated above Tendulkar on. Treating thin evidence as thin evidence moved Leverock from 94 to 84, Dhaniram from 87 to 79 and Davison from 95 to 88.',
      },
      { h: 'Short seasons regress to the mean' },
      {
        p: 'Measured in matches rather than in deliveries, because impact is a per-match rate: it is a short season that inflates it, not a short spell. A player with two brilliant games is not rated as though he had a brilliant season.',
      },
      { h: 'Career best, as against one summer' },
      {
        p: 'The game offers two ways to rate the same player. <strong>Season form</strong> uses the card for the season on it — a lean year is a lean card. <strong>Prime</strong> rates every player at his career best, whichever season that was.',
      },
      {
        p: 'A prime rating is not simply the highest number a player ever posted. One outstanding season out of ten is more likely to contain luck than one out of two, so a peak is pulled toward what the player typically was, and pulled less the longer the career it sits in. Opponents are rated the same way, so a prime draft is a prime field and the tournament stays a contest.',
      },
      { h: 'What a player was, as against what he did' },
      {
        p: 'Two different questions, kept in two different places. A player-season holds what he did that summer. The player record holds what he was across a career — his primary role, his career-best rating, and the side he is most associated with.',
      },
      {
        p: 'Roles are not inferred from figures where anybody has stated them. Each player’s role and bowling style are read from his own Wikipedia entry, joined by Cricsheet identifier — 2,077 bowlers have their pace or spin recorded that way rather than guessed. It matters because a medium-pacer and an off-spinner can have identical economy rates, and nothing in the ball-by-ball data says which is which.',
      },
      { h: 'Checking it' },
      {
        p: 'Every rule the archive is supposed to obey is checked against the whole archive rather than a sample: all 42,165 player-seasons, nineteen rules each, with any failure printed. The corrections above were found because outputs were compared against cricket, which is the only test that catches a rating being confidently wrong.',
      },
    ],
  },

  {
    slug: 'how-the-simulation-works',
    title: 'How the match engine works',
    blurb:
      'SPIN XI plays every delivery between the man bowling and the man facing. The score is what comes out, and so is the result. This is how.',
    standfirst:
      'Most sports simulators decide a result and then write a scoreline to fit it. This one bowls the ball.',
    body: [
      {
        p: 'The first version of this engine was handed a win or a loss, invented a score that fitted, and shared that total across the eleven. It had the direction of causation backwards, and everything wrong with it followed from that single decision.',
      },
      {
        p: 'Two sides with the same average made the same runs, so an eleven built around Chris Gayle and AB de Villiers scored exactly what an eleven of accumulators scored. The bowler at the other end never entered into the calculation at all. And because the result came first, a side of the best players in the archive could lose to a modest one for no reason a viewer could see.',
      },
      { h: 'The direction, reversed' },
      {
        quote:
          'Before: a coin decides the result, a score is invented to fit, the card spreads that total across the eleven. Now: every delivery is bowled, the card is read off them, and the result is whatever the second innings did.',
      },
      {
        p: 'Nothing decides the outcome. It is the residue of about 250 deliveries, each one a contest between two named players.',
      },
      { h: 'What is decided on each ball' },
      {
        list: [
          '<strong>Who is bowling</strong> — quotas, no consecutive overs, and a captain rather than a rota: the best bowlers take the new ball and are held back for the death, a man being hit about is taken off sooner than one who is not, and when wickets are wanted the ball goes to whoever is likeliest to take one.',
          '<strong>The bowler against the batter</strong> — his threat and his economy against the batter’s quality and tempo, and specifically against the kind of bowling being bowled.',
          '<strong>Whether he is set</strong> — nobody arrives at the crease in form. A batter plays himself in over about six balls in a Twenty20 and half an hour in a Test, and a tail-ender never gets there.',
          '<strong>Where the innings is</strong> — powerplay, middle overs, or the death.',
          '<strong>The situation</strong> — wickets in hand, and the rate still required. Nine down needing fifty is a plea, not a licence.',
          '<strong>Conditions</strong> — the surface, dew under lights, cloud cover.',
        ],
      },
      { h: 'Pace and spin are different problems' },
      {
        p: 'Every batter carries two batting ratings: one against pace and one against spin, computed from 4.5 million deliveries classified by the bowler’s own stated style. Chris Gayle in 2018/19 comes out at 55 against pace and 99 against spin. Irfan Pathan in 2011 is the exact reverse.',
      },
      {
        p: 'Forty-six per cent of players differ by eight rating points or more between the two. It is the argument every cricket conversation about a batter arrives at within a minute — he cannot play spin, he is uncomfortable against genuine pace — and until it was measured, a turning pitch meant nothing to any particular player.',
      },
      { h: 'Catches go down' },
      {
        p: 'Roughly one chance in thirty is dropped, weighted by what the fielding side actually caught per match, and a drop is a life. The rate matters more than it looks: at one chance in ten the better side lost twelve percentage points of win rate, because it creates most of the chances and therefore forfeits most of the drops. An attack that keeps beating the bat has to be worth having.',
      },
      { h: 'Bowlers tire' },
      {
        p: 'A spell is consecutive overs, and the fourth of them is not the first. Pace drops, length goes, and about a run an over comes off it. That is the whole reason a captain rotates an attack rather than bowling his best man straight through, and without it there was no cost to doing exactly that.',
      },
      { h: 'Rain, and a revised target' },
      {
        p: 'About one limited-overs match in twenty is interrupted, likelier under an overcast sky than a clear one. When rain takes overs off a chase, the target is revised upward per over rather than scaled straight down — a side with all ten wickets and half its overs has far more than half its scoring left in hand. That is the idea behind Duckworth-Lewis, and it means a side can win having made fewer runs than the other.',
      },
      { h: 'A Test can be drawn' },
      {
        p: 'A captain declares; he does not run out of overs. A side bats until its lead is enough and until enough of the match remains to bowl the opposition out, and those two pull against each other — every over batted is an over unavailable for taking ten wickets.',
      },
      {
        p: 'And a fourth innings is not always a chase. Four hundred to get with a day left is not a target, it is a warning, and a side in that position blocks. Without that behaviour a Test was drawn three times in a hundred; with it, twenty-five, which is Test cricket.',
      },
      { h: 'Form moves through a season' },
      {
        p: 'A season is not eleven players at their average, eleven times over. Somebody is in the form of his life by the sixth game and somebody has not middled it since the first — and both come out of what has actually happened rather than a dice roll before each match. A hundred pulls a man out of a trough; three failures put him in one.',
      },
      { h: 'Class tells further the longer the game is' },
      {
        p: 'The same gap in ability is worth more over fifty overs than twenty, and more again over five days. It is why Twenty20 is the format upsets live in — there is not enough of it for the better side to be proved better, which is close to why it was invented. Without this, a one-day match came out flatter than a Twenty20, which is backwards.',
      },
      { h: 'What the engine produces' },
      {
        table: {
          head: ['Measure', 'Twenty20', 'One-day', 'Test'],
          rows: [
            ['Par score', '160', '262', '384'],
            ['Run rate, powerplay', '8.2', '5.2', '—'],
            ['Run rate, middle overs', '8.5', '5.1', '3.1'],
            ['Run rate, death', '12.2', '6.8', '—'],
            ['Matches drawn', 'none', 'none', '25%'],
          ],
        },
      },
      {
        p: 'None of those is a target the code aims at. Each is what came out of playing the deliveries, and each is checked against thousands of simulated matches on every change.',
      },
      { h: 'The card cannot lie' },
      {
        p: 'Because there is only one account of a match, a bowler’s figures of 4-0-22-3 are his four overs and his three wickets. Nothing is shared out afterwards to make the totals agree, and the ball-by-ball replay you can watch is the same innings the scorecard describes rather than a reconstruction of it.',
      },
    ],
  },

  {
    slug: 'the-archive',
    title: 'The archive: where every number comes from',
    blurb:
      'SPIN XI is built from 15,270 ball-by-ball match records published by Cricsheet. This is what is in the archive, how it is assembled, and what is deliberately not in it.',
    standfirst:
      '15,270 matches, 49,927 rated player-seasons, and not one figure copied from another rating system.',
    body: [
      {
        p: 'Every number in SPIN XI is computed from ball-by-ball records of matches that were actually played. The source is <a href="https://cricsheet.org" rel="noreferrer noopener">Cricsheet</a>, which publishes them freely and explicitly for this kind of use.',
      },
      { h: 'What is in it' },
      {
        table: {
          head: ['', ''],
          rows: [
            ['Matches ingested', '15,270'],
            ['Rated player-seasons', '49,927'],
            ['In the draftable archive', '42,165'],
            ['Squad-seasons', '2,486'],
            ['Distinct players', '3,989'],
            ['Teams', '168'],
            ['Competitions', '14'],
            ['Seasons covered', '2002–2026'],
          ],
        },
      },
      {
        p: 'The competitions are Test cricket, one-day internationals and Twenty20 internationals, together with the Indian T20 League, the T20 Blast, the Big Bash, the Bangladesh Premier League, the Caribbean Premier League, the Pakistan Super League, The Hundred, the Lanka Premier League, the SA20, Major League Cricket and the Mzansi Super League.',
      },
      { h: 'A squad is who actually played' },
      {
        p: 'A squad in SPIN XI is everyone who took the field for that side that season — between eleven and thirty-four players, eighteen on average. Players who were signed but never played are absent, because a ball-by-ball record cannot see them, and inventing them would put men in elevens they never belonged to.',
      },
      { h: 'What is joined on from elsewhere' },
      {
        p: 'Two things are not in the ball-by-ball data and are read from public sources rather than guessed:',
      },
      {
        list: [
          '<strong>Nationality and full names</strong>, joined to Wikidata by Cricsheet identifier. Scorecards record “CH Gayle”, which is not a name you would put on a card.',
          '<strong>Stated role and bowling style</strong>, read from each player’s own Wikipedia entry — 2,077 bowlers have their pace or spin recorded rather than inferred. A medium-pacer and an off-spinner can have identical figures, and nothing in the deliveries distinguishes them.',
        ],
      },
      { h: 'Partnerships' },
      {
        p: 'Every delivery names the striker and the man at the other end, so a real record of who has batted with whom falls out of the same pass that counts the runs. 9,455 pairs have faced enough deliveries together to be worth knowing about, and it is why a side of players who have actually played together is worth a little more than eleven strangers of the same rating.',
      },
      { h: 'What is deliberately not in it' },
      {
        list: [
          '<strong>No ratings from anywhere else.</strong> Nothing is scraped from a commercial statistics provider, and no rating is copied. The numbers are this game’s reading of the public record and nobody else’s.',
          '<strong>No official logos, crests or player photographs.</strong> Team and player names are used descriptively.',
          '<strong>No invented players and no invented matches.</strong> Where the record is silent the archive is silent.',
        ],
      },
      { h: 'How it is checked' },
      {
        p: 'The archive is verified as a whole rather than sampled. All 42,165 rows are checked against nineteen rules each. A separate check reads a thousand generated scorecards looking for cricket a scorer would refuse to write down — three runs off the ball that got a batter out, eleven dismissals against ten wickets, 4.4 overs in a twenty-over game. All three of those were real faults, caught that way.',
      },
      { h: 'Licensing and use' },
      {
        p: 'Cricsheet data is published for public use and this game is one of the uses it was published for. SPIN XI is an independent fan-made project. It is not affiliated with, endorsed by or associated with any cricket board, league, franchise, player association or ratings provider.',
      },
    ],
  },

  {
    slug: 'about',
    title: 'About SPIN XI',
    blurb:
      'A free cricket drafting game built on the public ball-by-ball record. What it is, who made it, and what it is not.',
    standfirst:
      'Spin for a real squad. Draft one player. Build an eleven, and find out whether it holds up.',
    body: [
      { h: 'What it is' },
      {
        p: 'SPIN XI deals you a real cricket squad from a real season — Mumbai 2019, Sydney 2016/17, Australia 2003 — and you draft one player from it. Then another squad, and another, until you have eleven: four batters, a keeper, two all-rounders and four bowlers. Then your eleven plays a tournament, match by match, and you find out whether the side you built holds up.',
      },
      {
        p: 'It is free, it takes about ten minutes, and there is no sign-up: an account is created for you on your first visit so you can keep a record if you want one.',
      },
      { h: 'The four tournaments' },
      {
        list: [
          '<strong>T20 League</strong> — fourteen league games, then the playoffs.',
          '<strong>ODI World Cup</strong> — nine group games, a semi-final and a final.',
          '<strong>T20 World Cup</strong> — short and brutal: seven games, then knockouts.',
          '<strong>Test Championship</strong> — twelve Tests over two years, and draws count.',
        ],
      },
      { h: 'Watching a match' },
      {
        p: 'Every match can be watched ball by ball. The score climbs, the strike rotates, wickets land, and a chase counts down what is needed off how many. The scorecard and the replay are the same innings, because one is read off the other.',
      },
      { h: 'What it is not' },
      {
        p: 'SPIN XI is an independent fan-made cricket draft and tournament simulator. It is not affiliated with, endorsed by or associated with any cricket board, league, franchise, player association or ratings provider. Player names, team names, ratings and season data are used for descriptive and editorial purposes only. No official logos, crests or player images are used.',
      },
      {
        p: 'Ratings are computed from publicly published ball-by-ball records of matches that were actually played, and represent this game’s reading of them alone.',
      },
      { h: 'Reading further' },
      {
        list: [
          '<a href="/how-ratings-work">How SPIN XI rates a cricketer</a> — the method, and the three times it was wrong.',
          '<a href="/how-the-simulation-works">How the match engine works</a> — why the ball is bowled before the result is known.',
          '<a href="/the-archive">The archive</a> — 15,270 matches, and what is deliberately left out.',
        ],
      },
      { h: 'Contact' },
      {
        p: 'Questions, corrections and complaints about a rating are all welcome, and the last of those is the most useful. Write to <a href="mailto:hello@spin-xi.com">hello@spin-xi.com</a>.',
      },
    ],
  },
]
