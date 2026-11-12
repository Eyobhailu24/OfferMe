import { mkdir, writeFile } from 'node:fs/promises';
import { configuration } from '../src/config.js';
import { createApplication } from '../src/application.js';
const runtime = await createApplication(configuration(), { quiet: true });
try {
  await mkdir('contracts', { recursive: true });
  await writeFile('contracts/openapi.json', JSON.stringify(runtime.apiDocument, null, 2));
  console.log('Exported contracts/openapi.json');
} finally { await runtime.close(); }
