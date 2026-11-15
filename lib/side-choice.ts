import { z } from 'zod';

// A model or reviewer names a side of a dial in words plus a strength; toPosition
// in lib/issues.ts turns it into a number. Kept out of lib/issues.ts so that file
// stays identical to the site's copy.
export const SideChoiceSchema = z.object({
  toward: z.string(),
  strength: z.enum(['lean', 'strong']),
});
