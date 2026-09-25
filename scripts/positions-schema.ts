// Writes data/positions.schema.json from the same schema the site loads research with,
// so editors can autocomplete and check a positions file as you type.
//
//   npm run schema

import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { PositionsFileSchema } from '../lib/ballot/positions';

const schema = {
  ...z.toJSONSchema(PositionsFileSchema, { io: 'input' }),
  title: 'Plain Ballot researched contest',
  description: 'One contest in data/positions. Every stance needs an exact quote from its sourceUrl. See CONTRIBUTING.md.',
};
writeFile('data/positions.schema.json', JSON.stringify(schema, null, 2) + '\n').then(() => console.log('wrote data/positions.schema.json'));
