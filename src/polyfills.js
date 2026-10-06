// @solana/web3.js expects Node's Buffer in the browser.
import { Buffer } from 'buffer';
if (!globalThis.Buffer) globalThis.Buffer = Buffer;
