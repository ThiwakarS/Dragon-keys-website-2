import { useState, useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import { isAdmin } from '../lib/utils.js';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { user } = useUser();
  const location = useLocation();

  const close = () => setOpen(false);

  // Close the mobile menu on any route change (e.g. user navigates via deep link)
  useEffect(() => { setOpen(false); }, [location.pathname]);

  return (
    <nav className="nav">
      <Link to="/" className="nav-logo" onClick={close}>
        <img src="/assets/logo-small.png" alt="DK" className="nav-logo-img" />
      </Link>

      {/* Main link list — slides in/out on mobile */}
      <ul className={`nav-links ${open ? 'open' : ''}`}>
        <li><NavLink to="/" onClick={close} end>Home</NavLink></li>
        <li><a href="/#products" onClick={close}>Products</a></li>
        <li><a href="/#blog" onClick={close}>Blogs</a></li>
        <li><a href="/#about" onClick={close}>About</a></li>
        <SignedIn>
          <li><NavLink to="/my-orders" onClick={close}>My Orders</NavLink></li>
          {isAdmin(user) && (
            <li><NavLink to="/admin" onClick={close}>Admin</NavLink></li>
          )}
        </SignedIn>
      </ul>

      {/* Right-side controls — ALWAYS visible (mobile + desktop) */}
      <div className="nav-right">
        <SignedIn>
          <UserButton afterSignOutUrl="/" />
        </SignedIn>
        <SignedOut>
          <SignInButton mode="modal">
            <button className="nav-cta">Sign In</button>
          </SignInButton>
        </SignedOut>
        <button
          className="nav-hamburger"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
          aria-expanded={open}
        >
          <span></span><span></span><span></span>
        </button>
      </div>

      {/* Backdrop when menu is open on mobile — click to close */}
      {open && <div className="nav-backdrop" onClick={close} aria-hidden="true" />}
    </nav>
  );
}