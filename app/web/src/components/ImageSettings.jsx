import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { shortLabel } from '../models.js';

export const QUALITIES = [
  { id: 'low', name: 'Draft', cost: 0.01, hint: 'Quick look, rough detail' },
  { id: 'medium', name: 'Standard', cost: 0.04, hint: 'Good for most ads' },
  { id: 'high', name: 'High', cost: 0.17, hint: 'Sharpest text and detail' },
];

// One button that summarises the image settings ("High · GPT Image 2") and opens a small panel to change them.
export default function ImageSettings({ quality, onQuality, model, onModel, models }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const q = QUALITIES.find((x) => x.id === quality) || QUALITIES[1];
  const list = (models && models.image) || [];
  const current = model || (models && models.defaults.image) || '';
  return (
    <div className="popwrap" ref={box}>
      <button type="button" className="ghost" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog">
        <SlidersHorizontal size={13} /> {q.name}{current ? ' · ' + shortLabel(list, current) : ''} <ChevronDown size={13} />
      </button>
      {open && (
        <div className="pop" role="dialog" aria-label="Image settings">
          <b className="small">Image quality</b>
          <div className="qcards" role="radiogroup" aria-label="Image quality">
            {QUALITIES.map((x) => (
              <button key={x.id} type="button" role="radio" aria-checked={quality === x.id} className={'qcard' + (quality === x.id ? ' on' : '')} onClick={() => onQuality(x.id)}>
                <b>{x.name}</b><span>about {x.cost < 0.1 ? Math.round(x.cost * 100) + '¢' : '$' + x.cost.toFixed(2)} each</span><small>{x.hint}</small>
              </button>
            ))}
          </div>
          {list.length > 0 && (
            <>
              <label className="small" htmlFor="imgmodel" style={{ fontWeight: 650, display: 'block', marginTop: 12 }}>Image model</label>
              <select id="imgmodel" value={current} onChange={(e) => onModel(e.target.value)} style={{ width: '100%', marginTop: 4 }}>
                {list.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </>
          )}
          <p className="note" style={{ margin: '10px 0 0' }}>Used by Generate image, Make again and Generate missing images. Estimates, not a bill.</p>
        </div>
      )}
    </div>
  );
}
