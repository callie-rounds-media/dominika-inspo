// Proxy-based sync layer for the inspo board.
// All writes go through a serverless proxy that holds the github token
// server-side. Callers never see or handle a token. Submissions are
// queued in localStorage if the proxy is unreachable so we never lose
// dominika's inputs.

export const REPO = 'callie-rounds-media/dominika-inspo';
const PROXY = 'https://dominika-inspo-proxy.beccacollins333.workers.dev';
const QUEUE = 'dominika-inspo-pending';

const getQueue = () => {
  try { return JSON.parse(localStorage.getItem(QUEUE) || '[]'); } catch { return []; }
};
const setQueue = (q) => localStorage.setItem(QUEUE, JSON.stringify(q));

export async function addItem(item) {
  // Optimistic save: always queue locally, then try the proxy.
  // If proxy fails, the queue keeps the submission until the next flush.
  const q = getQueue();
  q.push(item);
  setQueue(q);

  try {
    const r = await fetch(`${PROXY}/add`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ item })
    });
    if (!r.ok) throw new Error(`proxy ${r.status}`);
    // success → drop from queue
    setQueue(getQueue().filter(x => x.id !== item.id));
    return { synced: true };
  } catch {
    return { synced: false };
  }
}

export async function flushQueue() {
  const q = getQueue();
  if (!q.length) return;
  for (const item of q.slice()) {
    try {
      const r = await fetch(`${PROXY}/add`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ item })
      });
      if (r.ok) setQueue(getQueue().filter(x => x.id !== item.id));
    } catch { /* keep in queue */ }
  }
}

export function pendingCount() {
  return getQueue().length;
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
