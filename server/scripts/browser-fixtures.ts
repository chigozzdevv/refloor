import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { generateLayout } from '@refloor/server/shared/planning/layout';
import { browserHouseBriefs } from '@server-test/briefs/browser-houses';

const directory = new URL('../../client/test/browser/fixtures/', import.meta.url),
  options = await resolveConfig(fileURLToPath(directory));
await mkdir(directory, { recursive: true });
for (const { name, requirements } of browserHouseBriefs) {
  const building = await generateLayout(`browser-${name}`, requirements);
  await writeFile(
    new URL(`${name}.json`, directory),
    await format(JSON.stringify(building), { ...options, parser: 'json' }),
  );
  console.info(`Generated and validated ${name}.`);
}
