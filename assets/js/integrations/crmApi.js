import { getSupabaseClient, getCurrentUser, ensureNavigatorProfile } from './supabase.js';

const DEALS_TABLE = 'nav_deals';
const PROFILES_TABLE = 'nav_profiles';
const TASKS_TABLE = 'nav_deal_tasks';
const REVIEWS_TABLE = 'nav_deal_reviews';

export const ROLE_LABELS = {
  admin: 'Администратор',
  manager: 'Менеджер / РОП',
  lawyer: 'Юрист',
  broker: 'Ипотечный брокер',
  spn: 'СПН'
};

export const STATUS_LABELS = {
  draft: 'Черновик',
  needs_lawyer: 'Нужна проверка юриста',
  lawyer_review: 'На проверке у юриста',
  needs_documents: 'Нужны документы',
  mortgage_review: 'Ипотека / банк',
  ready_for_deposit: 'Готова к задатку',
  ready_for_deal: 'Готова к сделке',
  registration: 'На регистрации',
  done: 'Завершена',
  cancelled: 'Сорвана / отменена',
  archive: 'Архив'
};

export async function getMyProfile() {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');
  const user = await getCurrentUser();
  if (!user) throw new Error('Сначала войдите в систему');
  await ensureNavigatorProfile();

  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .select('id,full_name,role,phone,email,manager_id,team_name,position,is_active')
    .eq('id', user.id)
    .single();

  if (error) throw error;
  return data;
}

export async function listProfiles() {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');
  await ensureNavigatorProfile();

  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .select('id,full_name,role,phone,email,manager_id,team_name,position,is_active')
    .order('role', { ascending: true })
    .order('full_name', { ascending: true })
    .limit(500);

  if (error) throw error;
  return data || [];
}

export async function listAccessibleDeals(limit = 300) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');
  await ensureNavigatorProfile();

  const { data, error } = await supabase
    .from(DEALS_TABLE)
    .select('id,title,status,created_by,seller_spn_id,buyer_spn_id,lawyer_id,broker_id,manager_id,object_type,address,price_fact,price_contract,risk_level,readiness_deposit,readiness_deal,broker_needed,lawyer_needed,seller_phone,buyer_phone,deal_json,analysis_json,created_at,updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function updateDealStatus(dealId, status) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');
  await ensureNavigatorProfile();

  const { data, error } = await supabase
    .from(DEALS_TABLE)
    .update({ status })
    .eq('id', dealId)
    .select('id,status,updated_at')
    .single();

  if (error) throw error;
  return data;
}

export async function listDealTasksAndReviews(dealIds = []) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');
  await ensureNavigatorProfile();

  const taskMap = new Map();
  const reviewMap = new Map();

  for (const dealId of dealIds) {
    const { data: tasks } = await supabase
      .from(TASKS_TABLE)
      .select('id,deal_id,status')
      .eq('deal_id', dealId)
      .limit(100);

    const { data: reviews } = await supabase
      .from(REVIEWS_TABLE)
      .select('id,deal_id,decision,reviewer_role,created_at')
      .eq('deal_id', dealId)
      .limit(100);

    taskMap.set(dealId, tasks || []);
    reviewMap.set(dealId, reviews || []);
  }

  return { taskMap, reviewMap };
}

export function roleDescription(role) {
  if (role === 'admin') return 'Полный доступ: настройки, контроль, сделки, задачи, решения, аналитика.';
  if (role === 'manager') return 'Контроль своей группы, сделок отдела, рисков, задач и подготовки к сделкам.';
  if (role === 'lawyer') return 'Работа со сделками, где нужна юридическая проверка, решения и замечания без лишней переписки.';
  if (role === 'broker') return 'Доступ к сделкам, где нужна ипотека, банк, Домклик, оценка или сертификаты.';
  return 'СПН видит свои сделки, задатки, задачи и решения по своим клиентам.';
}
