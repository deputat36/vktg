import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../../config/supabase.js';

const NAV_DEALS_TABLE = 'nav_deals';
const NAV_PROFILES_TABLE = 'nav_profiles';
const SESSION_KEY = 'navigator_supabase_session_v1';
let client = null;

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch (_) {
    return null;
  }
}

function writeSession(session) {
  if (!session) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSupabaseSession() {
  writeSession(null);
}

function authHeaders() {
  const session = readSession();
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: 'Bearer ' + (session?.access_token || SUPABASE_PUBLISHABLE_KEY),
    'Content-Type': 'application/json'
  };
}

async function parseResponse(response) {
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_) {
    payload = text || null;
  }
  if (!response.ok) {
    const message = payload?.message || payload?.msg || payload?.error_description || payload?.hint || response.statusText || 'Supabase request failed';
    throw new Error(message);
  }
  return payload;
}

async function safeFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch (error) {
    throw new Error('Не удалось подключиться к Supabase. Проверьте интернет/VPN и обновите страницу. Детали: ' + error.message);
  }
}

async function refreshSession() {
  const session = readSession();
  if (!session?.refresh_token) {
    writeSession(null);
    return null;
  }
  try {
    const response = await safeFetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    const payload = await parseResponse(response);
    writeSession(payload);
    return payload;
  } catch (error) {
    writeSession(null);
    throw new Error('Старая сессия устарела или повреждена. Войдите заново. Детали: ' + error.message);
  }
}

async function retryWithRefresh(fetcher) {
  let response = await fetcher(authHeaders());
  if (response.status === 401 || response.status === 403) {
    await refreshSession();
    response = await fetcher(authHeaders());
  }
  return response;
}

async function rpc(functionName, payload) {
  const response = await retryWithRefresh((headers) => safeFetch(SUPABASE_URL + '/rest/v1/rpc/' + functionName, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload || {})
  }));
  return parseResponse(response);
}

class RestQuery {
  constructor(table) {
    this.table = table;
    this.method = 'GET';
    this.params = new URLSearchParams();
    this.filters = [];
    this.orders = [];
    this.body = null;
    this.returnSingle = false;
    this.returnMaybeSingle = false;
  }

  select(columns = '*') {
    this.params.set('select', columns);
    return this;
  }

  eq(column, value) {
    this.filters.push([column, 'eq.' + value]);
    return this;
  }

  order(column, options = {}) {
    const dir = options.ascending === false ? 'desc' : 'asc';
    const nulls = options.nullsFirst === false ? '.nullslast' : options.nullsFirst === true ? '.nullsfirst' : '';
    this.orders.push(column + '.' + dir + nulls);
    return this;
  }

  limit(value) {
    this.params.set('limit', String(value));
    return this;
  }

  insert(payload) {
    this.method = 'POST';
    this.body = payload;
    return this;
  }

  update(payload) {
    this.method = 'PATCH';
    this.body = payload;
    return this;
  }

  single() {
    this.returnSingle = true;
    return this.execute();
  }

  maybeSingle() {
    this.returnMaybeSingle = true;
    return this.execute();
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  async execute() {
    try {
      const url = new URL(SUPABASE_URL + '/rest/v1/' + this.table);
      for (const [key, value] of this.params.entries()) url.searchParams.set(key, value);
      for (const [column, value] of this.filters) url.searchParams.append(column, value);
      if (this.orders.length) url.searchParams.set('order', this.orders.join(','));

      const response = await retryWithRefresh((headers) => {
        if (this.method !== 'GET') headers.Prefer = 'return=representation';
        return safeFetch(url.toString(), {
          method: this.method,
          headers,
          body: this.body ? JSON.stringify(this.body) : undefined
        });
      });

      let data = await parseResponse(response);
      if (this.returnSingle || this.returnMaybeSingle) {
        if (Array.isArray(data)) data = data[0] || null;
        if (this.returnSingle && !data) throw new Error('Запись не найдена');
      }
      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }
}

export async function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (client) return client;
  client = {
    auth: {
      async getUser() {
        const session = readSession();
        if (!session?.access_token) return { data: { user: null }, error: null };
        try {
          const response = await retryWithRefresh((headers) => safeFetch(SUPABASE_URL + '/auth/v1/user', { headers }));
          const user = await parseResponse(response);
          return { data: { user }, error: null };
        } catch (error) {
          writeSession(null);
          return { data: { user: null }, error };
        }
      },
      async signInWithPassword({ email, password }) {
        try {
          writeSession(null);
          const response = await safeFetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
            method: 'POST',
            headers: {
              apikey: SUPABASE_PUBLISHABLE_KEY,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
          });
          const session = await parseResponse(response);
          writeSession(session);
          return { data: { user: session.user, session }, error: null };
        } catch (error) {
          writeSession(null);
          return { data: null, error };
        }
      },
      async signOut() {
        try {
          const session = readSession();
          if (session?.access_token) {
            await safeFetch(SUPABASE_URL + '/auth/v1/logout', {
              method: 'POST',
              headers: authHeaders()
            });
          }
          writeSession(null);
          return { error: null };
        } catch (error) {
          writeSession(null);
          return { error };
        }
      }
    },
    from(table) {
      return new RestQuery(table);
    }
  };
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
  writeSession(null);
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
  const user = await getCurrentUser();
  if (!user) throw new Error('Сначала войдите в Supabase');
  const saved = await rpc('nav_save_wizard_deal', { p_result: result });
  if (!saved?.id) throw new Error('Supabase не вернул id созданной сделки');
  return saved;
}

export async function listMyDeals(limit = 20) {
  const supabase = await getSupabaseClient();
  if (!supabase) return [];
  await ensureNavigatorProfile();
  const { data, error } = await supabase
    .from(NAV_DEALS_TABLE)
    .select('id,title,status,address,risk_level,readiness_deposit,created_at,updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function readDealFromSupabase(id) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');
  await ensureNavigatorProfile();
  const { data, error } = await supabase
    .from(NAV_DEALS_TABLE)
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function updateDealInSupabase(id, result) {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');
  await ensureNavigatorProfile();

  const deal = result.deal;
  const transferTo = Array.isArray(result.to) ? result.to : [];
  const payload = {
    title: [deal.objectType || 'Сделка', deal.address || 'без адреса'].join(' — '),
    object_type: deal.objectType || null,
    address: deal.address || null,
    price_fact: deal.priceFact || null,
    price_contract: deal.priceContract || null,
    risk_level: result.decision || null,
    readiness_deposit: result.ready || 0,
    lawyer_needed: transferTo.includes('lawyer') || Boolean(result.stop?.length || result.warn?.length),
    broker_needed: transferTo.includes('broker'),
    deal_json: deal,
    analysis_json: {
      score: result.score,
      stop: result.stop,
      warnings: result.warn,
      actions: result.actions,
      missing: result.missing,
      transfer_to: transferTo,
      spn_final: deal.spn_final || null
    },
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabase
    .from(NAV_DEALS_TABLE)
    .update(payload)
    .eq('id', id)
    .select('id,title,status,updated_at')
    .single();
  if (error) throw error;
  return data;
}
