// Pure scenario model. No runtime dependency on Navigator v2 or its work plan.
export const VALUES = ['yes', 'no', 'unknown', 'not_applicable'];
export const SOURCES = ['document', 'client', 'unchecked'];
const ID = /^[a-z][a-z0-9_]{0,63}$/;
const unique = (items) => [...new Set(items)];
const entry = (items, id) => items.find((item) => item.id === id);
const label = (items, id) => entry(items, id)?.title || 'Не указано';
export const emptyState = () => ({ mode: '', object: 'unknown', funding: ['unknown'], features: [], facts: {}, available: [], urgency: 'normal', coordination: 'unknown' });

export function normalizeFact(raw) {
  const value = VALUES.includes(raw?.value) ? raw.value : 'unknown';
  return { value, source: ['yes', 'no'].includes(value) && SOURCES.includes(raw?.source) ? raw.source : 'unchecked' };
}

export function matches(state, condition = {}) {
  if (condition.objects && !condition.objects.includes(state.object)) return false;
  if (condition.modes && !condition.modes.includes(state.mode)) return false;
  if (condition.funding && !condition.funding.some((id) => state.funding.includes(id))) return false;
  if (condition.features && !condition.features.some((id) => state.features.includes(id))) return false;
  return true;
}

export function activeQuestions(state, catalog) {
  return catalog.questions.filter((question) => matches(state, question.when) && (state.mode !== 'question' || question.group !== 'core')).map((question) => {
    const variant = question.variants?.find((item) => matches(state,item.when));
    return variant ? { ...question, ...variant, id:question.id } : question;
  });
}

export function normalizeState(input, catalog) {
  const state = emptyState();
  for (const [key, options] of [['mode', catalog.modes], ['object', catalog.objects], ['urgency', catalog.urgencies], ['coordination', catalog.coordination]]) {
    if (entry(options, input?.[key])) state[key] = input[key];
  }
  for (const key of ['funding', 'features']) {
    state[key] = unique((Array.isArray(input?.[key]) ? input[key] : state[key]).filter((id) => entry(catalog[key], id)));
  }
  if (!state.funding.length) state.funding = ['unknown'];
  if (state.funding.length > 1) state.funding = state.funding.filter((id) => id !== 'unknown');
  state.features = state.features.filter((id) => matches(state, entry(catalog.features,id)?.when));
  for (const question of activeQuestions(state, catalog)) state.facts[question.id] = normalizeFact(input?.facts?.[question.id]);
  state.available = unique((Array.isArray(input?.available) ? input.available : []).filter((id) => entry(catalog.documents, id)));
  return state;
}

export function validateCatalog(catalog) {
  const errors = [];
  if (!catalog || catalog.schema_version !== 1) return ['Не поддерживается версия каталога.'];
  if (!/^\d+\.\d+\.\d+$/.test(catalog.version || '')) errors.push('Нужна версия x.y.z.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(catalog.reviewed_at || '')) errors.push('Нужна дата проверки каталога.');
  for (const key of ['modes','objects','funding','features','urgencies','coordination','questions','documents','rules','sources']) {
    if (!Array.isArray(catalog[key]) || !catalog[key].length) { errors.push(`Пустой раздел ${key}.`); continue; }
    const ids = new Set();
    for (const item of catalog[key]) {
      if (!ID.test(item.id || '') || ids.has(item.id)) errors.push(`Неверный или повторный ID в ${key}.`);
      ids.add(item.id);
      if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 500) errors.push(`Нужно короткое название ${key}/${item.id}.`);
    }
  }
  if (errors.length) return errors;
  const has = (key, id) => Boolean(entry(catalog[key], id));
  const checkWhen = (when = {}) => {
    if (!when || typeof when !== 'object' || Array.isArray(when)) { errors.push('Неверное условие показа.'); return; }
    for (const [key, allowed] of Object.entries(when)) {
      const section = {objects:'objects',modes:'modes',funding:'funding',features:'features'}[key];
      if (!section || !Array.isArray(allowed) || !allowed.length || allowed.some((id) => !has(section, id))) errors.push('Условие ссылается на неизвестный вариант.');
    }
  };
  for (const question of catalog.questions) {
    checkWhen(question.when);
    if (question.variants !== undefined) {
      if (!Array.isArray(question.variants)) errors.push(`Неверные варианты ${question.id}.`);
      else for (const variant of question.variants) {
        if (!variant || typeof variant !== 'object' || Array.isArray(variant)) { errors.push(`Неверный вариант ${question.id}.`); continue; }
        checkWhen(variant.when);
        if (!variant.when || Object.keys(variant).some((key) => !['when','title','short','why','clarify','verify','attention_next'].includes(key))) errors.push(`Неверный вариант ${question.id}.`);
        for (const key of ['title','short','why','clarify']) if (typeof variant[key] !== 'string' || !variant[key].trim()) errors.push(`Не заполнен вариант ${question.id}/${key}.`);
        for (const key of ['attention_next','verify']) if (variant[key] !== undefined && (typeof variant[key] !== 'string' || !variant[key].trim())) errors.push(`Не заполнен вариант ${question.id}/${key}.`);
      }
    }
    if (question.group && !['core','context','topic'].includes(question.group)) errors.push(`Неверная группа ${question.id}.`);
    if (question.priority !== undefined && (!Number.isFinite(question.priority) || question.priority < 0 || question.priority > 100)) errors.push(`Неверный приоритет ${question.id}.`);
    for (const key of ['attention_next','verify']) if (question[key] !== undefined && (typeof question[key] !== 'string' || !question[key].trim())) errors.push(`Не заполнено ${question.id}/${key}.`);
    if (!['yes','no'].includes(question.attention)) errors.push(`Неверное направление проверки ${question.id}.`);
    for (const key of ['why','clarify']) if (typeof question[key] !== 'string' || !question[key].trim()) errors.push(`Не заполнено ${question.id}/${key}.`);
  }
  for (const document of catalog.documents) {
    for (const key of ['why','from','stage','review']) if (typeof document[key] !== 'string' || !document[key].trim()) errors.push(`Не заполнено ${document.id}/${key}.`);
  }
  for (const rule of catalog.rules) {
    checkWhen(rule.when);
    if (rule.preparation_only !== undefined && typeof rule.preparation_only !== 'boolean') errors.push(`Неверная область применения ${rule.id}.`);
    if (rule.fact && !has('questions', rule.fact)) errors.push(`Неизвестный вопрос ${rule.id}.`);
    if (rule.fact && (!Array.isArray(rule.values) || !rule.values.length || rule.values.some((value) => !VALUES.includes(value)))) errors.push(`Неверные ответы правила ${rule.id}.`);
    if (!['lawyer','broker','spn','program'].includes(rule.owner)) errors.push(`Неизвестный адресат ${rule.id}.`);
    if (!['organization','legal_question','bank_question','internal_required'].includes(rule.kind)) errors.push(`Неизвестный тип ${rule.id}.`);
    if (!['draft','reviewed','approved'].includes(rule.approval)) errors.push(`Неверное согласование ${rule.id}.`);
    if (rule.kind === 'internal_required' && (rule.approval !== 'approved' || !rule.approved_by)) errors.push(`Неутверждённое обязательное правило ${rule.id}.`);
    if (!rule.approver_role || !rule.version || !/^\d{4}-\d{2}-\d{2}$/.test(rule.checked_at || '')) errors.push(`Нет метаданных проверки ${rule.id}.`);
    if (!Array.isArray(rule.sources) || !rule.sources.length || rule.sources.some((id) => !has('sources', id))) errors.push(`Нет источника ${rule.id}.`);
    if (!Array.isArray(rule.documents) || rule.documents.some((id) => !has('documents', id))) errors.push(`Неизвестный документ ${rule.id}.`);
    for (const key of ['question','next','signal']) if (typeof rule[key] !== 'string' || !rule[key].trim()) errors.push(`Не заполнено ${rule.id}/${key}.`);
    // A certificate alone must never create an implicit bank route.
    if (rule.owner === 'broker') {
      const funds = rule.when?.funding || [];
      const features = rule.when?.features || [];
      const mortgageOnly = funds.length && funds.every((id) => ['mortgage','family_mortgage'].includes(id));
      const bankOnly = features.length && features.every((id) => ['seller_mortgage','bank_question'].includes(id));
      if (!mortgageOnly && !bankOnly) errors.push(`Брокер без кредитного/банковского основания ${rule.id}.`);
    }
  }
  for (const source of catalog.sources) {
    if (source.url && !/^https:\/\//.test(source.url)) errors.push(`Небезопасная ссылка ${source.id}.`);
    if (!['reference','draft','checked_public'].includes(source.status)) errors.push(`Неизвестный статус источника ${source.id}.`);
  }
  return unique(errors);
}

export function assess(input, catalog) {
  const state = normalizeState(input, catalog);
  const focused = state.mode === 'question';
  const questions = activeQuestions(state, catalog);
  const facts = { document: [], client: [], unchecked: [], unknown: [], not_applicable: [] };
  const clarify = [];
  for (const question of questions) {
    const fact = state.facts[question.id];
    const item = { ...question, ...fact };
    if (fact.value === 'unknown') facts.unknown.push(item);
    else if (fact.value === 'not_applicable') facts.not_applicable.push(item);
    else facts[fact.source].push(item);
    let reason;
    if (fact.value === 'unknown') reason = 'unknown';
    else if (fact.value === question.attention) reason = 'attention';
    else if (fact.source === 'unchecked' && fact.value !== 'not_applicable') reason = 'source';
    if (reason) clarify.push({ ...item, reason, clarify: reason === 'attention' ? (question.attention_next || question.clarify) : reason === 'source' ? (question.verify || `Уточните источник ответа: «${question.title}»`) : question.clarify });
  }
  clarify.sort((a,b) => (b.priority || 0) - (a.priority || 0));
  const active = catalog.rules.filter((rule) => {
    if (!matches(state, rule.when)) return false;
    if (focused && rule.preparation_only) return false;
    if (rule.kind === 'internal_required' && rule.approval !== 'approved') return false;
    if (!rule.fact) return true;
    return Boolean(state.facts[rule.fact]) && rule.values.includes(state.facts[rule.fact].value);
  }).sort((a,b) => (b.priority || 0) - (a.priority || 0));
  const documents = unique(active.flatMap((rule) => rule.documents)).map((id) => entry(catalog.documents,id));
  state.available = state.available.filter((id) => documents.some((document) => document.id === id));
  const documentGroups = {
    available: documents.filter((document) => state.available.includes(document.id)),
    unmarked: documents.filter((document) => !state.available.includes(document.id))
  };
  const lawyer = unique(active.filter((rule) => rule.owner === 'lawyer').map((rule) => rule.question));
  const broker = unique(active.filter((rule) => rule.owner === 'broker').map((rule) => rule.question));
  const program = unique(active.filter((rule) => rule.owner === 'program').map((rule) => rule.question));
  const relevantFeatures = catalog.features.filter((feature) => matches(state, feature.when));
  const unreviewed = relevantFeatures.filter((feature) => !state.features.includes(feature.id));
  const signals = unique(active.filter((rule) => rule.fact || rule.priority >= 80).map((rule) => state.facts[rule.fact]?.value === 'unknown' ? `Пока не подтверждено: ${rule.title.toLowerCase()}. ${entry(questions,rule.fact)?.clarify || rule.signal}` : rule.signal));
  const priorityRule = active.find((rule) => rule.priority >= 90);
  let next = priorityRule && (state.facts[priorityRule.fact]?.value === 'unknown' ? entry(questions,priorityRule.fact)?.clarify : priorityRule.next);
  if (!next && !focused && state.object === 'unknown') next = 'Определить тип объекта по документам; если документов пока нет, уточнить его у сопровождающего СПН.';
  if (!next && !focused && state.funding.includes('unknown')) next = 'Уточните у покупателя источники оплаты и зависимость от другой продажи.';
  if (!next && clarify.length) next = clarify[0].clarify;
  if (!next && focused) next = active[0]?.next || (questions.length ? 'Перепроверьте выбранную тему. Если отдельного вопроса нет, перейдите к подготовке задатка или сделки.' : 'Выберите тему вопроса на шаге «Ситуация». При необходимости уточните тип объекта или оплату.');
  if (!next) next = 'Передайте юристу вводные и доступные в CRM документы; получите ответ о следующем действии и зафиксируйте его в CRM.';
  return { state, focused, scopeNote: focused ? focusNote : '', questions, facts, clarify, active, documents, documentGroups, lawyer, broker, program, unreviewed, signals, next, version: catalog.version };
}

const focusNote = 'План только по выбранным темам, типу объекта и оплате. Остальные обстоятельства сделки здесь не проверялись.';
export function buildPlan(result, catalog) {
  const clarifications = unique(result.clarify.map((item) => item.clarify)).filter((text) => text !== result.next);
  return [
    `План подготовки · ${label(catalog.modes,result.state.mode)} · ${label(catalog.objects,result.state.object)}.`,
    result.focused ? focusNote : '',
    `Сейчас: ${result.next}`,
    ...clarifications.map((text) => `• ${text}`),
    result.documents.length ? 'Документы-ориентиры:' : '',
    result.documentGroups.available.length ? `Есть в CRM (по отметке СПН): ${result.documentGroups.available.map((item) => item.title).join('; ')}.` : '',
    result.documentGroups.unmarked.length ? `Наличие в CRM не отмечено: ${result.documentGroups.unmarked.map((item) => item.title).join('; ')}.` : '',
    result.documents.length ? 'Уточните состав пакета у специалиста. Наличие не означает проверку.' : '',
    result.lawyer.length ? `Юристу: ${result.lawyer.join('; ')}` : '',
    result.broker.length ? `Брокеру / банку: ${result.broker.join('; ')}` : '',
    result.program.length ? `Оператору программы: ${result.program.join('; ')}` : '',
    !result.focused && result.unreviewed.length ? 'Неотмеченные особенности не проверены; отсутствие отметки не означает отсутствие обстоятельства.' : '',
    `Каталог рекомендаций ${catalog.version} · ${catalog.reviewed_at}.`,
    'Документы, ответ специалиста и следующие действия — в CRM. Это план подготовки, а не юридическое решение.'
  ].filter(Boolean).join('\n');
}

const compactList = (items, fallback) => items.length ? items.join('; ') : fallback;
export function buildSummary(result, catalog, audience = 'lawyer') {
  const { state, facts } = result;
  const factText = (item) => `${item.short || item.title}: ${item.value === 'yes' ? 'да' : 'нет'}`;
  const questions = audience === 'broker' ? result.broker : result.lawyer;
  return [
    `${audience === 'broker' ? 'Вопрос брокеру / банку' : 'Вопрос юристу'} · ${label(catalog.modes,state.mode)}.`,
    result.focused ? focusNote : '',
    `Объект: ${label(catalog.objects,state.object)}. Оплата: ${state.funding.map((id) => label(catalog.funding,id)).join(', ')}.`,
    state.features.length ? `Выбраны темы для проверки (не подтверждение фактов): ${state.features.map((id) => label(catalog.features,id)).join(', ')}.` : '',
    `По документам (без юридического вывода): ${compactList(facts.document.map(factText),'не отмечено')}.`,
    `Со слов клиента: ${compactList(facts.client.map(factText),'не отмечено')}.`,
    `Источник не указан: ${compactList(facts.unchecked.map(factText),'нет таких ответов')}.`,
    `Неизвестно: ${compactList(facts.unknown.map((item) => item.short || item.title),'в показанных вопросах неизвестного не осталось')}.`,
    !result.focused && result.unreviewed.length ? `Отдельно не проверялись: ${result.unreviewed.map((item) => item.title).join(', ')}.` : '',
    facts.not_applicable.length ? `Отмечено «не относится» (применимость не проверена): ${facts.not_applicable.map((item) => item.short || item.title).join(', ')}.` : '',
    `Доступны в CRM: ${compactList(state.available.map((id) => label(catalog.documents,id)),'наличие документов не отмечено')}. Получение не означает профессиональную проверку.`,
    `Прошу уточнить: ${compactList(questions,'какие сведения и документы ещё нужны до следующего действия')}.`,
    `Следующий шаг: ${result.next}`,
    result.program.length && audience === 'lawyer' ? `У оператора программы: ${result.program.join('; ')}.` : '',
    state.coordination === 'two_spn' ? 'Разные СПН: согласовать единый набор вводных и кто вернёт ответ сторонам.' : '',
    `Ответ нужен: ${state.urgency === 'urgent' ? 'срочно; реальный срок согласовать до подписания' : state.mode === 'deal' ? 'до подписания основной сделки' : state.mode === 'deposit' ? 'до подписания и передачи денег' : 'до следующего действия'}.`,
    'Код карточки, точный срок и ссылки на документы добавлю в разрешённом рабочем канале. Ответ и следующий шаг зафиксирую в CRM.',
    `Сводка подготовки · версия ${catalog.version} · ${catalog.reviewed_at}. Сводка не является юридическим решением.`
  ].filter(Boolean).join('\n');
}
