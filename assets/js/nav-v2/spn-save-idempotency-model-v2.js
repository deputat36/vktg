const LEASE_TTL_MS = 120_000;
const RECEIPT_TTL_MS = 10 * 60_000;

function text(value) {
  return String(value ?? '').trim();
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  const source = object(value);
  if (!source) return value;
  return Object.keys(source).sort().reduce((result, key) => {
    if (source[key] !== undefined) result[key] = stable(source[key]);
    return result;
  }, {});
}

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function parseStored(raw) {
  try {
    return object(JSON.parse(raw || 'null'));
  } catch (_) {
    return null;
  }
}

export function wizardSubmissionFingerprint(draft, userId = '') {
  const payload = {
    user_id: text(userId) || null,
    deal: stable(object(draft) || {})
  };
  return hashText(JSON.stringify(payload));
}

export function wizardSaveStorageKeys(fingerprint) {
  const safe = text(fingerprint) || 'unknown';
  return {
    lease: `nav_spn_save_lease_v2:${safe}`,
    receipt: `nav_spn_save_receipt_v2:${safe}`
  };
}

export function readWizardSaveLease(raw, now = Date.now()) {
  const value = parseStored(raw);
  if (!value || !text(value.token) || Number(value.expires_at || 0) <= Number(now)) return null;
  return {
    token: text(value.token),
    fingerprint: text(value.fingerprint),
    started_at: Number(value.started_at || 0),
    expires_at: Number(value.expires_at || 0)
  };
}

export function createWizardSaveLease(fingerprint, token, now = Date.now(), ttlMs = LEASE_TTL_MS) {
  return {
    version: 1,
    fingerprint: text(fingerprint),
    token: text(token),
    started_at: Number(now),
    expires_at: Number(now) + Number(ttlMs)
  };
}

export function tryClaimWizardSaveLease(storage, fingerprint, token, now = Date.now(), ttlMs = LEASE_TTL_MS) {
  const keys = wizardSaveStorageKeys(fingerprint);
  const existing = readWizardSaveLease(storage?.getItem?.(keys.lease), now);
  if (existing && existing.token !== text(token)) {
    return { acquired: false, lease: existing, key: keys.lease };
  }
  const lease = createWizardSaveLease(fingerprint, token, now, ttlMs);
  storage?.setItem?.(keys.lease, JSON.stringify(lease));
  const confirmed = readWizardSaveLease(storage?.getItem?.(keys.lease), now);
  return {
    acquired: Boolean(confirmed && confirmed.token === text(token)),
    lease: confirmed,
    key: keys.lease
  };
}

export function releaseWizardSaveLease(storage, fingerprint, token) {
  const keys = wizardSaveStorageKeys(fingerprint);
  const current = parseStored(storage?.getItem?.(keys.lease));
  if (!current || text(current.token) !== text(token)) return false;
  storage?.removeItem?.(keys.lease);
  return true;
}

export function createWizardSaveReceipt(fingerprint, options = {}) {
  const now = Number(options.savedAt || Date.now());
  return {
    version: 1,
    fingerprint: text(fingerprint),
    saved_at: now,
    expires_at: now + Number(options.ttlMs || RECEIPT_TTL_MS),
    deal_id: text(options.dealId) || null,
    address: text(options.address) || null,
    object_type: text(options.objectType) || null
  };
}

export function readWizardSaveReceipt(raw, fingerprint, now = Date.now()) {
  const value = parseStored(raw);
  if (!value) return null;
  if (text(value.fingerprint) !== text(fingerprint)) return null;
  if (Number(value.expires_at || 0) <= Number(now)) return null;
  return {
    fingerprint: text(value.fingerprint),
    saved_at: Number(value.saved_at || 0),
    expires_at: Number(value.expires_at || 0),
    deal_id: text(value.deal_id) || null,
    address: text(value.address) || null,
    object_type: text(value.object_type) || null
  };
}

export function storeWizardSaveReceipt(storage, fingerprint, options = {}) {
  const keys = wizardSaveStorageKeys(fingerprint);
  const receipt = createWizardSaveReceipt(fingerprint, options);
  storage?.setItem?.(keys.receipt, JSON.stringify(receipt));
  return receipt;
}

export function currentWizardSaveReceipt(storage, fingerprint, now = Date.now()) {
  const keys = wizardSaveStorageKeys(fingerprint);
  const receipt = readWizardSaveReceipt(storage?.getItem?.(keys.receipt), fingerprint, now);
  if (!receipt && storage?.getItem?.(keys.receipt)) storage?.removeItem?.(keys.receipt);
  return receipt;
}

export function wizardSaveLeaseTtlMs() {
  return LEASE_TTL_MS;
}
