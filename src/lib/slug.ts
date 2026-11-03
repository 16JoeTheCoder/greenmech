export const SLUG_MAX = 32;
export const RESERVED = ['new', 'manage', 'monitor', 'help', 'signin', 'access', 'api', 'connections'];
const SHAPE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Returns null when valid, otherwise a sentence saying what is wrong and how to fix it. */
export function slugError(s: string, taken: (s: string) => boolean = () => false): string | null {
  if (s.length < 2) return 'Use at least 2 characters.';
  if (s.length > SLUG_MAX) return `Use ${SLUG_MAX} characters or fewer (now ${s.length}).`;
  if (!SHAPE.test(s)) return 'Use lowercase letters, numbers and single hyphens, like intake-ramp.';
  if (RESERVED.includes(s)) return `"${s}" is reserved by the app. Pick another name.`;
  if (taken(s)) return `"${s}" is already used by a module or connection.`;
  return null;
}

/** Suggests a slug from free text: first words, lowercased, hyphenated. Never truncates mid-word silently: caller shows the counter. */
export function suggestSlug(text: string, maxWords = 2): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, maxWords)
    .join('-');
}

export function uniqueSlug(base: string, taken: (s: string) => boolean): string {
  if (!taken(base)) return base;
  for (let i = 2; i < 100; i++) if (!taken(`${base}-${i}`)) return `${base}-${i}`;
  return base;
}
