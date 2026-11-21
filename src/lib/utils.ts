export type ClassValue = string | false | null | undefined | 0;

/** Tiny classnames helper (no dependency needed). */
export const cn = (...classes: ClassValue[]) => classes.filter(Boolean).join(' ');

export const uid = (prefix = '') =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

/** 2450 → "2.5k", 800 → "800" */
export const formatGold = (gold: number) => {
  const abs = Math.abs(gold);
  if (abs >= 1000) return `${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return String(abs);
};

export const kdaRatio = (k: number, d: number, a: number) => (k + a) / Math.max(1, d);

export const formatKda = (k: number, d: number, a: number) => kdaRatio(k, d, a).toFixed(2);

export const formatDuration = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const formatDateTime = (ms: number | null | undefined) => {
  if (!ms) return 'TBA';
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export const timeAgo = (ms: number) => {
  const diff = Math.round((Date.now() - ms) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

export const pickRandom = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export const shuffle = <T,>(arr: readonly T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isPlainObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Read a saved value. Objects are merged over the defaults (new settings keep
 * their default); arrays, numbers, strings and booleans come back as saved —
 * a value of the wrong shape falls back to the default.
 */
export const safeLocalGet = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (isPlainObject(fallback)) return (isPlainObject(parsed) ? { ...fallback, ...parsed } : fallback) as T;
    if (Array.isArray(fallback)) return (Array.isArray(parsed) ? parsed : fallback) as T;
    if (fallback === null || fallback === undefined) return parsed as T;
    return (typeof parsed === typeof fallback ? parsed : fallback) as T;
  } catch {
    return fallback;
  }
};

export const safeLocalSet = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — ignore */
  }
};

export const SIDE_LABEL = { blue: 'Blue', red: 'Red' } as const;

/** JSON with sorted object keys — for comparing data that Firestore may return with keys in a different order. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]])) : v,
  );
}

/** Fast pure-JS MD5 hash for MediaWiki/Liquipedia/Wikimedia image path resolution. */
export function md5(str: string): string {
  function safeAdd(x: number, y: number) {
    const lsw = (x & 0xffff) + (y & 0xffff);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xffff);
  }
  function bitRol(num: number, cnt: number) {
    return (num << cnt) | (num >>> (32 - cnt));
  }
  function md5cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    return safeAdd(bitRol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }
  function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return md5cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  function binlMD5(x: number[], len: number) {
    x[len >> 5] |= 0x80 << len % 32;
    x[(((len + 64) >>> 9) << 4) + 14] = len;

    let a = 1732584193;
    let b = -271733879;
    let c = -1732584194;
    let d = 271733878;

    for (let i = 0; i < x.length; i += 16) {
      const olda = a;
      const oldb = b;
      const oldc = c;
      const oldd = d;

      a = md5ff(a, b, c, d, x[i], 7, -680876936);
      d = md5ff(d, a, b, c, x[i + 1], 12, -389564586);
      c = md5ff(c, d, a, b, x[i + 2], 17, 606105819);
      b = md5ff(b, c, d, a, x[i + 3], 22, -1044525330);
      a = md5ff(a, b, c, d, x[i + 4], 7, -176418897);
      d = md5ff(d, a, b, c, x[i + 5], 12, 1200080426);
      c = md5ff(c, d, a, b, x[i + 6], 17, -1473231341);
      b = md5ff(b, c, d, a, x[i + 7], 22, -45705983);
      a = md5ff(a, b, c, d, x[i + 8], 7, 1770035416);
      d = md5ff(d, a, b, c, x[i + 9], 12, -1958414417);
      c = md5ff(c, d, a, b, x[i + 10], 17, -42063);
      b = md5ff(b, c, d, a, x[i + 11], 22, -1990404162);
      a = md5ff(a, b, c, d, x[i + 12], 7, 1804603682);
      d = md5ff(d, a, b, c, x[i + 13], 12, -40341101);
      c = md5ff(c, d, a, b, x[i + 14], 17, -1502002290);
      b = md5ff(b, c, d, a, x[i + 15], 22, 1236535329);

      a = md5gg(a, b, c, d, x[i + 1], 5, -165796510);
      d = md5gg(d, a, b, c, x[i + 6], 9, -1069501632);
      c = md5gg(c, d, a, b, x[i + 11], 14, 643717713);
      b = md5gg(b, c, d, a, x[i], 20, -373897302);
      a = md5gg(a, b, c, d, x[i + 5], 5, -701558691);
      d = md5gg(d, a, b, c, x[i + 10], 9, 38016083);
      c = md5gg(c, d, a, b, x[i + 15], 14, -660478335);
      b = md5gg(b, c, d, a, x[i + 4], 20, -405537848);
      a = md5gg(a, b, c, d, x[i + 9], 5, 568446438);
      d = md5gg(d, a, b, c, x[i + 14], 9, -1019803690);
      c = md5gg(c, d, a, b, x[i + 3], 14, -187363961);
      b = md5gg(b, c, d, a, x[i + 8], 20, 1163531501);
      a = md5gg(a, b, c, d, x[i + 13], 5, -1444681467);
      d = md5gg(d, a, b, c, x[i + 2], 9, -51403784);
      c = md5gg(c, d, a, b, x[i + 7], 14, 1735328473);
      b = md5gg(b, c, d, a, x[i + 12], 20, -1926607734);

      a = md5hh(a, b, c, d, x[i + 5], 4, -378558);
      d = md5hh(d, a, b, c, x[i + 8], 11, -2022574463);
      c = md5hh(c, d, a, b, x[i + 11], 16, 1839030562);
      b = md5hh(b, c, d, a, x[i + 14], 23, -35309556);
      a = md5hh(a, b, c, d, x[i + 1], 4, -1530992060);
      d = md5hh(d, a, b, c, x[i + 4], 11, 1272893353);
      c = md5hh(c, d, a, b, x[i + 7], 16, -155497632);
      b = md5hh(b, c, d, a, x[i + 10], 23, -1094730640);
      a = md5hh(a, b, c, d, x[i + 13], 4, 681279174);
      d = md5hh(d, a, b, c, x[i], 11, -358537222);
      c = md5hh(c, d, a, b, x[i + 3], 16, -722521979);
      b = md5hh(b, c, d, a, x[i + 6], 23, 76029189);
      a = md5hh(a, b, c, d, x[i + 9], 4, -640364487);
      d = md5hh(d, a, b, c, x[i + 12], 11, -421815835);
      c = md5hh(c, d, a, b, x[i + 15], 16, 530742520);
      b = md5hh(b, c, d, a, x[i + 2], 23, -995338651);

      a = md5ii(a, b, c, d, x[i], 6, -198630844);
      d = md5ii(d, a, b, c, x[i + 7], 10, 1126891415);
      c = md5ii(c, d, a, b, x[i + 14], 15, -1416354905);
      b = md5ii(b, c, d, a, x[i + 5], 21, -57434055);
      a = md5ii(a, b, c, d, x[i + 12], 6, 1700485571);
      d = md5ii(d, a, b, c, x[i + 3], 10, -1894986606);
      c = md5ii(c, d, a, b, x[i + 10], 15, -1051523);
      b = md5ii(b, c, d, a, x[i + 1], 21, -2054922799);
      a = md5ii(a, b, c, d, x[i + 8], 6, 1873313359);
      d = md5ii(d, a, b, c, x[i + 15], 10, -30611744);
      c = md5ii(c, d, a, b, x[i + 6], 15, -1560198380);
      b = md5ii(b, c, d, a, x[i + 13], 21, 1309151649);
      a = md5ii(a, b, c, d, x[i + 4], 6, -145523070);
      d = md5ii(d, a, b, c, x[i + 11], 10, -1120210379);
      c = md5ii(c, d, a, b, x[i + 2], 15, 718787259);
      b = md5ii(b, c, d, a, x[i + 9], 21, -343485551);

      a = safeAdd(a, olda);
      b = safeAdd(b, oldb);
      c = safeAdd(c, oldc);
      d = safeAdd(d, oldd);
    }
    return [a, b, c, d];
  }

  function rstr2binl(input: string) {
    const output: number[] = Array(input.length >> 2).fill(0);
    for (let i = 0; i < input.length * 8; i += 8) {
      output[i >> 5] |= (input.charCodeAt(i / 8) & 0xff) << i % 32;
    }
    return output;
  }

  function binl2hex(numarray: number[]) {
    const hexTab = '0123456789abcdef';
    let str = '';
    for (let i = 0; i < numarray.length * 4; i++) {
      str += hexTab.charAt((numarray[i >> 2] >> ((i % 4) * 8 + 4)) & 0x0f) + hexTab.charAt((numarray[i >> 2] >> ((i % 4) * 8)) & 0x0f);
    }
    return str;
  }

  return binl2hex(binlMD5(rstr2binl(str), str.length * 8));
}

/**
 * Converts user-pasted webpage links (Liquipedia File page, Wikimedia page, Google Drive,
 * Dropbox, Imgur) to direct, embeddable image URLs.
 */
export function resolveImageUrl(inputUrl: string): string {
  if (!inputUrl) return '';
  const url = inputUrl.trim();

  // 1. Liquipedia Wiki File page:
  // e.g. https://liquipedia.net/mobilelegends/File:Gloo_infobox_V2.jpg
  // or https://liquipedia.net/commons/File:Gloo_infobox_V2.jpg
  const lqMatch = url.match(/liquipedia\.net\/(?:[^\/]+)\/File:([^?#]+)/i);
  if (lqMatch) {
    let filename = decodeURIComponent(lqMatch[1]).trim().replace(/ /g, '_');
    filename = filename.charAt(0).toUpperCase() + filename.slice(1);
    const hash = md5(filename);
    return `https://liquipedia.net/commons/images/${hash[0]}/${hash.slice(0, 2)}/${filename}`;
  }

  // 2. Wikimedia Commons / Wikipedia File page:
  // e.g. https://commons.wikimedia.org/wiki/File:Foo.jpg
  const wmMatch = url.match(/(?:commons\.wikimedia\.org|wikipedia\.org)\/wiki\/File:([^?#]+)/i);
  if (wmMatch) {
    let filename = decodeURIComponent(wmMatch[1]).trim().replace(/ /g, '_');
    filename = filename.charAt(0).toUpperCase() + filename.slice(1);
    const hash = md5(filename);
    return `https://upload.wikimedia.org/wikipedia/commons/${hash[0]}/${hash.slice(0, 2)}/${filename}`;
  }

  // 3. Google Drive:
  // e.g. https://drive.google.com/file/d/FILE_ID/view... or https://drive.google.com/open?id=FILE_ID
  const gdMatch = url.match(/drive\.google\.com\/(?:file\/d\/([a-zA-Z0-9_-]+)|open\?id=([a-zA-Z0-9_-]+))/);
  if (gdMatch) {
    const id = gdMatch[1] || gdMatch[2];
    return `https://lh3.googleusercontent.com/d/${id}`;
  }

  // 4. Dropbox:
  // e.g. https://www.dropbox.com/s/xyz/photo.png?dl=0
  if (/dropbox\.com\/s\//i.test(url)) {
    return url.replace(/[?&]dl=0/, '').replace(/\?raw=1|$/, '?raw=1');
  }

  // 5. Imgur: e.g. https://imgur.com/abc123 or https://imgur.com/a/abc123
  const imgurMatch = url.match(/imgur\.com\/(?:gallery\/|a\/)?([a-zA-Z0-9]+)$/i);
  if (imgurMatch) {
    return `https://i.imgur.com/${imgurMatch[1]}.png`;
  }

  return url;
}
