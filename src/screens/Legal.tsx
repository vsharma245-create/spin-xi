import type { ReactNode } from 'react'
import { adsEnabled } from '../components/ads'
import { Link } from 'react-router-dom'
import { Screen } from '../components/ui'

/**
 * The privacy policy and the terms.
 *
 * These are routed outside the archive gate. A reader arriving from a store
 * listing or from Google's consent screen has no interest in the game, and
 * should not wait on a multi-megabyte squad download to read a page of text.
 *
 * Everything stated here is checked against the schema in supabase/players.sql
 * and against what the client actually sends. If either changes, this changes.
 */

const UPDATED = '22 August 2026'

function Article({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Screen className="pb-16">
      <Link to="/" className="label-lg text-moss transition-colors hover:text-cream">
        ← SPIN XI
      </Link>
      <h1 className="display mt-5 text-[28px] leading-tight md:text-[34px]">{title}</h1>
      <p className="mt-2 text-[11px] uppercase tracking-label text-moss">
        Last updated {UPDATED}
      </p>
      <div className="mt-8 space-y-7 text-[13.5px] leading-relaxed text-cream-dim">{children}</div>
      <div className="mt-12 border-t border-white/8 pt-5 text-[12px] text-moss">
        <Link to={title.startsWith('Privacy') ? '/terms' : '/privacy'} className="underline">
          {title.startsWith('Privacy') ? 'Terms of Service' : 'Privacy Policy'}
        </Link>
        {' · '}
        <Link to="/" className="underline">
          Back to the game
        </Link>
      </div>
    </Screen>
  )
}

function H({ children }: { children: ReactNode }) {
  return <h2 className="display mb-2.5 mt-8 text-[17px] text-cream first:mt-0">{children}</h2>
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-3 space-y-2 pl-5">
      {items.map((item, i) => (
        <li key={i} className="list-disc marker:text-willow">
          {item}
        </li>
      ))}
    </ul>
  )
}

export function Privacy() {
  return (
    <Article title="Privacy Policy">
      <p>
        SPIN XI is a free cricket drafting game at{' '}
        <span className="text-cream">www.spin-xi.com</span>. This page sets out exactly what it
        stores about you, which is very little, and why.
      </p>

      <section>
        <H>What we collect</H>
        <Bullets
          items={[
            <>
              <span className="text-cream">An account, created automatically.</span> The first time
              you open the game we create an anonymous account for you — a random identifier and a
              generated handle such as <em>CoverDrive42</em>. There is no signup form and we do not
              ask for anything.
            </>,
            <>
              <span className="text-cream">Your results.</span> When you finish a season we store
              what happened: the format, the settings you played under, wins, losses, draws, runs,
              wickets, net run rate, your final standing and the points earned — plus the random
              seed and the eleven you picked, which together are enough to replay the season and
              check it.
            </>,
            <>
              <span className="text-cream">Your email address, only if you ask us to.</span> If you
              choose <em>Claim your record</em> and sign in with Google, we receive your email
              address and store it so we can recognise you on another device. We receive nothing
              else from your Google account — no contacts, no files, no profile details — and we
              never see your Google password.
            </>,
          ]}
        />
      </section>

      <section>
        <H>What we do not collect</H>
        <p>
          We do not collect your name, your location or your device identifiers, we run no
          analytics package of our own, and we have never sold your data to anyone.
        </p>
        <p className="mt-3">
          One third party sees your request whether or not you do anything: the game loads its
          typefaces from Google Fonts, which receives your IP address as part of serving them.
          Nothing about your account or your results is sent with it.
        </p>
        {/* Written from the same switch that decides whether an ad is served,
            so this page cannot promise one thing while the site does another. */}
        {adsEnabled ? (
          <>
            <p className="mt-3">
              <span className="text-cream">This site carries advertising.</span> Ads are served by
              Google AdSense, which is what pays for the archive, the database and the domain. To
              serve them, Google receives your IP address and information about the page you are
              on, and may set cookies on your device to measure and to choose what to show you.
              That happens inside Google&rsquo;s systems and under its own policies, not ours: we
              are not given your identity, and nothing about your account, your squads or your
              results is passed to it.
            </p>
            <p className="mt-3">
              You can see and change what Google does with this at{' '}
              <a
                href="https://myadcenter.google.com/"
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:text-cream-dim"
              >
                My Ad Center
              </a>
              , and read how it handles data on advertising partners&rsquo; sites at{' '}
              <a
                href="https://policies.google.com/technologies/partner-sites"
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:text-cream-dim"
              >
                policies.google.com
              </a>
              . Where the law requires your consent first — the EU, the UK and Switzerland — you
              are asked before any of it happens, and you can change that answer at any time.
            </p>
          </>
        ) : (
          <p className="mt-3">
            There is no advertising, no tracking pixel and no other third-party script running on
            this site.
          </p>
        )}
      </section>

      <section>
        <H>What is stored on your device</H>
        <Bullets
          items={[
            <>
              <span className="text-cream">Local storage</span> holds your session token, so you
              stay signed in between visits.
            </>,
            <>
              <span className="text-cream">IndexedDB</span> caches the historical squad archive so
              the game starts instantly instead of downloading it again.
            </>,
          ]}
        />
        <p className="mt-3">
          Neither is used for tracking. Clearing site data for www.spin-xi.com in your browser
          removes both. If your record is not claimed, clearing it also loses your access to that
          record for good, because nothing else identifies it as yours.
        </p>
      </section>

      <section>
        <H>What is public</H>
        <p>
          Your handle, your results and your points appear on the public leaderboards — that is the
          point of them. <span className="text-cream">Your email address is never shown publicly</span>{' '}
          and is used only to reconnect you to your own record.
        </p>
      </section>

      <section>
        <H>Where it is held</H>
        <p>
          Accounts and results are stored in a Postgres database hosted by Supabase. The site
          itself is served by Cloudflare Pages. Both act as processors on our behalf. Access rules
          on the database mean one player cannot read another player&rsquo;s account or write to
          another player&rsquo;s record.
        </p>
      </section>

      <section>
        <H>How long we keep it</H>
        <p>
          Results are kept while the account exists, because a leaderboard and a career record are
          only meaningful over time. Ask us to delete your account and we remove the account and
          every result attached to it.
        </p>
      </section>

      <section>
        <H>Your choices</H>
        <Bullets
          items={[
            <>Play without ever signing in. The game is fully playable anonymously.</>,
            <>
              Ask for a copy of your data, or ask for it to be deleted, by emailing the address
              below. We will act on it.
            </>,
            <>
              Unlink Google by asking us to; the record stays, the email address goes.
            </>,
          ]}
        />
      </section>

      <section>
        <H>Children</H>
        <p>
          The game is not directed at children under 13 and we do not knowingly collect information
          from them. If you believe a child has created a record, tell us and we will remove it.
        </p>
      </section>

      <section>
        <H>Changes</H>
        <p>
          If this policy changes, the date at the top changes with it. Material changes will be
          announced in the game itself rather than made quietly.
        </p>
      </section>

      <section>
        <H>Contact</H>
        <p>
          Questions, requests and deletion requests:{' '}
          <a className="text-willow underline" href="mailto:hello@spin-xi.com">
            hello@spin-xi.com
          </a>
        </p>
      </section>
    </Article>
  )
}

export function Terms() {
  return (
    <Article title="Terms of Service">
      <p>
        These terms cover your use of SPIN XI at{' '}
        <span className="text-cream">www.spin-xi.com</span>. Using the game means you accept them.
      </p>

      <section>
        <H>The game</H>
        <p>
          SPIN XI is free to play. You spin for historical cricket squads, draft one player from
          each, build an eleven and simulate a season against the field. There is nothing to buy
          and no subscription.
        </p>
      </section>

      <section>
        <H>Your account</H>
        <p>
          An anonymous account is created for you automatically. You may link a Google account to
          claim your record so it follows you between devices. You are responsible for keeping
          access to that Google account; we cannot restore a record we cannot identify as yours.
        </p>
      </section>

      <section>
        <H>Fair play</H>
        <p>Leaderboards only mean something if the results on them are real. So, plainly:</p>
        <Bullets
          items={[
            <>Do not submit results the game did not produce.</>,
            <>Do not automate play, or hammer the service to make it fall over.</>,
            <>Do not choose a handle that impersonates someone or that you would not say aloud.</>,
          ]}
        />
        <p className="mt-3">
          Every season is stored with the seed and eleven that produced it, and the simulation is
          deterministic — so a submitted result can be recomputed and checked. Results that do not
          reconcile may be removed, and accounts that keep submitting them may be closed.
        </p>
      </section>

      <section>
        <H>The cricket data</H>
        <p>
          Player ratings are derived from ball-by-ball records of matches that were actually
          played, published by{' '}
          <a className="text-willow underline" href="https://cricsheet.org" rel="noreferrer">
            Cricsheet
          </a>{' '}
          and used under its open data licence, with nationality and full names drawn from
          Wikidata. SPIN XI is not affiliated with, endorsed by or connected to Cricsheet, the ICC,
          any national cricket board, any league or any player. Team and competition names are used
          descriptively to identify real historical squads.
        </p>
      </section>

      <section>
        <H>What we owe you</H>
        <p>
          The game is provided as it is. We do not promise it will be available without
          interruption, that results will never be lost, or that it is free of faults. It is a
          cricket game, run by one person, and it should be enjoyed on that basis. To the extent
          the law allows, we are not liable for loss arising from your use of it.
        </p>
      </section>

      <section>
        <H>Changes and ending</H>
        <p>
          Features may change and these terms may change; the date at the top will say when. You
          can stop using the game at any time, and can ask us to delete your account and results.
          We may close an account that breaks the fair play rules above.
        </p>
      </section>

      <section>
        <H>Contact</H>
        <p>
          <a className="text-willow underline" href="mailto:hello@spin-xi.com">
            hello@spin-xi.com
          </a>
        </p>
      </section>
    </Article>
  )
}
