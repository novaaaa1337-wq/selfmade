// Where the SELFMADE server lives. Empty = same address as the site (local dev,
// Render, Docker). Set VITE_API_URL when the site is on Vercel and the server
// runs elsewhere, e.g. https://api.yourdomain.com
export const API = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export const api = (path) => API + path;
