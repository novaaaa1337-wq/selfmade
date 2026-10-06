import './polyfills.js';
import React from 'react';
import { createRoot } from 'react-dom/client';
import '@solana/wallet-adapter-react-ui/styles.css';
import './styles.css';
import { Providers } from './providers.jsx';
import { LiveProvider } from './lib/live.jsx';
import { App } from './App.jsx';
import { initMotion } from './lib/motion.js';

createRoot(document.getElementById('root')).render(
  <Providers>
    <LiveProvider>
      <App />
    </LiveProvider>
  </Providers>,
);

initMotion();
