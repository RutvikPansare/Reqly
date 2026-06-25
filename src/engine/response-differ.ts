import type { HistoryEntry } from './history-store.js';

export interface ResponseDiff {
  statusChanged: boolean;
  prevStatus: number;
  currStatus: number;
  latencyDelta: number;
  bodyChanges: string[];
}

// ── JSON object comparison ───────────────────────────────────────────────────

function diffJsonObjects(
  prev: Record<string, unknown>,
  curr: Record<string, unknown>
): string[] {
  const changes: string[] = [];
  const prevKeys = Object.keys(prev);
  const currKeySet = new Set(Object.keys(curr));

  for (const key of prevKeys) {
    if (!currKeySet.has(key)) {
      changes.push(`- ${key}: ${JSON.stringify(prev[key])}`);
    } else if (JSON.stringify(prev[key]) !== JSON.stringify(curr[key])) {
      changes.push(`~ ${key}: ${JSON.stringify(prev[key])} -> ${JSON.stringify(curr[key])}`);
    }
  }

  for (const key of Object.keys(curr)) {
    if (!Object.prototype.hasOwnProperty.call(prev, key)) {
      changes.push(`+ ${key}: ${JSON.stringify(curr[key])}`);
    }
  }

  return changes;
}

// ── Plain-text line diff ─────────────────────────────────────────────────────
// Produces a set-based diff: lines only in prev are removed (-),
// lines only in curr are added (+). Good enough for spotting contract breaks.

function diffLines(prev: string, curr: string): string[] {
  const prevLines = prev.split('\n').map(l => l.trim()).filter(Boolean);
  const currLines = curr.split('\n').map(l => l.trim()).filter(Boolean);
  const prevSet = new Set(prevLines);
  const currSet = new Set(currLines);
  const changes: string[] = [];

  for (const line of prevLines) {
    if (!currSet.has(line)) changes.push(`- ${line}`);
  }
  for (const line of currLines) {
    if (!prevSet.has(line)) changes.push(`+ ${line}`);
  }

  return changes;
}

// ── Body comparator ──────────────────────────────────────────────────────────

function diffBodies(prevBody: string | undefined, currBody: string | undefined): string[] {
  if (prevBody === undefined && currBody === undefined) return [];

  if (prevBody === undefined) {
    return [`+ (body appeared: ${(currBody ?? '').slice(0, 80)})`];
  }
  if (currBody === undefined) {
    return [`- (body disappeared)`];
  }

  // Attempt JSON object comparison
  try {
    const prevParsed = JSON.parse(prevBody);
    const currParsed = JSON.parse(currBody);
    if (
      prevParsed !== null && typeof prevParsed === 'object' && !Array.isArray(prevParsed) &&
      currParsed !== null && typeof currParsed === 'object' && !Array.isArray(currParsed)
    ) {
      return diffJsonObjects(prevParsed, currParsed);
    }
  } catch {
    // not valid JSON - fall through to line diff
  }

  return diffLines(prevBody, currBody);
}

// ── Public API ───────────────────────────────────────────────────────────────

export function diffResponses(prev: HistoryEntry, curr: HistoryEntry): ResponseDiff {
  return {
    statusChanged: prev.status !== curr.status,
    prevStatus: prev.status,
    currStatus: curr.status,
    latencyDelta: curr.latency - prev.latency,
    bodyChanges: diffBodies(prev.body, curr.body),
  };
}
