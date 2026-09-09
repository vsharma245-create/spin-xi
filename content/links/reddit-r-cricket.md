# r/Cricket — the league-strength post

**Where:** r/Cricket (2.5m), then r/ipl, r/CricketShitpost is wrong for this.
**When:** during a live international or a marquee league match. Weekday evening IST.
**Account:** any account with a little history. A brand-new account posting a link reads as spam and gets auto-removed.
**Flair:** Discussion / Analysis if the sub has one.

---

**Title**

> I measured which T20 league is actually the hardest to bat in, using every ball bowled in 15,270 matches

---

**Body**

Every argument about league quality dies in the same place: a hundred in the IPL
and a hundred in the Blast are not the same hundred, and there's no obvious
exchange rate between them. Averages can't settle it, because the leagues never
play each other.

But hundreds of players play in several of them, often in the same year. That
overlap *is* the exchange rate. If a batter strikes at 150 in one league and 125
in another, in the same season, against a comparable body of bowlers, the
difference between those two numbers is telling you something about the leagues
rather than about him. With enough such players you can separate the two.

So I did that with Cricsheet's ball-by-ball data — every delivery from 15,270
matches. It's a two-way model: every player gets an ability, every competition
gets an ease, and the two are fitted against each other until they agree with
what actually happened. Competitions with few shared players get pulled toward
neutral, because a league nobody leaves can't be compared to anything.

Higher = harder.

| Competition | Hard to bat in | Hard to bowl in |
| --- | --: | --: |
| SA20 | 1.12 | 1.05 |
| Caribbean Premier League | 1.11 | 0.94 |
| The Hundred | 1.09 | 1.05 |
| T20 internationals | 1.08 | 0.95 |
| Big Bash | 1.04 | 1.03 |
| Indian T20 League | 1.02 | 1.13 |
| Mzansi Super League | 1.01 | 1.02 |
| Major League Cricket | 0.95 | 0.97 |
| Pakistan Super League | 0.94 | 1.06 |
| Bangladesh Premier League | 0.92 | 0.88 |
| Lanka Premier League | 0.92 | 0.93 |
| T20 Blast | 0.85 | 1.00 |

Things I didn't expect:

- **The IPL is only mid-table for batting but the hardest league in the world to
  bowl in (1.13).** That reads right to me — the batting depth is absurd, so
  runs are available, but you are bowling at that lineup on flat pitches.
- **SA20 top.** Small sample (419 player-seasons), so treat it carefully, but the
  overlap with international cricket is unusually high for a young league.
- **The Blast is the easiest place to bat by a distance**, and yet an ordinary
  place to bowl — a lot of games, a lot of teams, and the quality spread is wide.
- **T20Is come out harder than every domestic league except two.** International
  cricket wasn't assumed to be hardest, it had to earn it, and it did.

Caveats, honestly:

- This measures how hard it was to **score** and to **take wickets**. That isn't
  quite the same as which league has the best cricketers. A tournament on slow,
  used pitches will look hard.
- Short competitions with few shared players carry far more uncertainty than the
  tidy two-decimal numbers suggest.
- Everything is from ball-by-ball records only. No selection, no reputation.

Method and the full tables are here if anyone wants to pull it apart:
https://www.spin-xi.com/t20-league-strength

Happy to be told it's wrong — that's most of why I'm posting it. If there's a
league you think is badly misplaced, say which and I'll look at what's driving it.

*(Disclosure: this came out of a cricket drafting game I built. The link goes to
the write-up, not the game.)*

---

## Notes on posting

- **Answer every comment for the first two hours.** Reddit ranks on early
  engagement, and a post the author abandons dies regardless of quality.
- **Don't defend the numbers.** If someone says the Blast placing is wrong,
  agree it's surprising and say what's driving it. Being interesting beats being
  right.
- **Don't mention the game unless asked.** The disclosure line is enough. The
  moment it reads as marketing it's over.
- If it's removed for self-promotion, message the mods once, politely, pointing
  at the disclosure. Don't repost.
