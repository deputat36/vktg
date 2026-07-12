const productionProjectRef = 'ofewxuqfjhamgerwzull';
const supportedRoles = new Set(['owner', 'admin', 'manager', 'spn', 'lawyer', 'broker', 'viewer']);

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing required Navigator E2E variable: ${name}`);
  return value;
}

const role = required('NAV_E2E_ROLE');
const email = required('NAV_E2E_EMAIL');
const password = required('NAV_E2E_PASSWORD');
const supabaseUrl = required('NAV_E2E_SUPABASE_URL');
required('NAV_E2E_SUPABASE_PUBLISHABLE_KEY');

if (!supportedRoles.has(role)) throw new Error(`Unsupported Navigator E2E role: ${role}`);
if (!email.toLowerCase().startsWith('nav-e2e')) {
  throw new Error('Navigator E2E accounts must use the nav-e2e email prefix');
}
if (password.length < 12) throw new Error('Navigator E2E password must contain at least 12 characters');
if (supabaseUrl.includes(productionProjectRef)) {
  throw new Error('Authenticated E2E must not target the production Supabase project');
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(supabaseUrl)) {
  throw new Error('NAV_E2E_SUPABASE_URL must be a Supabase project URL');
}
if (role === 'spn' && !String(process.env.NAV_E2E_SPN_FORBIDDEN_DEAL_ID || '').trim()) {
  throw new Error('SPN E2E requires NAV_E2E_SPN_FORBIDDEN_DEAL_ID for the negative access check');
}

console.log(`Navigator E2E preflight passed for role ${role}; credential values were not printed`);
