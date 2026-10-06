import crypto from 'node:crypto';
import { cfg } from './config.js';

const key = () => {
  if (!cfg.secret) throw new Error('TREASURY_SECRET is not set');
  return crypto.createHash('sha256').update(cfg.secret).digest();
};

// AES-256-GCM. Output: iv.tag.ciphertext, all base64.
export function encrypt(bytes) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(Buffer.from(bytes)), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decrypt(str) {
  const [iv, tag, data] = str.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return new Uint8Array(Buffer.concat([d.update(data), d.final()]));
}
