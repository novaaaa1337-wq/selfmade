import React from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useLive } from '../lib/live.jsx';
import { TABS } from '../App.jsx';

export function Nav({ route }) {
  const { online, stats } = useLive();
  const live = online && stats?.trackerConnected;
  return (
    <header className="nav">
      <div className="wrap nav-row">
        <a className="logo" href="#/" aria-label="SELFMADE home">
          <img className="logo-img" src="/logo.webp" alt="" width="34" height="34" />
          <span className="logo-word">{[...'SELFMADE'].map((c, i) => <span key={i}>{c}</span>)}</span>
        </a>
        <nav className="links" aria-label="Main">
          {TABS.filter(([id]) => id !== 'launch').map(([id, label]) => (
            <a key={id} href={`#/${id}`} aria-current={route.page === id ? 'page' : undefined}>{label}</a>
          ))}
        </nav>
        <div className="nav-r">
          <span className="status" data-on={live ? '1' : '0'} title={live ? 'Streaming live data' : 'Not connected to the live feed'}>
            {live ? 'LIVE' : 'OFFLINE'}
          </span>
          <a className="btn solid mag hide-sm" href="#/launch" aria-current={route.page === 'launch' ? 'page' : undefined}>Launch</a>
          <WalletMultiButton />
        </div>
      </div>
      <nav className="tabs-sm" aria-label="Sections">
        {TABS.map(([id, label]) => (
          <a key={id} href={`#/${id}`} aria-current={route.page === id ? 'page' : undefined}>{label}</a>
        ))}
      </nav>
      <div className="progress" aria-hidden="true" />
    </header>
  );
}
