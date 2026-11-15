import { describe, expect, it, vi } from 'vitest';
import { classifyVoice } from '../lib/research/voice';

const page = { url: 'https://example.com', text: 'She said: we will fix the roads.' } as never;
const loadSource = async () => page;

describe('classifyVoice model errors', () => {
  it('throws when every model call fails, instead of returning no label', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const askModel = async () => { throw new Error('spawn codex ENOENT'); };
    await expect(classifyVoice('we will fix the roads', 'https://example.com', { loadSource, askModel }))
      .rejects.toThrow(/every model call failed: spawn codex ENOENT/);
  });

  it('warns about a failing backend but still decides from the others', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let n = 0;
    const askModel = async () => { if (n++ === 0) throw new Error('backend down'); return 'own' as const; };
    await classifyVoice('we will fix the roads', 'https://example.com', { loadSource, askModel });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('backend down'));
  });
});
