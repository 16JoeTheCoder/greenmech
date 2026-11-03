// Safe-SVG allowlist validation (generic) and GMM v1 structure checks. Never fixes a file: rejects with a reason.
export const ALLOWED_EL = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'defs',
  'title',
  'desc',
  'metadata',
]);
const ALLOWED_ATTR = new Set([
  'id',
  'class',
  'viewBox',
  'width',
  'height',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'd',
  'points',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-opacity',
  'fill-opacity',
  'opacity',
  'transform',
  'font-size',
  'font-family',
  'font-weight',
  'text-anchor',
  'dominant-baseline',
  'xmlns',
  'version',
  'data-kind',
  'data-carries',
  'preserveAspectRatio',
  'vector-effect',
  'fill-rule',
  'clip-rule',
  'dx',
  'dy',
  'style',
]);
export type Result = { ok: true; doc: Document } | { ok: false; error: string };

export function validateSafeSvg(text: string, maxChars = 250000): Result {
  if (text.length > maxChars) return { ok: false, error: `The file is ${Math.ceil(text.length / 1000)} KB. The limit is ${maxChars / 1000} KB.` };
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) return { ok: false, error: 'The file declares a DOCTYPE or entity. Export a plain SVG without them.' };
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.getElementsByTagName('parsererror').length) return { ok: false, error: 'This is not valid SVG. Check the file opens in a browser.' };
  const root = doc.documentElement;
  if (root.localName !== 'svg') return { ok: false, error: 'The root element must be <svg>.' };
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    const name = el.localName;
    if (!ALLOWED_EL.has(name)) return { ok: false, error: `<${name}> is not allowed. Remove it and upload again.` };
    for (const a of Array.from(el.attributes)) {
      const an = a.name;
      if (/^on/i.test(an)) return { ok: false, error: `Event attribute ${an} on <${name}> is not allowed.` };
      if (an === 'href' || an.endsWith(':href')) return { ok: false, error: `Links (${an}) on <${name}> are not allowed.` };
      if (an.startsWith('xmlns')) continue;
      if (!ALLOWED_ATTR.has(an)) return { ok: false, error: `Attribute ${an} on <${name}> is not allowed.` };
      if (/url\s*\(|javascript:|expression\s*\(/i.test(a.value)) return { ok: false, error: `${an} on <${name}> references an external resource.` };
    }
  }
  return { ok: true, doc };
}

export function validateGmm(text: string): Result {
  if (text.length > 40000) return { ok: false, error: `GMM v1 models must be under 40 KB. This file is ${Math.ceil(text.length / 1000)} KB.` };
  const r = validateSafeSvg(text, 40000);
  if (!r.ok) return r;
  const root = r.doc.documentElement;
  if (root.getAttribute('viewBox')?.trim().replace(/\s+/g, ' ') !== '0 0 400 300')
    return { ok: false, error: 'GMM v1 needs viewBox="0 0 400 300" on the root <svg>.' };
  const byId = (id: string) => Array.from(r.doc.getElementsByTagName('*')).find((e) => e.getAttribute('id') === id);
  for (const id of ['envelope', 'parts', 'ports', 'labels']) {
    const g = byId(id);
    if (!g || g.localName !== 'g') return { ok: false, error: `GMM v1 needs a <g id="${id}"> group.` };
  }
  const ports = byId('ports')!;
  for (const c of Array.from(ports.getElementsByTagName('circle'))) {
    if (!/^(in|out)-\d+$/.test(c.getAttribute('id') ?? '')) return { ok: false, error: 'Each port circle needs an id like in-1 or out-1.' };
    if (!['in', 'out'].includes(c.getAttribute('data-kind') ?? '')) return { ok: false, error: `Port ${c.getAttribute('id')} needs data-kind="in" or "out".` };
  }
  const meta = byId('gmm');
  if (!meta || meta.localName !== 'metadata') return { ok: false, error: 'GMM v1 needs <metadata id="gmm"> with the JSON block.' };
  try {
    const j = JSON.parse(meta.textContent ?? '');
    if (j.standard !== 'GMM v1') return { ok: false, error: 'The metadata "standard" must be "GMM v1".' };
  } catch {
    return { ok: false, error: 'The <metadata id="gmm"> content is not valid JSON.' };
  }
  return r;
}
