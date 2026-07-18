import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const catalogPath = resolve(root, 'config/nav-v2-intake-contract-v1.json');
const templatePath = resolve(root, 'supabase/prototypes/nav_v2_intake_save_adapter_v1.sql');
const outputFlag = process.argv.indexOf('--output');
const outputPath = outputFlag >= 0 ? process.argv[outputFlag + 1] : '';

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const template = await readFile(templatePath, 'utf8');
const catalogJson = JSON.stringify(catalog);
const catalogSha256 = createHash('sha256').update(catalogJson).digest('hex');

if (Number(catalog.contract_version) !== 1) throw new Error('intake catalog contract_version must remain 1');
if (!catalog.catalog_version) throw new Error('intake catalog_version is required');
if ((template.match(/__NAV_V2_INTAKE_CATALOG_JSON__/g) || []).length !== 1) {
  throw new Error('SQL template must contain exactly one catalog JSON marker');
}
if ((template.match(/__NAV_V2_INTAKE_CATALOG_SHA256__/g) || []).length !== 1) {
  throw new Error('SQL template must contain exactly one catalog SHA-256 marker');
}

const rendered = template
  .replace('__NAV_V2_INTAKE_CATALOG_JSON__', catalogJson)
  .replace('__NAV_V2_INTAKE_CATALOG_SHA256__', catalogSha256);

if (rendered.includes('__NAV_V2_INTAKE_CATALOG_')) throw new Error('unresolved intake catalog marker');

if (outputPath) {
  await writeFile(resolve(outputPath), rendered, 'utf8');
} else {
  process.stdout.write(rendered);
}
