import React, { useEffect, useState } from 'react';
import { Nav } from './components/Nav.jsx';
import { HomePage, CoinsPage, HowPage, TreasuryPage, FaqPage } from './components/Home.jsx';
import { LaunchPage } from './components/Launch.jsx';
import { CoinPage } from './components/CoinPage.jsx';
import { Footer } from './components/Footer.jsx';
import { scrollTop } from './lib/motion.js';

// Every tab is its own page: #/  #/coins  #/how  #/treasury  #/launch  #/faq
// and each coin has its own site at #/c/<mint>.
export const TABS = [
  ['coins', 'Coins'],
  ['how', 'How it works'],
  ['treasury', 'Treasury'],
  ['launch', 'Launch'],
  ['faq', 'FAQ'],
];
const PAGES = { home: HomePage, coins: CoinsPage, how: HowPage, treasury: TreasuryPage, launch: LaunchPage, faq: FaqPage };
const TITLES = { home: 'coins that fund themselves', coins: 'Coins', how: 'How it works', treasury: 'Treasury', launch: 'Launch', faq: 'FAQ' };

function parse() {
  const h = location.hash.replace(/^#\/?/, '');
  const coin = h.match(/^c\/([1-9A-HJ-NP-Za-km-z]{32,44})/);
  if (coin) return { page: 'coin', mint: coin[1] };
  const page = h.split(/[/?]/)[0];
  return { page: PAGES[page] ? page : 'home' };
}

function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => { setRoute(parse()); scrollTop(); };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    if (route.page !== 'coin') document.title = `SELFMADE · ${TITLES[route.page]}`;
  }, [route]);
  return route;
}

export function App() {
  const route = useRoute();
  const Page = PAGES[route.page];
  const key = route.page === 'coin' ? `c-${route.mint}` : route.page;
  return (
    <div className="page">
      <Nav route={route} />
      <main id="top" className="route" key={key}>
        {route.page === 'coin' ? <CoinPage mint={route.mint} /> : <Page />}
      </main>
      <Footer />
    </div>
  );
}
