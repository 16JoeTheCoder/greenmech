// Safe markdown subset -> plain AST. No HTML pass-through: every string is rendered as text by Preact.
export type Inline = { t: 'text'; v: string } | { t: 'b'; c: Inline[] } | { t: 'i'; c: Inline[] } | { t: 'a'; href: string; c: Inline[] };
export type Block = { t: 'p'; c: Inline[] } | { t: 'h'; level: 2 | 3 | 4; c: Inline[] } | { t: 'ul' | 'ol'; items: Inline[][] };

export function safeHref(u: string): string | null {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const flush = () => {
    if (buf) {
      out.push({ t: 'text', v: buf });
      buf = '';
    }
  };
  let i = 0;
  while (i < s.length) {
    if (s.startsWith('**', i)) {
      const end = s.indexOf('**', i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: 'b', c: parseInline(s.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (s[i] === '*' || s[i] === '_') {
      const end = s.indexOf(s[i], i + 1);
      if (end > i + 1) {
        flush();
        out.push({ t: 'i', c: parseInline(s.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (s[i] === '[') {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(s.slice(i));
      if (m) {
        const href = safeHref(m[2]);
        flush();
        if (href) out.push({ t: 'a', href, c: parseInline(m[1]) });
        else out.push({ t: 'text', v: m[1] }); // unsafe link: keep the words, drop the link
        i += m[0].length;
        continue;
      }
    }
    buf += s[i++];
  }
  flush();
  return out;
}

export function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  let para: string[] = [];
  let list: { t: 'ul' | 'ol'; items: Inline[][] } | null = null;
  const endPara = () => {
    if (para.length) {
      blocks.push({ t: 'p', c: parseInline(para.join(' ')) });
      para = [];
    }
  };
  const endList = () => {
    if (list) {
      blocks.push(list);
      list = null;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) {
      endPara();
      endList();
      continue;
    }
    if (h) {
      endPara();
      endList();
      blocks.push({ t: 'h', level: (h[1].length + 1) as 2 | 3 | 4, c: parseInline(h[2]) });
      continue;
    }
    if (ul || ol) {
      endPara();
      const kind = ul ? 'ul' : 'ol';
      if (!list || list.t !== kind) {
        endList();
        list = { t: kind, items: [] };
      }
      list.items.push(parseInline((ul ?? ol)![1]));
      continue;
    }
    endList();
    para.push(line.trim());
  }
  endPara();
  endList();
  return blocks;
}
