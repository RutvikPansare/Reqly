#!/usr/bin/env node
// Regenerates the README's star-history chart (.github/assets/star-history-*.svg)
// from real GitHub stargazer timestamps. Self-hosted because api.star-history.com
// and starchart.cc both broke when GitHub restricted the starred-data API to
// repo admins/collaborators (see decision-log.md and knowledge.md's Publishing
// & Releases section) - a static third-party badge has no way to supply a
// token, but we can, since this always runs with repo-scoped credentials.
//
// Usage: GITHUB_TOKEN=<token> node scripts/generate-star-chart.mjs [owner/repo]

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const REPO = process.argv[2] || 'RutvikPansare/Reqly';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

if (!TOKEN) {
  console.error('GITHUB_TOKEN (or GH_TOKEN) env var required.');
  process.exit(1);
}

async function fetchStargazers(repo) {
  const stars = [];
  let page = 1;
  for (;;) {
    const res = await fetch(`https://api.github.com/repos/${repo}/stargazers?per_page=100&page=${page}`, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github.star+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub API ${res.status}: ${body}`);
    }
    const batch = await res.json();
    if (batch.length === 0) break;
    if (!batch[0].starred_at) {
      throw new Error(
        'Response has no starred_at field - the token lacks permission to read starred timestamps ' +
        '(GitHub restricts this to repo admins/collaborators). If this ran with the default ' +
        'GITHUB_TOKEN, add a PAT with repo read access as a STAR_HISTORY_PAT secret instead.'
      );
    }
    stars.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return stars;
}

function buildSeries(stars) {
  const points = stars
    .map(s => ({ t: new Date(s.starred_at).getTime(), login: s.user.login }))
    .sort((a, b) => a.t - b.t);

  const first = points[0]?.t ?? Date.now();
  const last = points[points.length - 1]?.t ?? Date.now();
  const now = Date.now();

  const series = [{ t: first - 24 * 3600 * 1000, count: 0 }];
  let count = 0;
  for (const p of points) {
    count++;
    series.push({ t: p.t, count });
  }
  series.push({ t: Math.max(now, last + 24 * 3600 * 1000), count });
  return { points, series };
}

function render(points, series, theme) {
  const W = 760, H = 320;
  const padL = 50, padR = 30, padT = 30, padB = 50;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const minT = series[0].t, maxT = series[series.length - 1].t;
  const maxCount = Math.max(...series.map(s => s.count), 1);

  const x = t => padL + ((t - minT) / (maxT - minT)) * plotW;
  const y = c => padT + plotH - (c / (maxCount + 1)) * plotH;

  const isDark = theme === 'dark';
  const line = isDark ? '#f2cc60' : '#c9950f';
  const grid = isDark ? '#2a2a2e' : '#e6e6e6';
  const text = isDark ? '#a1a1aa' : '#52525b';
  const textStrong = isDark ? '#e4e4e7' : '#18181b';
  const dotStroke = isDark ? '#0f0f12' : '#ffffff';

  let d = `M ${x(series[0].t)} ${y(series[0].count)}`;
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const cur = series[i];
    d += ` L ${x(cur.t)} ${y(prev.count)} L ${x(cur.t)} ${y(cur.count)}`;
  }

  let gridSvg = '';
  for (let c = 0; c <= maxCount + 1; c++) {
    const gy = y(c);
    gridSvg += `<line x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}" stroke="${grid}" stroke-width="1"/>`;
    gridSvg += `<text x="${padL - 10}" y="${gy + 4}" font-size="11" fill="${text}" text-anchor="end" font-family="ui-monospace,monospace">${c}</text>`;
  }

  const fmt = t => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  let xLabels = '';
  const seen = new Set();
  for (const p of points) {
    const label = fmt(p.t);
    if (seen.has(label)) continue;
    seen.add(label);
    xLabels += `<text x="${x(p.t)}" y="${H - padB + 20}" font-size="10" fill="${text}" text-anchor="middle" font-family="ui-monospace,monospace">${label}</text>`;
  }

  let dots = '';
  for (const p of points) {
    const c = series.find(s => s.t === p.t).count;
    dots += `<circle cx="${x(p.t)}" cy="${y(c)}" r="4" fill="${line}" stroke="${dotStroke}" stroke-width="2"/>`;
  }

  const generated = new Date().toISOString().slice(0, 10);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="transparent"/>
  <text x="${padL}" y="20" font-size="13" font-weight="600" fill="${textStrong}" font-family="ui-monospace,monospace">GitHub Stars — ${REPO}</text>
  ${gridSvg}
  <path d="${d}" fill="none" stroke="${line}" stroke-width="2.5" stroke-linejoin="round"/>
  ${dots}
  ${xLabels}
  <text x="${W - padR}" y="20" font-size="9" fill="${text}" text-anchor="end" font-family="ui-monospace,monospace">generated ${generated}</text>
</svg>`;
}

const stars = await fetchStargazers(REPO);
const { points, series } = buildSeries(stars);

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.github', 'assets');
writeFileSync(path.join(outDir, 'star-history-light.svg'), render(points, series, 'light'));
writeFileSync(path.join(outDir, 'star-history-dark.svg'), render(points, series, 'dark'));
console.log(`Wrote star-history-{light,dark}.svg (${points.length} stars).`);
