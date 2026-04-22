import { Routes, Route, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react';
import Navbar from './components/Navbar.jsx';
import Home from './pages/Home.jsx';
import MyOrders from './pages/MyOrders.jsx';
import BookOrder from './pages/BookOrder.jsx';
import Admin from './pages/Admin.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />

        {/* Order a physical product — requires login */}
        <Route
          path="/order/:productId"
          element={
            <>
              <SignedIn>
                <BookOrder />
              </SignedIn>
              <SignedOut>
                <RedirectToSignIn />
              </SignedOut>
            </>
          }
        />

        {/* User's own orders */}
        <Route
          path="/my-orders"
          element={
            <>
              <SignedIn>
                <MyOrders />
              </SignedIn>
              <SignedOut>
                <RedirectToSignIn />
              </SignedOut>
            </>
          }
        />

        {/* Admin panel — extra role check happens inside */}
        <Route
          path="/admin"
          element={
            <>
              <SignedIn>
                <Admin />
              </SignedIn>
              <SignedOut>
                <RedirectToSignIn />
              </SignedOut>
            </>
          }
        />

        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </>
  );
}
