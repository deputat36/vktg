import { goodStatus } from './utils.js';
import { normalizeDeal } from './dealSchema.js';

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

function pushUnique(list, item) {
  if (item && !list.includes(item)) list.push(item);
}

function pushMany(list, items = []) {
  items.forEach((item) => pushUnique(list, item));
}

export function analyzeDeal(deal, data) {
  deal.settlements = deal.settlements || [];
  deal.payments = deal.payments || [];
  deal.certificates = deal.certificates || [];
  deal.flags = deal.flags || [];
  deal.basis = deal.basis || [];

  const schema = normalizeDeal(deal);
  const { property, owners, money, title, representation, needs } = schema;

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

  for (const rule of data.rules) {
    if (matchRule(rule.when, deal)) {
      score += rule.score || 0;
      pushUnique(rule.level === 'stop' ? stop : warn, rule.message);
    }
  }

  if (!deal.sellerPhone) pushUnique(warn, 'Не указан телефон продавца.');
  if (!deal.buyerPhone) pushUnique(warn, 'Не указан телефон покупателя.');
  if (!deal.address) pushUnique(warn, 'Не указан адрес объекта.');
  if (!deal.cadObject) pushUnique(warn, 'Не указан КН объекта.');
  if (property.needsLandCadastre && !deal.cadLand) pushUnique(warn, 'Для дома/земли не указан КН участка.');
  if (!deal.folderLink) pushUnique(warn, 'Нет ссылки на папку документов.');
  if (!deal.basis.length) pushUnique(warn, 'Не выбрано основание права.');
  if (money.settlementUnknown) pushUnique(warn, 'Не выбран порядок расчетов. Без этого сложно безопасно настроить задаток и договор.');

  if (title.isUnknown) {
    score += 4;
    pushUnique(stop, 'Неясное основание права: до задатка нужно увидеть документ-основание, а не только слова клиента.');
    pushUnique(actions, 'Запросить документ-основание права и загрузить в папку документов');
  }
  if (title.isInheritance) {
    score += 3;
    pushUnique(warn, 'Наследство: проверить срок владения, круг наследников, возможные споры и основание регистрации.');
    pushUnique(docsSeller, 'Свидетельство о праве на наследство / документы по наследственному делу');
  }
  if (title.isPrivatization) {
    score += 3;
    pushUnique(warn, 'Приватизация: проверить отказников, зарегистрированных и лиц с возможным сохраненным правом пользования.');
    pushUnique(docsSeller, 'Договор приватизации / договор передачи в собственность');
    pushUnique(docsSeller, 'Сведения об участниках приватизации и отказниках, если применимо');
  }
  if (title.isCourt) {
    score += 3;
    pushUnique(warn, 'Право по решению суда: проверить вступление решения в силу и соответствие ЕГРН.');
    pushUnique(docsSeller, 'Решение суда с отметкой о вступлении в законную силу');
  }
  if (title.isRent) {
    score += 4;
    pushUnique(stop, 'Рента / пожизненное содержание: до задатка нужна юридическая проверка обязательств и прекращения/сохранения обременений.');
    pushUnique(docsSeller, 'Договор ренты / пожизненного содержания и сведения об исполнении обязательств');
  }

  if (property.needsLandCadastre) {
    pushUnique(docsSeller, 'ЕГРН на земельный участок');
    pushUnique(extra, 'Проверить НСПД: контур/границы, категория, ВРИ, подъезд, коммуникации');
    if (!deal.cadLand) {
      score += 3;
      pushUnique(stop, 'Дом/участок/СНТ без кадастрового номера земли: нельзя уверенно готовить задаток и ипотеку.');
    }
  }
  if (property.isShare) {
    score += 4;
    pushUnique(stop, 'Доля / часть объекта: проверить нотариальную форму, преимущественное право покупки и возможность ипотеки.');
    pushUnique(actions, 'Уточнить долевиков, ППП, нотариальную форму и порядок уведомлений');
  }
  if (property.isPrivateSectorFlat && money.hasMortgage) {
    score += 4;
    pushUnique(stop, 'Квартира в частном секторе с ипотекой/сертификатом: сначала проверка банка и юриста.');
  }
  if (property.isCommercial) {
    score += 4;
    pushUnique(warn, 'Нежилой/коммерческий объект: нужен отдельный порядок проверки, налогообложения, расчетов и полномочий сторон.');
    pushUnique(actions, 'Передать менеджеру и юристу как нестандартный объект');
  }

  if (owners.hasMinorSeller) {
    score += 8;
    pushUnique(stop, 'Несовершеннолетний собственник: до задатка нужен разбор юриста и, вероятно, разрешение опеки.');
    pushMany(docsSeller, ['Свидетельство о рождении ребенка / паспорт ребенка от 14 лет', 'Паспорт законного представителя', 'Документы, подтверждающие полномочия законного представителя', 'Разрешение органов опеки, если требуется']);
    pushUnique(actions, 'Передать юристу сценарий с несовершеннолетним собственником до задатка');
  }
  if (owners.hasMinorBuyer) {
    score += 4;
    pushUnique(warn, 'Несовершеннолетний покупатель / выделение долей детям: нужно заранее определить доли, представителей и документы ребенка.');
    pushMany(docsBuyer, ['Свидетельство о рождении ребенка / паспорт ребенка от 14 лет', 'Паспорт законного представителя', 'СНИЛС ребенка при наличии/требовании банка или программы']);
  }
  if (owners.hasMinorRegistered) {
    score += 3;
    pushUnique(warn, 'Есть зарегистрированные дети или состав зарегистрированных неясен: проверить справку и порядок снятия с учета до задатка.');
    pushUnique(docsSeller, 'Справка о зарегистрированных / сведения о составе зарегистрированных лиц');
  }
  if (owners.hasSpouse) {
    pushUnique(docsSeller, 'Свидетельство о браке / брачный договор / согласие супруга, если требуется');
    pushUnique(warn, 'Супруг/совместное имущество: проверить режим собственности и необходимость согласия.');
  }
  if (owners.hasPowerOfAttorney) {
    score += 3;
    pushUnique(warn, 'Доверенность: проверить полномочия на продажу, подписание, получение денег и срок действия.');
    pushUnique(docsSeller, 'Нотариальная доверенность и паспорт представителя');
  }
  if (owners.hasPrivatizationRefusers) {
    score += 5;
    pushUnique(stop, 'Отказники от приватизации: высокий риск сохраненного права пользования. Нужна проверка юриста до задатка.');
  }

  if (money.hasMortgage) {
    pushMany(bank, ['Одобрение ипотеки', 'Отчет об оценке', 'ЕГРН с ЭЦП', 'Требования банка к объекту и договору']);
    pushUnique(docsBuyer, 'Ипотечное одобрение / параметры кредита');
    if (!deal.bankInfo) pushUnique(actions, 'Уточнить банк, программу, Домклик/личный кабинет и требования к объекту');
  }
  if (money.hasMatcap) {
    score += 4;
    pushUnique(warn, 'Материнский капитал: проверить остаток, требования СФР, порядок перечисления и выделение долей детям.');
    pushMany(docsBuyer, ['Сертификат материнского капитала / сведения о праве', 'Справка/сведения об остатке материнского капитала', 'Свидетельства о рождении детей', 'Документы родителей/законных представителей']);
    pushUnique(bank, 'Проверить требования СФР к объекту, долям и порядку перечисления');
    pushUnique(actions, 'Уточнить остаток маткапитала и порядок перечисления СФР');
  }
  if (money.hasRegionalMatcap) pushMany(docsBuyer, ['Региональный материнский капитал: сертификат/уведомление, остаток, условия программы', 'Документы детей и законных представителей']);
  if (money.hasSocialProgram) pushMany(docsBuyer, ['Сертификат/субсидия по программе', 'Условия программы и сроки перечисления', 'Реквизиты и требования органа, перечисляющего средства']);
  if (deal.payments.includes('nis') || deal.certificates.includes('nis')) {
    pushMany(docsBuyer, ['Свидетельство НИС', 'Сведения по накоплениям / параметры военной ипотеки']);
    pushUnique(bank, 'Проверить порядок расчетов через НИС / Росвоенипотеку');
  }
  if (money.hasChildMoney) {
    score += 8;
    pushUnique(stop, 'Деньги с детского номинального счета / выплаты на счетах детей: до задатка нужна отдельная проверка источника, разрешений и порядка перечисления.');
    pushMany(docsBuyer, ['Документы по номинальному счету ребенка', 'Документ, подтверждающий источник средств ребенка', 'Разрешение/согласие на использование средств ребенка, если требуется', 'Документы законного представителя']);
    pushUnique(actions, 'Передать юристу и менеджеру сценарий с детскими/СВО-средствами до задатка');
  }
  if (money.hasSellerMortgageClose) {
    score += 4;
    pushUnique(stop, 'Ипотека продавца: нельзя проводить расчеты без понятного механизма погашения и снятия обременения.');
    pushUnique(docsSeller, 'Справка банка об остатке задолженности / условия снятия обременения');
  }
  if (money.hasInstallment) {
    score += 4;
    pushUnique(warn, 'Рассрочка/постоплата: нужна отдельная юридическая фиксация сроков, обеспечения и последствий нарушения.');
  }

  if (money.riskySettlement) {
    score += 5;
    pushUnique(warn, 'Выбран рискованный порядок расчетов: деньги до регистрации или наличные под расписку. Нужна отдельная фиксация условий и проверка юриста.');
  }
  if (money.safeSettlement) pushUnique(extra, 'Зафиксировать выбранный безопасный порядок расчетов: СБР/аккредитив/ячейка/эскроу');
  if (money.publicSettlement) pushUnique(extra, 'Зафиксировать сроки и орган перечисления средств по сертификату/СФР/НИС/номинальному счету');
  if (money.settlementUnknown) pushUnique(actions, 'Выбрать порядок расчетов: СБР, аккредитив, перевод после регистрации, СФР/сертификат и т.д.');

  if (representation.hasExternalAgency) pushUnique(actions, 'Зафиксировать контакт другого агентства и кто отвечает за документы второй стороны');
  if (representation.twoSpn) pushUnique(actions, 'Договориться, кто из двух СПН собирает документы, кто готовит задаток и кто передает карточку юристу');
  if (representation.oneSpnBothSides) pushUnique(warn, 'Один СПН ведет обе стороны: особенно четко фиксируйте условия, сроки и расходы, чтобы не было конфликта ожиданий.');

  if (deal.included) pushUnique(extra, 'Остается: ' + deal.included);
  if (deal.releaseInfo) pushUnique(extra, 'Освобождение/ключи: ' + deal.releaseInfo);
  if (!deal.folderLink) pushUnique(actions, 'Создать папку Яндекс Диска и вставить ссылку');
  if (!goodStatus(deal.stEgrn)) pushUnique(actions, 'Запросить ЕГРН: PDF + XML + SIG/архив');
  if (!goodStatus(deal.stRegistered)) pushUnique(actions, 'Запросить справку о зарегистрированных');
  if (property.needsLandCadastre && !deal.cadLand) pushUnique(actions, 'Указать КН земли и проверить НСПД');
  if (!actions.length) pushUnique(actions, 'Передать юристу карточку и папку документов');

  const missing = schema.required;

  let ready = Math.max(0, Math.round((1 - missing.length / 10) * 100));
  if (stop.length) ready = Math.min(ready, 45);

  const decision = stop.length
    ? 'Задаток не брать до устранения стоп-факторов.'
    : (score >= 6 || warn.length
      ? 'Задаток только после проверки недостающих данных и согласования с юристом.'
      : 'Можно готовиться к задатку после стандартной проверки юриста.');
  const cls = stop.length ? 'red' : (score >= 6 || warn.length ? 'orange' : 'green');

  const to = [];
  if (needs.lawyer && (stop.length || score >= 6 || warn.length)) pushUnique(to, 'юрист');
  if (needs.broker) pushUnique(to, 'ипотечный брокер / банк');
  if (needs.manager) pushUnique(to, 'менеджер');
  if (needs.opika) pushUnique(to, 'опека');
  if (money.hasMatcap || money.hasSocialProgram) pushUnique(to, 'СФР / орган программы');
  if (!to.length) pushUnique(to, 'юрист на стандартную проверку');

  return { deal, schema, score, stop, warn, actions, docsSeller, docsBuyer, bank, extra, missing, ready, decision, cls, to, isShare: property.isShare, isLand: property.needsLandCadastre, mortgage: money.hasMortgage, sber: money.hasSber, certificates: money.hasMatcap || money.hasSocialProgram, childMoney: money.hasChildMoney, safeSettlement: money.safeSettlement, socialSettlement: money.publicSettlement };
}
