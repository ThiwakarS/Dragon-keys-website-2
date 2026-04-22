import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App.jsx';
import { ToastProvider } from './lib/toast.jsx';
import './styles.css';

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!CLERK_KEY) {
  throw new Error(
    'Missing VITE_CLERK_PUBLISHABLE_KEY — check your .env.local file.'
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/">
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    </ClerkProvider>
  </React.StrictMode>
);
