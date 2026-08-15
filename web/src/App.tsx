import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { useAuth } from './store';
import { Spinner } from './components/ui';
import { IconBook, IconFlag, IconHome, IconPlus, IconUser } from './components/icons';

import Welcome from './pages/Welcome';
import Home from './pages/Home';
import NewGame from './pages/NewGame';
import GameScreen from './pages/Game';
import Rounds from './pages/Rounds';
import Book from './pages/Book';
import Profile from './pages/Profile';
import TeeTimes, { ClubTeeTimes } from './pages/TeeTimes';
import BookingsPage from './pages/Bookings';
import ClubConsole from './pages/Club';

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

function TabBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const hidden = ['/welcome', '/new'].includes(pathname)
    || pathname.startsWith('/game/')
    || pathname.startsWith('/club');
  if (hidden) return null;

  const tab = (to: string, label: string, icon: ReactNode) => (
    <NavLink to={to} className={({ isActive }) => (isActive ? 'active' : '')} end>
      <span className="ic">{icon}</span>
      {label}
    </NavLink>
  );

  return (
    <nav className="tabbar">
      {tab('/', 'Play', <IconHome />)}
      {tab('/rounds', 'Rounds', <IconFlag />)}
      {/* Booking is the primary action: it holds the slot and sets the round up. */}
      <button className="fab" onClick={() => navigate('/tee-times')} aria-label="Book a tee time">
        <IconPlus />
      </button>
      {tab('/book', 'Book', <IconBook />)}
      {tab('/profile', 'You', <IconUser />)}
    </nav>
  );
}

export default function App() {
  return (
    // The aura sits outside .app on purpose: as a fixed child of a container
    // with overflow-x hidden it risks being clipped to the app column, which
    // paints the background as a box and leaves the rest of the screen bare.
    <>
      <div className="aura" />
      <div className="app">
        <Routes>
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/" element={<Protected><Home /></Protected>} />
          <Route path="/new" element={<Protected><NewGame /></Protected>} />
          <Route path="/game/:id" element={<Protected><GameScreen /></Protected>} />
          <Route path="/rounds" element={<Protected><Rounds /></Protected>} />
          <Route path="/tee-times" element={<Protected><TeeTimes /></Protected>} />
          <Route path="/tee-times/:slug" element={<Protected><ClubTeeTimes /></Protected>} />
          <Route path="/bookings" element={<Protected><BookingsPage /></Protected>} />
          <Route path="/club" element={<Protected><ClubConsole /></Protected>} />
          <Route path="/book" element={<Protected><Book /></Protected>} />
          <Route path="/profile" element={<Protected><Profile /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <TabBar />
      </div>
    </>
  );
}
