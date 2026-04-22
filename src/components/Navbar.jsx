import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from '@clerk/clerk-react';
import { isAdmin } from '../lib/utils.js';

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { user } = useUser();
  const navigate = useNavigate();

  const close = () => setOpen(false);

  return (
    <nav className="nav">
      <Link to="/" className="nav-logo" onClick={close}>
        <img src="/assets/logo-small.png" alt="DK" className="nav-logo-img" />
      </Link>

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
          <li className="nav-user">
            <UserButton afterSignOutUrl="/" />
          </li>
        </SignedIn>

        <SignedOut>
          <li>
            <SignInButton mode="modal">
              <button className="nav-cta">Sign In</button>
            </SignInButton>
          </li>
        </SignedOut>
      </ul>

      <button
        className="nav-hamburger"
        onClick={() => setOpen(!open)}
        aria-label="Menu"
      >
        <span></span><span></span><span></span>
      </button>
    </nav>
  );
}
