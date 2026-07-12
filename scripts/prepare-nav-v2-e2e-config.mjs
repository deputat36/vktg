import { writeFile } from 'node:fs/promises';

const productionProjectRef = 'ofewxuqfjhamgerwzull';
const url = String(process.env.NAV_E2E_SUPABASE_URL || '').trim().replace(/\/$/, '');
const publishableKey = String(process.env.NAV_E2E_SUPABASE_PUBLISHABLE_KEY || '').trim();

if (!url || !publishableKey) throw new Error('E2E Supabase URL and publishable key are required');
if (url.includes(productionProjectRef)) throw new Error('Refusing to prepare authenticated E2E against production');

const source = `// Generated only inside the E2E runner. Never commit credentials from this file.\nexport const SUPABASE_URL = ${JSON.stringify(url)};\nexport const SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(publishableKey)};\n`;
await writeFile(new URL('../config/supabase.js', import.meta.url), source, { encoding: 'utf8', mode: 0o600 });
console.log('Navigator E2E Supabase config prepared without printing secret values');
