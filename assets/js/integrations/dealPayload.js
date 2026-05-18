export function isBrokerNeeded(deal = {}) {
  const payments = deal.payments || [];
  const certificates = deal.certificates || [];
  const bankType = String(deal.bankType || '').toLowerCase();
  return Boolean(
    payments.includes('mortgage')
    || payments.includes('safe')
    || certificates.length
    || bankType.includes('сбер')
    || bankType.includes('банк')
    || bankType.includes('ипот')
  );
}

export function isLawyerNeeded(deal = {}, result = {}) {
  const flags = deal.flags || [];
  const certificates = deal.certificates || [];
  const rightForm = String(deal.rightForm || '').toLowerCase();
  const objectType = String(deal.objectType || '').toLowerCase();
  return Boolean(
    (result.stop || []).length
    || (result.warn || []).length
    || flags.length
    || certificates.length
    || rightForm.includes('доля')
    || objectType.includes('дом')
    || objectType.includes('зем')
    || objectType.includes('снт')
    || objectType.includes('уступ')
    || objectType.includes('новострой')
  );
}

export function suggestedStatus(deal = {}, result = {}) {
  if ((result.stop || []).length) return 'needs_lawyer';
  if (isBrokerNeeded(deal)) return 'mortgage_review';
  if ((result.missing || []).length || (result.warn || []).length) return 'needs_documents';
  if (Number(result.ready || 0) >= 80) return 'ready_for_deposit';
  return 'draft';
}

export function buildDealPayload(result, userId = null) {
  const deal = result.deal || {};
  const title = [deal.objectType || 'Сделка', deal.address || 'без адреса'].join(' — ');
  const brokerNeeded = isBrokerNeeded(deal);
  const lawyerNeeded = isLawyerNeeded(deal, result);

  const payload = {
    title,
    status: suggestedStatus(deal, result),
    object_type: deal.objectType || null,
    address: deal.address || null,
    price_fact: deal.priceFact || null,
    price_contract: deal.priceContract || null,
    risk_level: result.decision || null,
    readiness_deposit: result.ready || 0,
    readiness_deal: 0,
    broker_needed: brokerNeeded,
    lawyer_needed: lawyerNeeded,
    seller_phone: deal.sellerPhone || null,
    buyer_phone: deal.buyerPhone || null,
    client_phone: deal.buyerPhone || deal.sellerPhone || null,
    deal_json: deal,
    analysis_json: {
      score: result.score,
      stop: result.stop,
      warnings: result.warn,
      actions: result.actions,
      missing: result.missing,
      transfer_to: result.to,
      broker_needed: brokerNeeded,
      lawyer_needed: lawyerNeeded
    }
  };

  if (userId) {
    payload.created_by = userId;
    payload.seller_spn_id = userId;
    payload.buyer_spn_id = userId;
  }

  return payload;
}
