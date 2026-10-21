import { writeFile } from 'node:fs/promises';
import { generateLayout } from '@refloor/server/shared/planning/layout';
import { lShapedBrief } from '@server-test/briefs/l-shaped';

const building = await generateLayout('browser-l-shaped', lShapedBrief('living-hub'));
await writeFile(
  new URL('../../client/test/fixtures/generated-l-shaped.json', import.meta.url),
  JSON.stringify(building, null, 2) + '\n',
);
console.info('Generated the validated L-shaped browser fixture.');
