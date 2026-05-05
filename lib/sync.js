// GitHub Contents API sync layer for the inspo board.
// Reads canonical from data/items.json (served by Pages).
// Writes go directly to the repo via PUT /repos/{owner}/{repo}/contents/{path}.
// Token is stored in localStorage; prompted on first write.

export const REPO = 'callie-rounds-media/dominika-inspo';
const FILE = 'data/items.json';
const TOK = 'dominika-inspo-gh-token';

export const getToken = () => localStorage.getItem(TOK) || '';
export const setToken = (t) => localStorage.setItem(TOK, t);
export const clearToken = () => localStorage.removeItem(TOK);

async function getFile() {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}?t=${Date.now()}`, {
    headers: { 'Accept': 'application/vnd.github+json' }
  });
  if (!r.ok) throw new Error('failed to load remote items');
  const meta = await r.json();
  // base64 → string → JSON. Use atob with utf-8 safe decode.
  const b64 = meta.content.replace(/\n/g, '');
  const text = decodeURIComponent(escape(atob(b64)));
  return { sha: meta.sha, data: JSON.parse(text) };
}

function utf8ToB64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

export async function putItems(nextItems, message) {
  const token = getToken();
  if (!token) throw new Error('NO_TOKEN');
  const { sha } = await getFile();
  const body = {
    message: message || 'inspo: update items',
    content: utf8ToB64(JSON.stringify({ items: nextItems }, null, 2) + '\n'),
    sha
  };
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
    method: 'PUT',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const err = await r.text();
    if (r.status === 401 || r.status === 403) { clearToken(); throw new Error('BAD_TOKEN: ' + err.slice(0, 200)); }
    throw new Error('PUT_FAILED ' + r.status + ': ' + err.slice(0, 200));
  }
  return await r.json();
}

export async function pullItems() {
  // direct from repo so it's fresh, not the Pages-cached items.json
  const { data } = await getFile();
  return data.items || [];
}
