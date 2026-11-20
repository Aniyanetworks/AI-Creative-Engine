import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { HINTS } from '../hints.js';

const KEY = 'ace-hints';
const read = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } };

// Whether hints are shown (remembered per browser; switched in the Guide).
const HintsContext = createContext({ enabled: true, setEnabled: () => {} });
export function HintsProvider({ children }) {
  const [enabled, set] = useState(read);
  const setEnabled = useCallback((v) => { set(v); try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch { /* private mode */ } }, []);
  return <HintsContext.Provider value={{ enabled, setEnabled }}>{children}</HintsContext.Provider>;
}
export const useHints = () => useContext(HintsContext);

// A small "?" button that opens a short explanation. The panel is fixed-positioned so cards that clip their overflow cannot hide it.
export default function Hint({ id, text, title, style }) {
  const { enabled } = useHints();
  const h = HINTS[id] || {};
  const body = text || h.text;
  const head = title || h.title;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const btn = useRef(null);
  const panel = useRef(null);
  const timer = useRef(null);
  const keep = () => clearTimeout(timer.current);
  const later = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 160); };

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = Math.min(300, window.innerWidth - 24);
    const left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2));
    const below = r.bottom + 8;
    const h2 = panel.current ? panel.current.offsetHeight : 120;
    const top = below + h2 > window.innerHeight - 8 ? Math.max(8, r.top - 8 - h2) : below;
    setPos({ left, top, width: w });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!panel.current?.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    window.addEventListener('scroll', close, true); window.addEventListener('resize', close);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [open]);

  if (!enabled || !body) return null;
  return (
    <>
      <button ref={btn} type="button" className="hintbtn" style={style} aria-label={'Help: ' + (head || 'hint')} aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }} onMouseEnter={() => { keep(); setOpen(true); }} onMouseLeave={later}>
        <HelpCircle size={14} aria-hidden />
      </button>
      {open && (
        <div ref={panel} className="hintpanel" role="tooltip" style={{ left: pos.left, top: pos.top, width: pos.width }} onMouseEnter={keep} onMouseLeave={later}>
          {head && <b>{head}</b>}
          <span>{body}</span>
        </div>
      )}
    </>
  );
}
