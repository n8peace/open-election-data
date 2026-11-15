import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { slug } from '../lib/ballot/positions';

interface EvalCase {
  id: string;
  kind: string;
  from: string;
  candidate: string;
  office: string;
  issue: string;
  quote: string;
  sourceUrl: string;
  expect: { toward: string };
}

interface SourceFile {
  office: string;
  reviewed: boolean;
  choices: Array<{
    name: string;
    stances: Record<string, { quote: string; sourceUrl: string; toward: string }>;
  }>;
}

const SOURCES = [
  'data/positions/governor-california.json',
  'data/positions/u-s-house-california-district-10.json',
] as const;

describe('model eval cases', () => {
  it('contains only unique, unchanged stances from the reviewed source files', async () => {
    const text = await readFile(path.join(process.cwd(), 'evals', 'cases.jsonl'), 'utf8');
    const cases = text.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line) as EvalCase);
    const sourceFiles = new Map<string, SourceFile>();
    const expectedIds: string[] = [];

    for (const from of SOURCES) {
      const source = JSON.parse(await readFile(path.join(process.cwd(), from), 'utf8')) as SourceFile;
      expect(source.reviewed).toBe(true);
      sourceFiles.set(from, source);
      const stem = path.basename(from, '.json');
      for (const choice of source.choices) {
        for (const issue of Object.keys(choice.stances)) expectedIds.push(`${stem}/${slug(choice.name)}/${issue}`);
      }
    }

    expect(cases.length).toBeGreaterThanOrEqual(10);
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    expect(cases.map((c) => c.id).sort()).toEqual(expectedIds.sort());

    for (const c of cases) {
      expect(SOURCES).toContain(c.from);
      expect(c.kind).toBe('side');
      const source = sourceFiles.get(c.from)!;
      const choice = source.choices.find((candidate) => candidate.name === c.candidate);
      expect(choice, c.id).toBeDefined();
      const stance = choice!.stances[c.issue];
      expect(stance, c.id).toBeDefined();
      expect(c.office).toBe(source.office);
      expect(c.id).toBe(`${path.basename(c.from, '.json')}/${slug(c.candidate)}/${c.issue}`);
      expect(c.quote).toBe(stance.quote);
      expect(c.sourceUrl).toBe(stance.sourceUrl);
      expect(c.expect.toward).toBe(stance.toward);
    }
  });
});
