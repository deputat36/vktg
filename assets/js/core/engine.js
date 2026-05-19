import { goodStatus } from './utils.js';

export function matchRule(when, deal) {
  if (when.rightFormContains && !deal.rightForm.includes(when.rightFormContains)) return false;
  if (when.paymentsIncludes && !deal.payments.includes(when.paymentsIncludes)) return false;
  if (when.settlementsIncludes && !(deal.settlements || []).includes(when.settlementsIncludes)) return false;
  if (when.flagsIncludes && !deal.flags.includes(when.flagsIncludes)) return false;
  if (when.missing && deal[when.missing]) return false;
  if (when.objectTypeAny && !when.objectTypeAny.includes(deal.objectType)) return false;
  if (when.priceDiff && !(deal.priceFact && deal.priceContract && deal.priceFact !== deal.priceContract)) return false;
  return true;
}

function hasAny(list, values) {
  return values.some((value) => (list || []).includes(value));
}

export function analyzeDeal(deal, data) {
  deal.settlements = deal.settlements || [];
  let score = 0;
  const stop = [];
  const warn = [];
  const actions = [];
  const docsSeller = [
    'Паспорт продавца / всех продавцов',
    'СНИЛС продавца / всех продавцов',
    'ЕГРН по каждому объекту/доле: PDF + XML + SIG/архив с ЭЦП',
    'Справка о зарегистрированных лицах',
    'Документы-основания права'
  ];
  const docsBuyer = ['Паспорт покупателя / всех покупателей', 'СНИЛС покупателя / всех покупателей'];
  const bank = [];
  const extra = [];

  const isShare = deal.rightForm.includes('Доля') || deal.flags.includes('shareDeal');
  const isLand = /дом|участ|СНТ|зем/i.test(deal.objectType);
  const mortgage = deal.payments.includes('mortgage') || deal.payments.includes('nis');
  const sber = deal.bankType.includes('Сбер');
  const certificates = deal.certificates.length > 0 || hasAny(deal.payments, ['matcap', 'regMatcap', 'young', 'emergency', 'largeFamily', 'refugee', 'subsidy']);
  const childMoney = hasAny(deal.payments, ['nominalChild', 'svoChildAccount']) || hasAny(deal.certificates, ['nominalChild', 'svoChildAccount']);
  const directRisk = hasAny(deal.settlements, ['directBefore', 'cashReceipt']);
  const safeSettlement = hasAny(deal.settlements, ['safe', 'accreditive', 'cell', 'escrow']);
  const socialSettlement = hasAny(deal.settlements, ['pensionFund', 'municipal', 'military', 'nominalPermission']);

  for (const rule of data.rules) {
    if (matchRule(rule.when, deal)) {
      score += rule.score || 0;
      (rule.level === 'stop' ? stop : warn).push(rule.message);
    }
  }

  if (!deal.sellerPhone) warn.push('Не указан телефон продавца.');
  if (!deal.buyerPhone) warn.push('Не указан телефон покупателя.');
  if (!deal.address) warn.push('Не указан адрес объекта.');
  if (!deal.cadObject) warn.push('Не указан КН объекта.');
  if (isLand && !deal.cadLand) warn.push('Для дома/земли не указан КН участка.');
  if (!deal.folderLink) warn.push('Нет ссылки на папку документов.');
  if (!deal.basis.length) warn.push('Не выбрано основание права.');
  if (!deal.settlements.length) warn.push('Не выбран порядок расчетов. Без этого сложно безопасно настроить задаток и договор.');

  if (directRisk) {
    score += 4;
    warn.push('Выбран рискованный порядок расчетов: деньги до регистрации или наличные под расписку. Нужна отдельная фиксация условий и проверка юриста.');
  }
  if (childMoney) {
    score += 7;
    stop.push('Используются деньги с детского номинального счета / выплаты на счетах детей. Нужна отдельная проверка источника средств, разрешений и порядка перечисления до задатка.');
    docsBuyer.push('Документы по номинальному счету ребенка / подтверждение полномочий законного представителя');
    docsBuyer.push('Разрешение/документ, подтверждающий возможность использования средств ребенка, если требуется');
    actions.push('Передать юристу и менеджеру сценарий с детскими/СВО-средствами до задатка');
  }

  if (isLand) {
    docsSeller.push('ЕГРН на земельный участок');
    extra.push('Проверить НСПД: контур/границы, категория, ВРИ, подъезд, коммуникации');
  }
  if (mortgage || sber) {
    bank.push('Одобрение ипотеки', 'Отчет об оценке', 'ЕГРН с ЭЦП', 'Требования банка к объекту и договору');
    docsBuyer.push('Ипотечное одобрение / параметры кредита');
  }
  if (deal.payments.includes('matcap') || deal.certificates.includes('matcap')) {
    docsBuyer.push('Сертификат материнского капитала и справка/сведения об остатке');
    bank.push('Проверить требования СФР к объекту, долям и порядку перечисления');
    actions.push('Уточнить остаток маткапитала и порядок перечисления СФР');
  }
  if (deal.payments.includes('regMatcap') || deal.certificates.includes('regMatcap')) docsBuyer.push('Региональный материнский капитал: сертификат, остаток, условия программы');
  if (deal.payments.includes('young') || deal.certificates.includes('young')) docsBuyer.push('Сертификат Молодая семья и условия перечисления');
  if (deal.payments.includes('emergency') || deal.certificates.includes('emergency')) docsBuyer.push('Сертификат переселения из аварийного жилья и условия программы');
  if (deal.payments.includes('nis') || deal.certificates.includes('nis')) {
    docsBuyer.push('Свидетельство НИС и сведения по накоплениям');
    bank.push('Проверить порядок расчетов через НИС / Росвоенипотеку');
  }
  if (deal.payments.includes('largeFamily') || deal.certificates.includes('largeFamily')) docsBuyer.push('Сертификат многодетной семьи и условия программы');
  if (deal.payments.includes('refugee') || deal.certificates.includes('refugee')) docsBuyer.push('Сертификат беженцев / переселенцев и условия программы');

  if (safeSettlement) extra.push('Зафиксировать выбранный безопасный порядок расчетов: СБР/аккредитив/ячейка/эскроу');
  if (socialSettlement) extra.push('Зафиксировать сроки и орган перечисления средств по сертификату/СФР/НИС/номинальному счету');
  if (deal.included) extra.push('Остается: ' + deal.included);
  if (deal.releaseInfo) extra.push('Освобождение/ключи: ' + deal.releaseInfo);

  if (!deal.folderLink) actions.push('Создать папку Яндекс Диска и вставить ссылку');
  if (!goodStatus(deal.stEgrn)) actions.push('Запросить ЕГРН: PDF + XML + SIG/архив');
  if (!goodStatus(deal.stRegistered)) actions.push('Запросить справку о зарегистрированных');
  if (isLand && !deal.cadLand) actions.push('Указать КН земли и проверить НСПД');
  if ((mortgage || sber) && !deal.bankInfo) actions.push('Уточнить банк, программу и требования к объекту');
  if (isShare) actions.push('Уточнить долевиков, ППП и нотариальную форму');
  if (!deal.settlements.length) actions.push('Выбрать порядок расчетов: СБР, аккредитив, перевод после регистрации, СФР/сертификат и т.д.');
  if (!actions.length) actions.push('Передать юристу карточку и папку документов');

  const missing = [
    !deal.sellerPhone && 'телефон продавца',
    !deal.buyerPhone && 'телефон покупателя',
    !deal.address && 'адрес',
    !deal.cadObject && 'КН объекта',
    isLand && !deal.cadLand && 'КН земли',
    !deal.folderLink && 'папка документов',
    !goodStatus(deal.stEgrn) && 'ЕГРН с ЭЦП',
    !goodStatus(deal.stRegistered) && 'справка о зарегистрированных',
    !deal.settlements.length && 'порядок расчетов'
  ].filter(Boolean);

  let ready = Math.max(0, Math.round((1 - missing.length / 9) * 100));
  if (stop.length) ready = Math.min(ready, 45);

  const decision = stop.length
    ? 'Задаток не брать до устранения стоп-факторов.'
    : (score >= 6 || warn.length
      ? 'Задаток только после проверки недостающих данных и согласования с юристом.'
      : 'Можно готовиться к задатку после стандартной проверки юриста.');
  const cls = stop.length ? 'red' : (score >= 6 || warn.length ? 'orange' : 'green');

  const to = [];
  if (stop.length || score >= 6) to.push('юрист');
  if (mortgage || sber) to.push('ипотечный брокер / банк');
  if (score >= 10 || stop.length >= 2 || childMoney) to.push('менеджер');
  if (deal.flags.includes('minorSeller')) to.push('опека');
  if (certificates) to.push('СФР / орган программы');
  if (!to.length) to.push('юрист на стандартную проверку');

  return { deal, score, stop, warn, actions, docsSeller, docsBuyer, bank, extra, missing, ready, decision, cls, to, isShare, isLand, mortgage, sber, certificates, childMoney, safeSettlement, socialSettlement };
}