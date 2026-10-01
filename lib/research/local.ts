// Research agents on open-source models running on our own hardware (Ollama), with web
// search from Brave's free plan. No per-use cost. Backend names look like "ollama:gpt-oss:20b".
//
//   OLLAMA_URL=http://<host>:11434/v1   (default: the research Mac on Tailscale)
//   BRAVE_API_KEY=...                   (free at brave.com/search/api)
//
// Small models don't drive a search loop well, so search is plain code: a few queries,
// candidate-owned pages first. The model only reads the pages and quotes them, and every
// quote is still checked word for word against its page before it counts.

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { fetchSource, researchChoice, type Source } from '../ai/research';
import type { IssueId } from '../issues';
import type { AgentResult } from './consensus';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://100.123.248.44:11434/v1';
const ollama = createOpenAICompatible({ name: 'ollama', baseURL: OLLAMA_URL, supportsStructuredOutputs: true });

// Other AI-written guides aren't sources: a claim has to trace back to the candidate or reporting.
const SKIP = /(smarter\.vote|isidewith\.com|battlegroundvote\.com|facebook\.com|instagram\.com|tiktok\.com|youtube\.com|x\.com|twitter\.com|linkedin\.com)/i;
const PAGE_CHARS = 6_000;

/**
 * Web search through the Brave Search API (its free plan allows about 2,000 queries a
 * month), using BRAVE_API_KEY. Returns result URLs in order.
 */
export async function webSearch(query: string): Promise<string[]> {
  const key = process.env.BRAVE_API_KEY;
  if (!key) throw new Error('Set BRAVE_API_KEY in .env.local for local research (free at brave.com/search/api).');
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?count=10&q=${encodeURIComponent(query)}`, {
    headers: { accept: 'application/json', 'x-subscription-token': key },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Brave search returned ${res.status}`);
  const data = (await res.json()) as { web?: { results?: { url: string }[] } };
  return (data.web?.results ?? []).map((r) => r.url).filter((u) => /^https?:\/\//.test(u) && !SKIP.test(u));
}

// Each candidate is searched once per run (to stay within the free search plan), and every
// local agent reads the same pages; the models differ, so agreement still counts.
const found = new Map<string, Promise<string[]>>();

/** Candidate-owned pages first, then official records and reporting. */
export function findSourcesFree(name: string, office: string, max = 4): Promise<string[]> {
  const key = `${name}|${office}`;
  if (!found.has(key)) found.set(key, searchOnce(name, office, max));
  return found.get(key)!;
}

async function searchOnce(name: string, office: string, max: number): Promise<string[]> {
  const last = name.toLowerCase().replace(/[^a-z\s-]/g, '').trim().split(/\s+/).pop() ?? '';
  const queries = [`"${name}" ${office} campaign issues`, `"${name}" ${office} positions`];
  const seen = new Set<string>();
  const ranked: { url: string; score: number }[] = [];
  for (const q of queries) {
    const results = await webSearch(q);
    // The free plan allows 1 query a second.
    await new Promise((r) => setTimeout(r, 1_100));
    for (const [i, url] of results.entries()) {
      if (seen.has(url)) continue;
      seen.add(url);
      const host = new URL(url).hostname.toLowerCase();
      const own = last.length > 2 && host.includes(last) ? 100 : 0;
      const official = /\.gov$|ballotpedia\.org|votesmart\.org|vote411\.org|calmatters\.org/.test(host) ? 20 : 0;
      ranked.push({ url, score: own + official - i });
    }
  }
  return ranked.sort((a, b) => b.score - a.score).slice(0, max).map((r) => r.url);
}

/** One research agent on a local model: free search, local reading, verified quotes only. */
export async function runLocalAgent(model: string, opts: { name: string; office: string; issues: IssueId[]; isMeasure?: boolean; seedUrls?: string[] }): Promise<AgentResult> {
  const urls = [...new Set([...(opts.seedUrls ?? []), ...(await findSourcesFree(opts.name, opts.office))])].slice(0, 5);
  const sources: Source[] = [];
  for (const u of urls) {
    try {
      const s = await fetchSource(u);
      if (s.text.length > 200) sources.push({ url: s.url, text: s.text.slice(0, PAGE_CHARS) });
    } catch { /* unreadable page: skip */ }
  }
  if (!sources.length) return {};
  // researchChoice drops any stance whose quote isn't found word for word in its source.
  const { stances } = await researchChoice({ ...opts, sources, model: ollama(model) });
  return stances;
}
