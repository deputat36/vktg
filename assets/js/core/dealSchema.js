export function includesAny(list = [], values = []) {
  return values.some((value) => list.includes(value));
}

export function normalizeDeal(deal = {}) {
  const payments = deal.payments || [];
  const settlements = deal.settlements || [];
  const certificates = deal.certificates || [];
  const flags = deal.flags || [];
  const basis = deal.basis || [];
  const objectType = deal.objectType || '';
  const rightForm = deal.rightForm || '';

  const property = {
    isFlat: /квартир/i.test(objectType),
    isRoom: /комнат/i.test(objectType),
    isShare: /доля/i.test(rightForm) || flags.includes('shareDeal') || /доля/i.test(objectType),
    isHouse: /дом/i.test(objectType),
    isLand: /зем|участ|снт|дач/i.test(objectType),
    isPrivateSectorFlat: flags.includes('privateSectorFlat') || /частном секторе/i.test(objectType),
    isNewBuilding: /новострой|дду/i.test(objectType),
    isAssignment: /уступ/i.test(objectType) || basis.includes('assignment'),
    isCommercial: /коммер|нежил/i.test(objectType),
    needsLandCadastre: /дом|зем|участ|снт|дач/i.test(objectType),
    needsNspd: flags.includes('landBoundary') || /зем|участ|снт|дач/i.test(objectType)
  };

  const owners = {
    sellerCount: deal.sellerCount || 'не указано',
    buyerCount: deal.buyerCount || 'не указано',
    hasSeveralSellers: Number(String(deal.sellerCount || '').replace(/\D/g, '')) > 1 || flags.includes('shareDeal'),
    hasSeveralBuyers: Number(String(deal.buyerCount || '').replace(/\D/g, '')) > 1,
    hasMinorSeller: flags.includes('minorSeller'),
    hasMinorBuyer: flags.includes('minorBuyer') || payments.includes('matcap'),
    hasMinorRegistered: flags.includes('minorRegistered') || flags.includes('registeredUnknown'),
    hasChildren: flags.includes('minorSeller') || flags.includes('minorBuyer') || flags.includes('minorRegistered') || flags.includes('matcapPast') || includesAny(payments, ['matcap', 'regMatcap', 'nominalChild', 'svoChildAccount']) || includesAny(certificates, ['matcap', 'regMatcap', 'nominalChild', 'svoChildAccount']),
    hasSpouse: flags.includes('spouse'),
    hasPowerOfAttorney: flags.includes('power'),
    hasPrivatizationRefusers: flags.includes('privatRefusers')
  };

  const money = {
    hasMortgage: payments.includes('mortgage') || payments.includes('nis') || /сбер|банк|ипот/i.test(deal.bankType || ''),
    hasSber: /сбер|домклик/i.test(deal.bankType || '') || settlements.includes('safe'),
    hasMatcap: payments.includes('matcap') || certificates.includes('matcap'),
    hasRegionalMatcap: payments.includes('regMatcap') || certificates.includes('regMatcap'),
    hasChildMoney: includesAny(payments, ['nominalChild', 'svoChildAccount']) || includesAny(certificates, ['nominalChild', 'svoChildAccount']),
    hasSocialProgram: includesAny(payments, ['young', 'emergency', 'largeFamily', 'refugee', 'subsidy', 'regMatcap']) || includesAny(certificates, ['young', 'emergency', 'largeFamily', 'refugee', 'subsidy', 'regMatcap']),
    hasSellerMortgageClose: payments.includes('sellerMortgageClose'),
    hasInstallment: payments.includes('installment'),
    hasAlternative: payments.includes('counter') || flags.includes('alternative'),
    riskySettlement: includesAny(settlements, ['directBefore', 'cashReceipt']),
    safeSettlement: includesAny(settlements, ['safe', 'accreditive', 'cell', 'escrow']),
    publicSettlement: includesAny(settlements, ['pensionFund', 'municipal', 'military', 'nominalPermission']),
    settlementUnknown: !settlements.length || settlements.includes('unknown')
  };

  const title = {
    hasKnownBasis: basis.length > 0 && !basis.includes('extractOnly') && !basis.includes('other'),
    isInheritance: includesAny(basis, ['inheritLaw', 'inheritWill', 'inheritAgreement']),
    isPrivatization: basis.includes('privat'),
    isCourt: basis.includes('court'),
    isRent: basis.includes('rent'),
    isAdminLand: includesAny(basis, ['admin', 'landAct']),
    isDdu: basis.includes('ddu'),
    isOnlyExtract: basis.includes('extractOnly'),
    isUnknown: !basis.length || basis.includes('other') || basis.includes('extractOnly')
  };

  const representation = {
    model: deal.representationModel || 'unknown',
    seller: deal.sellerRepresentation || 'unknown',
    buyer: deal.buyerRepresentation || 'unknown',
    oneSpnBothSides: deal.representationModel === 'both_sides_one_spn',
    twoSpn: deal.representationModel === 'both_sides_two_spn',
    sellerOnly: deal.representationModel === 'seller_only',
    buyerOnly: deal.representationModel === 'buyer_only',
    hasExternalAgency: deal.representationModel === 'external_agency' || deal.sellerRepresentation === 'external_agency' || deal.buyerRepresentation === 'external_agency'
  };

  const needs = {
    lawyer: true,
    broker: money.hasMortgage || money.hasSber || money.hasMatcap || money.hasSocialProgram || money.hasChildMoney,
    manager: owners.hasChildren || money.hasChildMoney || money.hasAlternative || property.isCommercial || property.isShare || money.riskySettlement,
    opika: owners.hasMinorSeller || (owners.hasMinorBuyer && (money.hasMatcap || money.hasChildMoney)),
    nspd: property.needsNspd,
    mfc: true
  };

  const required = [];
  if (!deal.address) required.push('адрес объекта');
  if (!deal.cadObject) required.push('кадастровый номер объекта');
  if (property.needsLandCadastre && !deal.cadLand) required.push('кадастровый номер земли');
  if (!deal.folderLink) required.push('папка документов');
  if (!deal.stEgrn || deal.stEgrn === 'не запрошено') required.push('ЕГРН с ЭЦП');
  if (!deal.stRegistered || deal.stRegistered === 'не запрошено') required.push('справка о зарегистрированных');
  if (money.settlementUnknown) required.push('порядок расчетов');
  if (title.isUnknown) required.push('документ-основание права');
  if (owners.hasChildren && !deal.buyerSideComment && !deal.sellerSideComment) required.push('описание участия детей в сделке');
  if (money.hasMortgage && !deal.bankInfo) required.push('статус банка / Домклика / ипотеки');

  const stopReasons = [];
  if (owners.hasMinorSeller) stopReasons.push('несовершеннолетний собственник');
  if (money.hasChildMoney) stopReasons.push('детские деньги / выплаты на счетах детей');
  if (property.isShare) stopReasons.push('доля / преимущественное право / нотариус');
  if (money.riskySettlement) stopReasons.push('рискованный порядок расчетов');
  if (title.isUnknown) stopReasons.push('непонятное основание права');
  if (property.needsLandCadastre && !deal.cadLand) stopReasons.push('нет кадастрового номера земли');

  return { property, owners, money, title, representation, needs, required, stopReasons };
}

export function buildDealPassport(deal, labels = {}) {
  const schema = normalizeDeal(deal);
  const label = (id) => labels[id] || id;
  return {
    short: [
      deal.stage || 'этап не указан',
      deal.objectType || 'объект не указан',
      deal.rightForm || 'форма права не указана',
      schema.representation.model,
      (deal.payments || []).map(label).join(', ') || 'источник денег не указан',
      (deal.settlements || []).map(label).join(', ') || 'порядок расчетов не указан'
    ],
    schema
  };
}
