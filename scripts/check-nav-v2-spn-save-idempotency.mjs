import assert from 'node:assert/strict';
import {
  createWizardSaveLease,
  createWizardSaveReceipt,
  currentWizardSaveReceipt,
  readWizardSaveLease,
  readWizardSaveReceipt,
  releaseWizardSaveLease,
  storeWizardSaveReceipt,
  tryClaimWizardSaveLease,
  wizardSaveStorageKeys,
  wizardSubmissionFingerprint
} from '../assets/js/nav-v2/spn-save-idempotency-model-v2.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const draftA = {
  address: 'Борисоглебск, Первомайская,3',
  objectType: 'house_land',
  buyerName: 'Вася',
  flags: ['shares', 'minorBuyer'],
  nested: { b: 2, a: 1 }
};
const draftAReordered = {
  nested: { a: 1, b: 2 },
  flags: ['shares', 'minorBuyer'],
  buyerName: 'Вася',
  objectType: 'house_land',
  address: 'Борисоглебск, Первомайская,3'
};
const fingerprint = wizardSubmissionFingerprint(draftA, 'spn-1');
assert.equal(fingerprint, wizardSubmissionFingerprint(draftAReordered, 'spn-1'));
assert.notEqual(fingerprint, wizardSubmissionFingerprint({ ...draftA, buyerName: 'Петя' }, 'spn-1'));
assert.notEqual(fingerprint, wizardSubmissionFingerprint(draftA, 'spn-2'));
assert.match(fingerprint, /^[0-9a-f]{8}$/);

const keys = wizardSaveStorageKeys(fingerprint);
assert.equal(keys.lease.includes(fingerprint), true);
assert.equal(keys.receipt.includes(fingerprint), true);

const now = 1_000_000;
const lease = createWizardSaveLease(fingerprint, 'token-a', now, 10_000);
assert.equal(readWizardSaveLease(JSON.stringify(lease), now + 1_000)?.token, 'token-a');
assert.equal(readWizardSaveLease(JSON.stringify(lease), now + 10_001), null);

const storage = new MemoryStorage();
const firstClaim = tryClaimWizardSaveLease(storage, fingerprint, 'token-a', now, 10_000);
assert.equal(firstClaim.acquired, true);
const competingClaim = tryClaimWizardSaveLease(storage, fingerprint, 'token-b', now + 100, 10_000);
assert.equal(competingClaim.acquired, false);
assert.equal(competingClaim.lease.token, 'token-a');
assert.equal(releaseWizardSaveLease(storage, fingerprint, 'token-b'), false);
assert.equal(releaseWizardSaveLease(storage, fingerprint, 'token-a'), true);

const expiredStorage = new MemoryStorage();
expiredStorage.setItem(keys.lease, JSON.stringify(createWizardSaveLease(fingerprint, 'old-token', now, 100)));
const afterExpiry = tryClaimWizardSaveLease(expiredStorage, fingerprint, 'new-token', now + 101, 10_000);
assert.equal(afterExpiry.acquired, true);
assert.equal(afterExpiry.lease.token, 'new-token');

const receipt = createWizardSaveReceipt(fingerprint, {
  savedAt: now,
  ttlMs: 5_000,
  dealId: 'deal-1',
  address: draftA.address,
  objectType: draftA.objectType
});
assert.equal(readWizardSaveReceipt(JSON.stringify(receipt), fingerprint, now + 1_000)?.deal_id, 'deal-1');
assert.equal(readWizardSaveReceipt(JSON.stringify(receipt), fingerprint, now + 5_001), null);
assert.equal(readWizardSaveReceipt(JSON.stringify(receipt), 'other-fingerprint', now + 1_000), null);

const receiptStorage = new MemoryStorage();
storeWizardSaveReceipt(receiptStorage, fingerprint, {
  savedAt: now,
  ttlMs: 5_000,
  dealId: 'deal-1',
  address: draftA.address,
  objectType: draftA.objectType
});
assert.equal(currentWizardSaveReceipt(receiptStorage, fingerprint, now + 1_000)?.deal_id, 'deal-1');
assert.equal(currentWizardSaveReceipt(receiptStorage, fingerprint, now + 5_001), null);
assert.equal(receiptStorage.getItem(keys.receipt), null);

console.log('Navigator v2 SPN wizard save idempotency semantic regression passed');
