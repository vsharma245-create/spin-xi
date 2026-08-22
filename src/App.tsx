import { Route, Routes, useLocation } from 'react-router-dom'
import { ArchiveGate } from './components/ArchiveGate'
import { TabBar, TopBar } from './components/Nav'
import Daily from './screens/Daily'
import Home from './screens/Home'
import NotFound from './screens/NotFound'
import Leaderboard from './screens/Leaderboard'
import { Privacy, Terms } from './screens/Legal'
import Play from './screens/Play'
import Profile from './screens/Profile'
import Multiplayer from './screens/Multiplayer'
import LeaguePage from './screens/LeaguePage'
import LiveDraft from './screens/LiveDraft'

const PLAYABLE = new Set(['/', '/play', '/daily', '/leaderboard', '/profile', '/multiplayer'])

export default function App() {
  const location = useLocation()
  /*
   * Only the game itself needs the squad archive. A policy page, or a wrong
   * address, made the reader wait on a multi-megabyte download before showing
   * them a paragraph of text — and a mistyped link spent that download to say
   * the link was mistyped.
   */
  const path = location.pathname.replace(/\/+$/, '') || '/'
  // A league page is the game too: it shows squads, formats and seasons.
  const needsArchive = PLAYABLE.has(path) || path.startsWith('/l/') || path.startsWith('/d/')

  return (
    <div className="min-h-dvh bg-ink">
      {/* A very faint pitch-green glow anchors the top of every screen. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[380px]"
        style={{
          background:
            'radial-gradient(90% 100% at 50% 0%, rgba(227,165,75,0.06) 0%, transparent 68%)',
        }}
      />
      <div className="relative">
        {!needsArchive ? (
          <Routes location={location} key={location.pathname}>
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        ) : (
          <ArchiveGate>
            <TopBar />
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<Home />} />
              <Route path="/play" element={<Play />} />
              <Route path="/daily" element={<Daily />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/multiplayer" element={<Multiplayer />} />
              <Route path="/l/:code" element={<LeaguePage />} />
              <Route path="/d/:code" element={<LiveDraft />} />
            </Routes>
            {/* The draft owns the bottom edge with its team-sheet rail. */}
            {location.pathname !== '/play' && <TabBar />}
          </ArchiveGate>
        )}
      </div>
    </div>
  )
}
