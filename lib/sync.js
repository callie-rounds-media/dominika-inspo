// Proxy-based sync layer for the inspo board.
// All writes go through a serverless proxy that holds the github token
// server-side. Callers never see or handle a token. Submissions are
// queued in localStorage if the proxy is unreachable so we never lose
// dominika's inputs — and the queue is now SURFACED in the UI so a stuck
// submission can never silently look like a success.

export const REPO = 'callie-rounds-media/dominika-inspo';
const PROXY = 'https://dominika-inspo-proxy.beccacollins333.workers.dev';
const QUEUE = 'dominika-inspo-pending';

const getQueue = () => {
  try { return JSON.parse(localStorage.getItem(QUEUE) || '[]'); } catch { return []; }
};
const setQueue = (q) => localStorage.setItem(QUEUE, JSON.stringify(q));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// One POST attempt to the proxy, with a hard timeout so a hanging network
// can never leave the UI stuck on "saving…". Resolves true on a committed
// write (the worker only returns ok after the GitHub commit succeeds).
async function postItem(item, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${PROXY}/add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ item }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`proxy ${r.status}`);
    return true;
  } finally {
    clearTimeout(t);
  }
}

export async function addItem(item) {
  // Optimistic save: always queue locally first, then try the proxy a few
  // times with backoff. If every attempt fails the item STAYS queued and is
  // recoverable (auto-flush on focus/interval, manual "sync now", or the
  // copy-my-pins escape hatch).
  const q = getQueue();
  if (!q.some(x => x.id === item.id)) { q.push(item); setQueue(q); }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await postItem(item);
      setQueue(getQueue().filter(x => x.id !== item.id));
      return { synced: true };
    } catch {
      if (attempt < 2) await sleep(600 * (attempt + 1));
    }
  }
  return { synced: false };
}

// Push every queued item through the proxy. Returns a summary so the UI can
// show real progress instead of guessing.
export async function flushQueue() {
  const q = getQueue();
  if (!q.length) return { synced: 0, remaining: 0 };
  let synced = 0;
  for (const item of q.slice()) {
    try {
      await postItem(item);
      setQueue(getQueue().filter(x => x.id !== item.id));
      synced++;
    } catch { /* keep in queue */ }
  }
  return { synced, remaining: getQueue().length };
}

export function pendingCount() {
  return getQueue().length;
}

// The escape hatch: the exact items parked on THIS device. If the proxy is
// blocked on her network/browser, this is what gets handed to us to write in
// server-side (which is never blocked).
export function pendingItems() {
  return getQueue();
}

// Human-readable dump of the queue for the "copy my pins" button.
export function pendingAsText() {
  const q = getQueue();
  if (!q.length) return '';
  return q.map(i => `${i.category}\t${i.url}${i.note ? `\t— ${i.note}` : ''}`).join('\n');
}

export async function moveItem(id, category) {
  const r = await fetch(`${PROXY}/move`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, category })
  });
  if (!r.ok) throw new Error(`move failed (${r.status})`);
  return r.json();
}

export async function removeItem(id) {
  const r = await fetch(`${PROXY}/remove`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id })
  });
  if (!r.ok) throw new Error(`remove failed (${r.status})`);
  return r.json();
}

// Always-fresh fetch: skip the GH Pages CDN entirely and read items
// directly from the worker (which hits the GitHub API with auth, no cache).
// Used after a same-tab mutation to guarantee the next render is live.
export async function fetchItemsFresh() {
  const r = await fetch(`${PROXY}/items?t=${Date.now()}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`fresh fetch failed (${r.status})`);
  const data = await r.json();
  if (!data.ok) throw new Error('worker returned ok=false');
  return data.items || [];
}
