import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../../config/supabase.js';

const NAV_DEALS_TABLE = 'nav_deals';
const NAV_PROFILES_TABLE = 'nav_profiles';
let client = null;

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

export async function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (client) return client;
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  return client;
}

export async function getCurrentUser() {
  const supabase = await getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user || null;
}

export async function signInWithPassword(email, password) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signOut() {
  const supabase = await getSupabaseClient();
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function ensureNavigatorProfile() {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');
  const user = await getCurrentUser();
  if (!user) throw new Error('Сначала войдите в Supabase');

  const { data: existing, error: selectError } = await supabase
    .from(NAV_PROFILES_TABLE)
    .select('id,full_name,role')
    .eq('id', user.id)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from(NAV_PROFILES_TABLE)
    .insert({ id: user.id, full_name: user.email || 'Пользователь', role: 'spn' })
    .select('id,full_name,role')
    .single();
  if (error) throw error;
  return data;
}

export async function saveDealToSupabase(result) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');

  const user = await getCurrentUser();
  if (!user) throw new Error('Сначала войдите в Supabase');
  await ensureNavigatorProfile();

  const deal = result.deal;
  const title = [deal.objectType || 'Сделка', deal.address || 'без адреса'].join(' — ');

  const payload = {
    title,
    status: 'draft',
    created_by: user.id,
    object_type: deal.objectType || null,
    address: deal.address || null,
    price_fact: deal.priceFact || null,
    price_contract: deal.priceContract || null,
    risk_level: result.decision || null,
    readiness_deposit: result.ready || 0,
    readiness_deal: 0,
    deal_json: deal,
    analysis_json: {
      score: result.score,
      stop: result.stop,
      warnings: result.warn,
      actions: result.actions,
      missing: result.missing,
      transfer_to: result.to
    }
  };

  const { data, error } = await supabase
    .from(NAV_DEALS_TABLE)
    .insert(payload)
    .select('id,title,status,created_at')
    .single();
  if (error) throw error;
  return data;
}

export async function listMyDeals(limit = 20) {
  const supabase = await getSupabaseClient();
  if (!supabase) return [];
  await ensureNavigatorProfile();
  const { data, error } = await supabase
    .from(NAV_DEALS_TABLE)
    .select('id,title,status,address,risk_level,readiness_deposit,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
