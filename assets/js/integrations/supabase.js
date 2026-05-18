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
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = payload?.message || payload?.msg || payload?.error_description || response.statusText || 'Supabase request failed';
    throw new Error(message);
  }
  return payload;
}

async function refreshSession() {
  const session = readSession();
  if (!session?.refresh_token) return null;
  const response = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
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

      const headers = authHeaders();
      if (this.method !== 'GET') headers.Prefer = 'return=representation';

      let response = await fetch(url.toString(), {
        method: this.method,
        headers,
        body: this.body ? JSON.stringify(this.body) : undefined
      });

      if (response.status === 401) {
        await refreshSession();
        response = await fetch(url.toString(), {
          method: this.method,
          headers: authHeaders(),
          body: this.body ? JSON.stringify(this.body) : undefined
        });
      }

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
          let response = await fetch(SUPABASE_URL + '/auth/v1/user', {
            headers: authHeaders()
          });
          if (response.status === 401) {
            await refreshSession();
            response = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: authHeaders() });
          }
          const user = await parseResponse(response);
          return { data: { user }, error: null };
        } catch (error) {
          return { data: { user: null }, error };
        }
      },
      async signInWithPassword({ email, password }) {
        try {
          const response = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
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
          return { data: null, error };
        }
      },
      async signOut() {
        try {
          const session = readSession();
          if (session?.access_token) {
            await fetch(SUPABASE_URL + '/auth/v1/logout', {
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
    .select('id,title,status,created_at,updated_at')
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
    .select('id,title,status,address,risk_level,readiness_deposit,created_at,updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
