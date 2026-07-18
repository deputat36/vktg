import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('..', import.meta.url).pathname);
const catalogPath = resolve(root, 'config/nav-v2-intake-contract-v1.json');
const templatePath = resolve(root, 'supabase/prototypes/nav_v2_intake_save_adapter_v1.sql');
const rendererPath = resolve(root, 'scripts/render-nav-v2-intake-server-adapter-v1.mjs');

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const template = await readFile(templatePath, 'utf8');
const canonicalJson = JSON.stringify(catalog);
const canonicalSha256 = createHash('sha256').update(canonicalJson).digest('hex');
const renderedProcess = spawnSync(process.execPath, [rendererPath], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 2 * 1024 * 1024,
});

assert.equal(renderedProcess.status, 0, renderedProcess.stderr || 'renderer failed');
const rendered = renderedProcess.stdout;

assert.equal(catalog.contract_version, 1, 'catalog contract version changed');
assert.equal(catalog.catalog_version, '2026-07-17.1', 'catalog version changed unexpectedly');
assert.equal(catalog.rules.length, 25, 'server catalog must embed all canonical rules');
assert.equal((template.match(/__NAV_V2_INTAKE_CATALOG_JSON__/g) || []).length, 1, 'catalog marker count changed');
assert.equal((template.match(/__NAV_V2_INTAKE_CATALOG_SHA256__/g) || []).length, 1, 'SHA marker count changed');
assert.ok(rendered.includes(`$nav_v2_catalog$${canonicalJson}$nav_v2_catalog$::jsonb`), 'rendered catalog is not canonical JSON');
assert.ok(rendered.includes(`select '${canonicalSha256}'::text;`), 'rendered catalog SHA-256 differs');
assert.ok(!rendered.includes('__NAV_V2_INTAKE_CATALOG_'), 'rendered SQL contains unresolved marker');

const brokerRules = catalog.rules.filter((rule) => rule.owner === 'broker').map((rule) => rule.id).sort();
assert.deepEqual(brokerRules, ['military_mortgage', 'mortgage'], 'broker scope expanded beyond mortgages');

const documentIds = new Set(catalog.document_types.map((item) => item.id));
for (const rule of catalog.rules) {
  for (const documentId of rule.documents || []) {
    assert.ok(documentIds.has(documentId), `rule ${rule.id} references unknown document ${documentId}`);
  }
}

for (const forbiddenKey of ['clientPhone', 'sellerPhone', 'buyerPhone', 'passportNumber', 'documentUrl']) {
  assert.ok(!canonicalJson.includes(`"${forbiddenKey}"`), `canonical catalog contains forbidden key ${forbiddenKey}`);
}

console.log(
  `Navigator v2 intake server adapter parity passed: ${catalog.rules.length} rules, `
  + `${catalog.document_types.length} document types, SHA-256 ${canonicalSha256}`,
);
