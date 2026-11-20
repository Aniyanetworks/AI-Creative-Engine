import { useEffect, useState } from 'react';
import { api } from './api.js';

// The AI models the server allows (see app/server/models.js), loaded once and shared by every picker.
let cache = null;
export function useModels() {
  const [m, setM] = useState(cache);
  useEffect(() => {
    if (cache) return undefined;
    let stop = false;
    api.getModels().then((r) => { cache = r; if (!stop) setM(r); }).catch(() => {});
    return () => { stop = true; };
  }, []);
  return m;
}

export const modelLabel = (list, id) => ((list || []).find((x) => x.id === id) || {}).label || id || '';
// Short form for buttons: "Claude Sonnet 5.5 (balanced)" -> "Claude Sonnet 5.5"
export const shortLabel = (list, id) => modelLabel(list, id).replace(/\s*\(.*\)\s*$/, '');

// Remembered choices (per browser): '' means "use the server default".
export const loadChoice = (key) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };
export const saveChoice = (key, v) => { try { if (v) localStorage.setItem(key, v); else localStorage.removeItem(key); } catch { /* private mode */ } };
