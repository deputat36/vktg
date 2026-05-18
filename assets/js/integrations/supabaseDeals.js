import { getSupabaseClient, getCurrentUser, ensureNavigatorProfile } from './supabase.js';

const NAV_DEALS_TABLE = 'nav_deals';

function buildDealPayload(result) {
  const deal = result.deal;
  const title = [deal.objectType || 'Сделка', deal.address || 'без адреса'].join(' — ');

  return {
    title,
    status: 'draft',
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

  const { data, error } = await supabase
    .from(NAV_DEALS_TABLE)
    .update(payload)
    .eq('id', dealId)
    .select('id,title,status,created_at,updated_at')
    .single();

  if (error) throw error;
  return data;
}
