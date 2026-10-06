import { VersionedTransaction } from '@solana/web3.js';
import { cfg } from './config.js';

// Uploads image + metadata to IPFS and returns { metadataUri, image }.
export async function uploadMetadata({ name, symbol, description, twitter, telegram, website, file }) {
  if (cfg.pinataJwt) return uploadViaPinata({ name, symbol, description, twitter, telegram, website, file });

  const form = new FormData();
  form.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname || 'image');
  form.append('name', name);
  form.append('symbol', symbol);
  form.append('description', description || '');
  form.append('twitter', twitter || '');
  form.append('telegram', telegram || '');
  form.append('website', website || '');
  form.append('showName', 'true');
  const res = await fetch('https://pump.fun/api/ipfs', { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Metadata upload failed (${res.status}). Set PINATA_JWT to upload through Pinata instead.`);
  const json = await res.json();
  return { metadataUri: json.metadataUri, image: json.metadata?.image || null };
}

async function uploadViaPinata({ name, symbol, description, twitter, telegram, website, file }) {
  const auth = { Authorization: `Bearer ${cfg.pinataJwt}` };
  const form = new FormData();
  form.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname || 'image');
  const img = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', { method: 'POST', headers: auth, body: form });
  if (!img.ok) throw new Error(`Pinata image upload failed (${img.status})`);
  const image = `https://ipfs.io/ipfs/${(await img.json()).IpfsHash}`;
  const meta = { name, symbol, description, image, showName: true, twitter, telegram, website };
  const js = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ pinataContent: meta }),
  });
  if (!js.ok) throw new Error(`Pinata metadata upload failed (${js.status})`);
  return { metadataUri: `https://ipfs.io/ipfs/${(await js.json()).IpfsHash}`, image };
}

// PumpPortal Local Transaction API: returns an unsigned transaction we sign ourselves.
// Docs: https://pumpportal.fun/local-trading-api/trading-api
export async function tradeLocal(body) {
  const res = await fetch('https://pumpportal.fun/api/trade-local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status !== 200) throw new Error(`PumpPortal ${body.action} failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return VersionedTransaction.deserialize(new Uint8Array(await res.arrayBuffer()));
}
