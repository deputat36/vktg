import { getSupabaseClient, getCurrentUser, ensureNavigatorProfile } from './supabase.js';

const REVIEWS_TABLE = 'nav_deal_reviews';

export async function listDealReviews(dealId) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');
  await ensureNavigatorProfile();

  const { data, error } = await supabase
    .from(REVIEWS_TABLE)
    .select('id,deal_id,user_id,reviewer_id,reviewer_role,decision,comment,created_at')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function addDealReview(dealId, role, decision, comment) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');

  const user = await getCurrentUser();
  if (!user) throw new Error('Сначала войдите в Supabase');
  await ensureNavigatorProfile();

  const { data, error } = await supabase
    .from(REVIEWS_TABLE)
    .insert({
      deal_id: dealId,
      user_id: user.id,
      reviewer_id: user.id,
      reviewer_role: role || 'lawyer',
      decision: decision || 'needs_documents',
      comment: comment || ''
    })
    .select('id,deal_id,user_id,reviewer_id,reviewer_role,decision,comment,created_at')
    .single();

  if (error) throw error;
  return data;
}

export const REVIEW_DECISIONS = [
  ['can_prepare_deposit', 'Можно готовить задаток'],
  ['can_prepare_deal', 'Можно готовить сделку'],
  ['needs_documents', 'Нужны документы'],
  ['needs_correction', 'Нужно изменить условия'],
  ['stop_current_conditions', 'Нельзя проводить на текущих условиях'],
  ['manager_required', 'Нужно решение менеджера']
];

export const REVIEW_ROLES = [
  ['lawyer', 'Юрист'],
  ['broker', 'Ипотечный брокер'],
  ['manager', 'Менеджер'],
  ['admin', 'Админ']
];
