import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import App from './App';
import './styles.css';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const root = createRoot(document.getElementById('root')!);

if (!PUBLISHABLE_KEY) {
  root.render(
    <StrictMode>
      <p style={{ fontFamily: 'monospace', padding: 24 }}>
        Clerk isn't configured — copy <code>frontend/.env.example</code> to{' '}
        <code>frontend/.env</code> and set <code>VITE_CLERK_PUBLISHABLE_KEY</code>.
      </p>
    </StrictMode>,
  );
} else {
  root.render(
    <StrictMode>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
        <App />
      </ClerkProvider>
    </StrictMode>,
  );
}
