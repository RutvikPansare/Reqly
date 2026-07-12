// Folds a request's `params` object into its URL query string, mirroring what
// RequestEditor does on load. Used to normalize requests before dirty
// comparisons so a `params`-carrying request doesn't read as dirty on open.
// {{variable}} templates are left unencoded so substitution still sees them.
export function foldParamsIntoUrl(req: any): any {
  if (!req || !req.params || Object.keys(req.params).length === 0) {
    if (req && 'params' in req) {
      const { params: _p, ...rest } = req;
      return rest;
    }
    return req;
  }
  const url: string = req.url || '';
  const qIndex = url.indexOf('?');
  const base = qIndex === -1 ? url : url.slice(0, qIndex);
  const encodePart = (str: string) =>
    str.split(/(\{\{[^}]+\}\})/g).map((part, i) => (i % 2 === 1 ? part : encodeURIComponent(part))).join('');
  const pairs: string[] = [];
  if (qIndex !== -1 && url.slice(qIndex + 1)) {
    for (const p of url.slice(qIndex + 1).split('&')) {
      const [k, v] = p.split('=');
      pairs.push(`${encodePart(decodeURIComponent(k || ''))}=${encodePart(decodeURIComponent(v || ''))}`);
    }
  }
  for (const [k, v] of Object.entries(req.params)) {
    pairs.push(`${encodePart(k)}=${encodePart(String(v))}`);
  }
  const { params: _params, ...rest } = req;
  return { ...rest, url: pairs.length > 0 ? `${base}?${pairs.join('&')}` : base };
}

// Resolves {{variable}} templates against the UI's available-variables list
// (collection > env; dotenv values are hidden from the UI so those stay
// unresolved). Used by realtime panels, which connect directly from the
// browser and never pass through the server's substitution engine.
export function resolveTemplateVars(
  input: string,
  vars: Array<{ name: string; value?: string }> | undefined,
): string {
  if (!input || !vars || vars.length === 0) return input;
  return input.replace(/\{\{([^}]+)\}\}/g, (match, rawName) => {
    const name = String(rawName).trim();
    const found = vars.find(v => v.name === name);
    return found && found.value ? found.value : match;
  });
}

export function isDeepEqual(obj1: any, obj2: any): boolean {
  const sortKeys = (obj: any): any => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(sortKeys);
    return Object.keys(obj).sort().reduce((acc: any, key) => {
      if (obj[key] !== undefined) acc[key] = sortKeys(obj[key]);
      return acc;
    }, {});
  };
  return JSON.stringify(sortKeys(obj1)) === JSON.stringify(sortKeys(obj2));
}
