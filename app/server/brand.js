// Brand colours for a run: the ones detected on the website, unless the person chose their own (result.brand_colors_override).
// The override is used for concept previews, new images (as a palette hint) and the next video renders; reset removes it.
const HEX = /^#[0-9a-f]{6}$/i;
export const validColors = (list) => [...new Set((Array.isArray(list) ? list : []).map((c) => String(c || '').trim().toLowerCase()).filter((c) => HEX.test(c)))].slice(0, 4);
export const effectiveColors = (result) => {
  const o = validColors(result && result.brand_colors_override);
  return o.length ? o : validColors(result && result.brief && result.brief.brand_colors);
};
