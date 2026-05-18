import { getSupabaseClient, getCurrentUser, ensureNavigatorProfile } from './supabase.js';

const PROFILES_TABLE = 'nav_profiles';

export const ROLE_OPTIONS = [
  ['admin', 'Администратор'],
  ['manager', 'Менеджер / РОП'],
  ['lawyer', 'Юрист'],
  ['broker', 'Ипотечный брокер'],
  ['spn', 'СПН']
];

export async function getAdminProfile() {
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
  if (data.role !== 'admin') throw new Error('Этот раздел доступен только администратору');
  return data;
}

export async function listAllProfiles() {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');
  await getAdminProfile();

  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .select('id,full_name,role,phone,email,manager_id,team_name,position,is_active,created_at')
    .order('is_active', { ascending: false })
    .order('role', { ascending: true })
    .order('full_name', { ascending: true })
    .limit(1000);

  if (error) throw error;
  return data || [];
}

export async function updateProfile(profileId, patch) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');
  await getAdminProfile();

  const allowed = {
    full_name: patch.full_name || null,
    role: patch.role || 'spn',
    phone: patch.phone || null,
    email: patch.email || null,
    manager_id: patch.manager_id || null,
    team_name: patch.team_name || null,
    position: patch.position || null,
    is_active: Boolean(patch.is_active)
  };

  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .update(allowed)
    .eq('id', profileId)
    .select('id,full_name,role,phone,email,manager_id,team_name,position,is_active')
    .single();

  if (error) throw error;
  return data;
}

export async function createManualProfile(profile) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');
  await getAdminProfile();

  const { data, error } = await supabase
    .from(PROFILES_TABLE)
    .insert({
      id: profile.id,
      full_name: profile.full_name || 'Новый сотрудник',
      role: profile.role || 'spn',
      phone: profile.phone || null,
      email: profile.email || null,
      manager_id: profile.manager_id || null,
      team_name: profile.team_name || null,
      position: profile.position || null,
      is_active: profile.is_active !== false
    })
    .select('id,full_name,role,phone,email,manager_id,team_name,position,is_active')
    .single();

  if (error) throw error;
  return data;
}
