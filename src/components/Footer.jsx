import React from 'react';

export function Footer() {
  return (
    <footer className="footer">
      <div className="outro" aria-hidden="true">
        {[...'SELFMADE'].map((c, i) => <span key={i} style={{ '--i': i }}>{c}</span>)}
      </div>
      <div className="wrap foot-row">
        <span className="logo"><img className="logo-img" src="/logo.webp" alt="" width="34" height="34" /><span className="logo-word">SELFMADE</span></span>
        <p>
          Coins launch on pump.fun through PumpPortal. Market data streams from PumpPortal; balances are read from Solana.
          Memecoins are extremely risky and most go to zero. Nothing here is financial advice.
        </p>
      </div>
    </footer>
  );
}
