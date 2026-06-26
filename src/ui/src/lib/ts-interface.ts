// Generates TypeScript interfaces from a parsed JSON value.
// Pure browser-side utility - no server needed.

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function sanitizeName(s: string): string {
  // Turn non-identifier chars into underscores, ensure it starts with a letter
  const cleaned = s.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
  return capitalize(cleaned);
}

function uniqueName(base: string, used: Set<string>): string {
  if (!used.has(base)) { used.add(base); return base; }
  let n = 2;
  while (used.has(`${base}${n}`)) n++;
  const name = `${base}${n}`;
  used.add(name);
  return name;
}

function inferType(
  value: unknown,
  hint: string,
  interfaces: string[],
  used: Set<string>
): string {
  if (value === null) return 'null';
  if (value === undefined) return 'unknown';

  if (Array.isArray(value)) {
    if (value.length === 0) return 'unknown[]';
    // Use first element to infer element type
    const elementType = inferType(value[0], hint + 'Item', interfaces, used);
    return `${elementType}[]`;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const name = uniqueName(sanitizeName(hint), used);
    const lines = Object.entries(obj).map(([k, v]) => {
      const fieldType = inferType(v, k, interfaces, used);
      const optional = v === null || v === undefined ? '?' : '';
      const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : `'${k}'`;
      return `  ${safeKey}${optional}: ${fieldType};`;
    });
    interfaces.push(`export interface ${name} {\n${lines.join('\n')}\n}`);
    return name;
  }

  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return Number.isInteger(value) ? 'number' : 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'unknown';
}

export function jsonToTsInterface(json: unknown, rootName = 'Root'): string {
  const interfaces: string[] = [];
  const used = new Set<string>();

  inferType(json, rootName, interfaces, used);

  // Interfaces are pushed deepest-first so we need to reverse for correct
  // declaration order (dependencies before dependents).
  return interfaces.reverse().join('\n\n');
}
