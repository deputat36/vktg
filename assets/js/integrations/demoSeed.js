import { getSupabaseClient, getCurrentUser, ensureNavigatorProfile } from './supabase.js';

const DEALS_TABLE = 'nav_deals';
const TASKS_TABLE = 'nav_deal_tasks';
const REVIEWS_TABLE = 'nav_deal_reviews';
const EVENTS_TABLE = 'nav_deal_events';
const PARTICIPANTS_TABLE = 'nav_deal_participants';
const PROFILES_TABLE = 'nav_profiles';

const scenarios = [
  ['Обычная квартира, безопасный расчет', 'ready_for_deposit', 'Квартира', 'Демо-адрес: обычная квартира', '3 650 000', 'Можно готовить задаток', 92, 78, false, false, { payments:['cash'], basis:['sale'], flags:[], settlements:['accreditive'], sellerCount:'1', buyerCount:'1' }, { stop:[], warnings:[], required:[] }],
  ['Квартира с ипотекой', 'mortgage_review', 'Квартира', 'Демо-адрес: ипотечная квартира', '4 250 000', 'Банк / ипотека', 68, 45, true, true, { payments:['mortgage'], bankType:'Банк', basis:['sale'], flags:[], settlements:['safe'], sellerCount:'1', buyerCount:'2' }, { stop:[], warnings:['Нужна оценка','Проверить условия банка'], required:['Одобрение ипотеки','Отчет об оценке'] }],
  ['Маткапитал, нужна проверка долей', 'needs_lawyer', 'Дом + земля', 'Демо-адрес: дом с использованием маткапитала', '2 900 000', 'Юрист обязательно', 45, 20, true, true, { payments:['matcap','cash'], certificates:['matcap'], basis:['sale'], flags:['minorBuyer'], settlements:['pensionFund'], sellerCount:'2', buyerCount:'2' }, { stop:[], warnings:['Материнский капитал','Проверить обязательство о выделении долей'], required:['Сертификат маткапитала','Документы детей','Реквизиты СФР'] }],
  ['Несовершеннолетний собственник', 'lawyer_review', 'Квартира', 'Демо-адрес: квартира с ребенком-собственником', '3 850 000', 'Дети / опека', 36, 15, false, true, { payments:['cash'], basis:['privat'], flags:['minorSeller'], settlements:['accreditive'], sellerCount:'3', buyerCount:'1', rightForm:'Долевая собственность' }, { stop:['Без разрешения опеки нельзя выходить на задаток'], warnings:['Несовершеннолетний собственник','Нотариальная форма вероятна'], required:['Разрешение опеки','Документы ребенка','Документы на встречное жилье'] }],
  ['Детские деньги / номинальный счет', 'needs_documents', 'Квартира', 'Демо-адрес: покупка с детскими средствами', '4 600 000', 'Детские деньги / банк', 52, 22, true, true, { payments:['svoChildAccount','cash'], certificates:['svoChildAccount'], basis:['sale'], flags:['minorBuyer'], settlements:['safe'], sellerCount:'1', buyerCount:'2' }, { stop:['Нельзя обещать задаток без подтверждения порядка использования детских средств'], warnings:['Номинальный счет ребенка'], required:['Документы по счету','Документы ребенка'] }],
  ['Дом + земля, межевание не готово', 'needs_documents', 'Дом + земельный участок', 'Демо-адрес: дом и участок', '3 300 000', 'Нужны документы по земле', 58, 30, false, true, { payments:['cash'], basis:['sale'], flags:['landBoundaryMissing'], settlements:['cash_after_registration'], sellerCount:'1', buyerCount:'1' }, { stop:[], warnings:['Проверить межевание','Проверить ВРИ','Проверить дом и землю отдельно'], required:['ЕГРН на дом','ЕГРН на землю','Межевание'] }],
  ['Доля в квартире, нотариальная сделка', 'lawyer_review', 'Доля', 'Демо-адрес: доля в квартире', '1 450 000', 'Доля / нотариус', 40, 18, false, true, { payments:['cash'], basis:['gift','sale'], flags:['shareSale'], settlements:['notary_deposit'], sellerCount:'1', buyerCount:'1', rightForm:'Долевая собственность' }, { stop:[], warnings:['Доля','Преимущественное право покупки','Нотариальная форма'], required:['Отказы/уведомления сособственников','Нотариус','ЕГРН'] }],
  ['Наследство менее 3 лет', 'needs_lawyer', 'Квартира', 'Демо-адрес: наследственная квартира', '2 700 000', 'Наследство / риск оспаривания', 50, 25, false, true, { payments:['cash'], basis:['inheritLaw'], flags:['recentInheritance'], settlements:['accreditive'], sellerCount:'1', buyerCount:'1' }, { stop:[], warnings:['Наследство менее 3 лет','Проверить круг наследников'], required:['Свидетельство о наследстве','ЕГРН','Справка о зарегистрированных'] }],
  ['Покупатель от другого агентства', 'ready_for_deal', 'Квартира', 'Демо-адрес: покупатель от партнера', '3 100 000', 'Готово к сделке', 88, 82, false, false, { payments:['cash'], basis:['sale'], flags:[], settlements:['accreditive'], sellerCount:'1', buyerCount:'1', externalAgency:'Партнер' }, { stop:[], warnings:[], required:[] }],
  ['Просрочены документы к задатку', 'needs_documents', 'Квартира', 'Демо-адрес: просроченные документы', '2 450 000', 'Просрочка задач', 62, 28, false, true, { payments:['cash'], basis:['sale'], flags:[], settlements:['cash_after_registration'], sellerCount:'1', buyerCount:'1' }, { stop:[], warnings:['Не хватает справки о зарегистрированных'], required:['Справка о зарегистрированных','Свежая ЕГРН'] }],
  ['Новостройка по ДДУ', 'mortgage_review', 'Новостройка / ДДУ', 'Демо-адрес: новый ЖК', '5 050 000', 'ДДУ / ипотека', 70, 42, true, true, { payments:['mortgage'], basis:['ddu'], flags:[], settlements:['safe'], sellerCount:'1', buyerCount:'1', objectKind:'new_building' }, { stop:[], warnings:['Проверить ДДУ и аккредитацию','Проверить банк'], required:['Одобрение ипотеки','Проект ДДУ','Аккредитация объекта'] }],
  ['Сделка на регистрации', 'registration', 'Квартира', 'Демо-адрес: сделка на регистрации', '3 980 000', 'На регистрации', 100, 95, true, false, { payments:['mortgage'], basis:['sale'], flags:[], settlements:['safe'], sellerCount:'1', buyerCount:'2' }, { stop:[], warnings:[], required:[] }]
];

function plusDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function seedDemoDeals() {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('Supabase не настроен');
  const user = await getCurrentUser();
  if (!user) throw new Error('Сначала войдите в систему');
  await ensureNavigatorProfile();

  const { data: profile } = await supabase
    .from(PROFILES_TABLE)
    .select('id,role')
    .eq('id', user.id)
    .maybeSingle();

  const ownerId = profile?.id || user.id;

  const { data: oldDeals } = await supabase
    .from(DEALS_TABLE)
    .select('id,title')
    .like('title', '[ДЕМО]%')
    .limit(200);

  const oldIds = (oldDeals || []).map((item) => item.id);
  if (oldIds.length) {
    await supabase.from(EVENTS_TABLE).delete().in('deal_id', oldIds);
    await supabase.from(REVIEWS_TABLE).delete().in('deal_id', oldIds);
    await supabase.from(TASKS_TABLE).delete().in('deal_id', oldIds);
    await supabase.from(PARTICIPANTS_TABLE).delete().in('deal_id', oldIds);
    await supabase.from(DEALS_TABLE).delete().in('id', oldIds);
  }

  let created = 0;
  for (const [name, status, object_type, address, price, risk, readinessDeposit, readinessDeal, brokerNeeded, lawyerNeeded, dealJson, analysisJson] of scenarios) {
    const { data: deal, error } = await supabase
      .from(DEALS_TABLE)
      .insert({
        title: `[ДЕМО] ${name}`,
        status,
        created_by: ownerId,
        seller_spn_id: ownerId,
        buyer_spn_id: ownerId,
        lawyer_id: ownerId,
        broker_id: brokerNeeded ? ownerId : null,
        manager_id: ownerId,
        object_type,
        address,
        price_fact: price,
        price_contract: price,
        risk_level: risk,
        readiness_deposit: readinessDeposit,
        readiness_deal: readinessDeal,
        broker_needed: brokerNeeded,
        lawyer_needed: lawyerNeeded,
        seller_phone: 'демо',
        buyer_phone: 'демо',
        representation_model: 'both_sides',
        seller_representation: 'our_spn',
        buyer_representation: 'our_spn',
        preparation_owner_id: ownerId,
        documents_owner_id: ownerId,
        team_comment: 'Демо-карточка для проверки интерфейса и бизнес-процесса.',
        deal_json: { ...dealJson, demo: true },
        analysis_json: { ...analysisJson, demo: true }
      })
      .select('id,title,status')
      .single();

    if (error) throw error;
    created += 1;

    await supabase.from(PARTICIPANTS_TABLE).insert({
      deal_id: deal.id,
      user_id: ownerId,
      display_name: 'Демо СПН',
      participant_role: 'both_sides_spn',
      side: 'both',
      representation: 'our_spn',
      is_lead: true,
      can_edit: true,
      can_view: true,
      commission_share: '100%',
      comment: 'Демо-участник',
      created_by: ownerId
    });

    const taskSet = buildTasks(name, brokerNeeded, lawyerNeeded, ownerId);
    if (taskSet.length) {
      await supabase.from(TASKS_TABLE).insert(taskSet.map((task) => ({ ...task, deal_id: deal.id, created_by: ownerId })));
    }

    const review = buildReview(name, status, ownerId);
    if (review) await supabase.from(REVIEWS_TABLE).insert({ ...review, deal_id: deal.id, user_id: ownerId, reviewer_id: ownerId });

    await supabase.from(EVENTS_TABLE).insert([
      { deal_id: deal.id, user_id: ownerId, event_type: 'note_added', title: 'Демо-сделка создана', body: 'Карточка создана для проверки очередей, задач, решений и ленты.', metadata: { demo: true } },
      { deal_id: deal.id, user_id: ownerId, event_type: 'status_changed', title: 'Статус демо-сделки', body: 'Статус установлен при создании демо-набора.', old_value: 'draft', new_value: status, metadata: { demo: true } }
    ]);
  }
  return { created };
}

function buildTasks(name, brokerNeeded, lawyerNeeded, ownerId) {
  const tasks = [];
  if (name.includes('Просрочены')) {
    tasks.push({ assigned_to: ownerId, title: 'Донести справку о зарегистрированных', description: 'Просроченная демо-задача.', due_date: plusDays(-3), status: 'open', priority: 'urgent' });
    tasks.push({ assigned_to: ownerId, title: 'Заказать свежую ЕГРН', description: 'Просроченная демо-задача.', due_date: plusDays(-1), status: 'open', priority: 'high' });
  } else if (name.includes('Несовершеннолетний')) {
    tasks.push({ assigned_to: ownerId, title: 'Получить разрешение опеки', description: 'Без разрешения опеки задаток невозможен.', due_date: plusDays(3), status: 'open', priority: 'urgent' });
  } else if (name.includes('Маткапитал')) {
    tasks.push({ assigned_to: ownerId, title: 'Собрать документы по маткапиталу', description: 'Сертификат, справка об остатке, документы детей.', due_date: plusDays(1), status: 'open', priority: 'urgent' });
  } else if (name.includes('Дом + земля')) {
    tasks.push({ assigned_to: ownerId, title: 'Проверить межевание участка', description: 'Получить ЕГРН и проверить границы.', due_date: plusDays(2), status: 'open', priority: 'high' });
  } else if (name.includes('Доля')) {
    tasks.push({ assigned_to: ownerId, title: 'Проверить преимущественное право покупки', description: 'Проверить уведомления или отказы сособственников.', due_date: plusDays(1), status: 'in_progress', priority: 'high' });
  } else if (name.includes('Наследство')) {
    tasks.push({ assigned_to: ownerId, title: 'Проверить наследственное дело', description: 'Проверить круг наследников и риски оспаривания.', due_date: plusDays(1), status: 'open', priority: 'high' });
  } else if (brokerNeeded) {
    tasks.push({ assigned_to: ownerId, title: 'Проверить ипотеку / банк', description: 'Проверить одобрение, оценку и условия расчета.', due_date: plusDays(1), status: 'open', priority: 'high' });
  } else if (lawyerNeeded) {
    tasks.push({ assigned_to: ownerId, title: 'Передать документы юристу', description: 'Загрузить пакет документов и получить решение.', due_date: plusDays(1), status: 'open', priority: 'normal' });
  } else {
    tasks.push({ assigned_to: ownerId, title: 'Назначить дату задатка', description: 'Согласовать время со сторонами.', due_date: plusDays(1), status: 'open', priority: 'normal' });
  }
  return tasks;
}

function buildReview(name, status, ownerId) {
  if (status === 'ready_for_deposit') return { reviewer_role: 'lawyer', decision: 'can_prepare_deposit', comment: 'Документы достаточны для подготовки задатка.' };
  if (status === 'ready_for_deal' || status === 'registration') return { reviewer_role: 'manager', decision: 'can_prepare_deal', comment: 'Можно двигаться к сделке/регистрации.' };
  if (name.includes('Несовершеннолетний')) return { reviewer_role: 'lawyer', decision: 'stop_current_conditions', comment: 'Без разрешения опеки нельзя выходить на задаток.' };
  if (name.includes('ипотекой') || name.includes('Новостройка')) return { reviewer_role: 'broker', decision: 'needs_documents', comment: 'Нужны документы для банка и проверка условий.' };
  if (name.includes('Маткапитал') || name.includes('Детские')) return { reviewer_role: 'lawyer', decision: 'needs_documents', comment: 'Нужен полный пакет по детям и источнику средств.' };
  if (status === 'needs_lawyer' || status === 'lawyer_review') return { reviewer_role: 'lawyer', decision: 'needs_documents', comment: 'Нужна юридическая проверка и уточнение документов.' };
  return null;
}
