import * as core from './supabase-v2.js?core=20260716-01';
import { minimizeNavigatorReadPayload } from './read-layer-minimization-model-v2.js?v=20260716-01';

export * from './supabase-v2.js?core=20260716-01';

export async function rpc(name, payload = {}, timeout) {
  const data = timeout === undefined
    ? await core.rpc(name, payload)
    : await core.rpc(name, payload, timeout);
  return minimizeNavigatorReadPayload(data);
}
