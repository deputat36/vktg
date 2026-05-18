import { getSupabaseClient, getCurrentUser, ensureNavigatorProfile } from './supabase.js';
import { buildDealPayload } from './dealPayload.js';

const NAV_DEALS_TABLE = 'nav_deals';

export async function createDealInSupabase(result) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');

  const user = await getCurrentUser();
  if (!user) throw new Error('Сначала войдите в Supabase');
  await ensureNavigatorProfile();

  const payload = buildDealPayload(result, user.id);

  const { data, error } = await supabase
    .from(NAV_DEALS_TABLE)
    .insert(payload)
    .select('id,title,status,created_at,updated_at')
    .single();

  if (error) throw error;
  return data;
}

export async function getDealFromSupabase(dealId) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');
  await ensureNavigatorProfile();

  const { data, error } = await supabase
    .from(NAV_DEALS_TABLE)
    .select('id,title,status,deal_json,analysis_json,created_at,updated_at')
    .eq('id', dealId)
    .single();

  if (error) throw error;
  return data;
}

export async function updateDealInSupabase(dealId, result) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');

  const user = await getCurrentUser();
  if (!user) throw new Error('Сначала войдите в Supabase');
  await ensureNavigatorProfile();

  const payload = buildDealPayload(result);
  delete payload.created_by;
  delete payload.seller_spn_id;
  delete payload.buyer_spn_id;

  const { data, error } = await supabase
    .from(NAV_DEALS_TABLE)
    .update(payload)
    .eq('id', dealId)
    .select('id,title,status,created_at,updated_at')
    .single();

  if (error) throw error;
  return data;
}
