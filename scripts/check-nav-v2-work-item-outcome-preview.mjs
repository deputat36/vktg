import assert from 'node:assert/strict';
import {
  canConfirmDocumentOutcome,
  canConfirmRiskResolution,
  documentOutcomePreview,
  riskResolutionPreview,
  validateDocumentOutcome,
  validateRiskResolution
} from '../assets/js/nav-v2/work-item-outcome-model-v2.js';

assert.equal(canConfirmDocumentOutcome('spn', 'lawyer', 'basis'), false);
assert.equal(canConfirmDocumentOutcome('lawyer', 'lawyer', 'basis'), true);
assert.equal(canConfirmDocumentOutcome('broker', 'lawyer', 'basis'), false);
assert.equal(canConfirmDocumentOutcome('broker', 'broker', 'mortgage'), true);
assert.equal(canConfirmDocumentOutcome('manager', 'spn', 'corporate'), true);
assert.equal(canConfirmDocumentOutcome('manager', 'lawyer', 'basis'), false);
assert.equal(canConfirmDocumentOutcome('owner', 'lawyer', 'basis'), true);

assert.equal(canConfirmRiskResolution('spn', 'lawyer'), false);
assert.equal(canConfirmRiskResolution('lawyer', 'lawyer'), true);
assert.equal(canConfirmRiskResolution('broker', 'broker'), true);
assert.equal(canConfirmRiskResolution('broker', 'lawyer'), false);
assert.equal(canConfirmRiskResolution('manager', null), true);
assert.equal(canConfirmRiskResolution('manager', 'lawyer'), false);

assert.deepEqual(validateDocumentOutcome({ code: 'external_wait', note: 'Запрошено' }), {
  valid: false,
  errors: ['Укажите внешнюю сторону или организацию.']
});
assert.equal(validateDocumentOutcome({ code: 'external_wait', note: 'Запрошено', externalParty: 'банк' }).valid, true);
assert.deepEqual(validateDocumentOutcome({ code: 'deferred', note: 'После задатка' }), {
  valid: false,
  errors: ['Укажите контрольную дату.']
});
assert.deepEqual(validateDocumentOutcome({ code: 'replaced', note: 'Есть другой документ' }), {
  valid: false,
  errors: ['Выберите документ, который заменяет текущий.']
});
assert.equal(validateDocumentOutcome({ code: 'not_applicable', note: 'Не относится к сценарию' }).valid, true);

assert.deepEqual(validateRiskResolution({ code: 'superseded', note: 'Объединено' }), {
  valid: false,
  errors: ['Выберите риск, который заменяет текущий.']
});
assert.equal(validateRiskResolution({ code: 'mitigated', note: 'Evidence приложен' }).valid, true);

const spnDocument = documentOutcomePreview({ role: 'spn', responsibleRole: 'lawyer', category: 'basis', code: 'not_applicable' });
assert.equal(spnDocument.mode, 'proposal');
assert.match(spnDocument.readiness, /не изменит готовность/i);

const lawyerDocument = documentOutcomePreview({ role: 'lawyer', responsibleRole: 'lawyer', category: 'basis', code: 'not_applicable' });
assert.equal(lawyerDocument.mode, 'confirmable_terminal');

const externalWait = documentOutcomePreview({ role: 'spn', responsibleRole: 'spn', category: 'identity', code: 'external_wait' });
assert.equal(externalWait.mode, 'active_exception');
assert.match(externalWait.readiness, /останется активным/i);

const spnRisk = riskResolutionPreview({ role: 'spn', assignedRole: 'lawyer', code: 'mitigated' });
assert.equal(spnRisk.mode, 'proposal');
assert.match(spnRisk.readiness, /не снимет блокировку/i);

const brokerRisk = riskResolutionPreview({ role: 'broker', assignedRole: 'broker', code: 'mitigated' });
assert.equal(brokerRisk.mode, 'confirmable_terminal');

console.log('Navigator v2 work-item outcome preview semantic regression passed');
