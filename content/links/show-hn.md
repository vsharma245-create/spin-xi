# Show HN — the engineering angle

**Where:** https://news.ycombinator.com/submit
**When:** weekday, 08:00–10:00 US Eastern. Weekends are quieter but the front
page is easier to hold.
**Account:** needs a little karma or it goes straight to /newest and dies.

---

**Title**

> Show HN: A cricket simulator where the match is played ball by ball, not decided

**URL**

> https://www.spin-xi.com/how-the-simulation-works

---

**First comment** (post this immediately after submitting)

I built a cricket drafting game, and the interesting part turned out to be a
mistake I made in the first version.

The engine was handed a result — win or loss, decided from team ratings — then
invented a scoreline to fit and spread that total across the eleven players. It
had the direction of causation backwards, and everything wrong with it followed
from that one decision. Two sides with the same average rating produced identical
scores, so a team built around big hitters scored exactly what a team of
accumulators scored. The bowler at the other end never entered the calculation.
And because the result came first, the best possible team could lose to a poor
one for no reason a viewer could see.

So I rewrote it to bowl the ball. Every delivery is a contest between the man
bowling and the man facing, decided from their own ratings and bent by the over
count, wickets in hand, the required rate, the surface and the weather. The score
is the residue of about 250 of those, and so is the result. Nothing decides the
outcome.

The consequences were the fun bit. Some things I had to add because their absence
became obvious once the deliveries were real:

- **Dropped catches** at one chance in ten cost the better side twelve
  percentage points of win rate — it creates most of the chances, so it forfeits
  most of the drops. Had to come down to about one in thirty.
- **Class has to tell further the longer the game is**, or a 50-over match comes
  out flatter than a 20-over one, which is backwards. It's why T20 is the format
  upsets live in.
- **A fourth innings isn't always a chase.** Until a losing side would block for
  a draw, Tests were drawn 3% of the time. With it, 25%, which is Test cricket.
- **Every batter needs separate ratings against pace and spin.** Classifying 4.5m
  deliveries by the bowler's stated style, 46% of players differ by 8+ points
  between the two.

None of the outputs are targets the code aims at — par scores, the run-rate curve
through an innings, the draw rate — they're all measured, and there's a check
that asserts them on every change. It caught a powerplay running at 11 an over
against a death at 5.

Ratings come from Cricsheet's ball-by-ball data: 15,270 matches, 42,165
player-seasons. Deleting the old "invent a scorecard" code removed 627 lines and
made the card impossible to disagree with the match, because there's now only one
account of it.

Happy to go into any of it.

---

## Notes

- HN is hostile to anything that smells like marketing. The link goes to the
  **write-up**, not the game — that's deliberate and it's why this might work.
- Expect to be told the ratings are wrong. Engage with specifics, concede where
  they're right.
- If it sinks without trace, that's normal. Don't repost.
