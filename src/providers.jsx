import React, { useMemo } from 'react';
import { clusterApiUrl } from '@solana/web3.js';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';

// Phantom and Solflare adapters are listed explicitly so they show up even when
// not installed (with an install link). Any other Wallet Standard wallet
// (Backpack, Glow, OKX, Coinbase, etc.) is detected automatically.
export function Providers({ children }) {
  const endpoint = import.meta.env.VITE_RPC_URL || clusterApiUrl('mainnet-beta');
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
