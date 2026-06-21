import { getCachedUser, rpc } from './supabase-v2.js';

async function load() {
  if (!getCachedUser()?.id) return;
  const data = await rpc('nav_v2_get_lawyer_queue', { p_limit: 100 }, 45000);
  console.log('queue data', data);
}

load();
