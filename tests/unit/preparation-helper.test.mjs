import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assess, buildSummary, buildPlan, emptyState, normalizeFact, normalizeState, validateCatalog } from '../../assets/js/preparation/model.js';

const catalog=JSON.parse(readFileSync(new URL('../../config/preparation-catalog.json',import.meta.url)));
const basic=(extra={})=>({...emptyState(),mode:'deposit',object:'flat',funding:['own'],...extra});
const fact=(value,source='unchecked')=>({value,source});
const result=(extra={})=>assess(basic(extra),catalog);
const ids=(r)=>r.questions.map((q)=>q.id);

test('catalog is valid and all rules preserve their review status',()=>{
  assert.deepEqual(validateCatalog(catalog),[]);
  assert.ok(catalog.rules.every((rule)=>rule.approval==='draft' && rule.kind!=='internal_required'));
});
test('01 simple flat with own funds asks four relevant questions and no bank questions',()=>{
  const r=result();assert.equal(r.broker.length,0);assert.equal(r.questions.length,4);
  assert.ok(!ids(r).includes('loan'));assert.ok(!ids(r).includes('land'));assert.ok(!ids(r).includes('minor'));
  assert.ok(r.documents.some((d)=>d.id==='title_basis'));assert.equal(r.facts.unknown.length,4);
});
test('02 mortgage asks about bank approval without claiming approval itself',()=>{
  const r=result({funding:['own','mortgage']});assert.ok(ids(r).includes('loan'));assert.ok(r.broker.length>0);
  assert.ok(r.documents.some((d)=>d.id==='loan_docs'));
});
test('03 house and land have separate document and boundary questions',()=>{
  const r=result({object:'house_land'});assert.ok(ids(r).includes('land'));assert.ok(r.documents.some((d)=>d.id==='land_docs'));
  assert.ok(r.lawyer.some((q)=>q.includes('границы')));
  const land=result({object:'land'});assert.ok(!ids(land).includes('past_matcap'));
});
test('04 sale of a share asks a professional about the procedure',()=>{
  const r=result({object:'share'});assert.ok(ids(r).includes('share'));assert.ok(r.documents.some((d)=>d.id==='share_docs'));
  assert.ok(r.lawyer.some((q)=>q.includes('прав других собственников')));
});
test('05 minor owner reported by client is not a confirmed document fact',()=>{
  const r=result({features:['minor'],facts:{minor:fact('yes','client')}});
  assert.equal(r.facts.client.find((q)=>q.id==='minor').value,'yes');assert.ok(!r.facts.document.some((q)=>q.id==='minor'));
  assert.ok(r.documents.some((d)=>d.id==='minor_docs'));assert.equal(r.broker.length,0);
});
test('06 past matcap goes to lawyer even if present payment uses own money',()=>{
  const r=result({facts:{past_matcap:fact('yes','document')}});assert.equal(r.broker.length,0);
  assert.ok(r.lawyer.some((q)=>q.includes('семейных долях')));assert.ok(r.documents.some((d)=>d.id==='past_matcap_docs'));
});
test('07 seller mortgage has a specific bank and legal route, no auto release',()=>{
  const r=result({features:['seller_mortgage'],facts:{seller_mortgage:fact('yes','client')}});
  assert.ok(r.broker.some((q)=>q.includes('заложенного объекта')));assert.ok(r.documents.some((d)=>d.id==='seller_bank'));
  assert.equal(result({features:['seller_mortgage'],facts:{seller_mortgage:fact('no','document')}}).broker.length,0);
});
test('08 inherited property asks for basis without automatic rejection',()=>{
  const r=result({features:['inheritance'],facts:{inheritance:fact('yes','document')}});
  assert.ok(r.documents.some((d)=>d.id==='inheritance_docs'));assert.ok(r.signals.some((s)=>s.includes('не автоматического отказа')));
});
test('09 power of attorney checks authority, unknown is still an expert question',()=>{
  const r=result({features:['poa']});assert.ok(ids(r).includes('poa'));assert.ok(r.documents.some((d)=>d.id==='poa_docs'));
  assert.ok(r.lawyer.some((q)=>q.includes('полномочия')));
});
test('10 alternative transaction asks about dependencies and timing',()=>{
  const r=result({features:['alternative'],facts:{alternative:fact('yes','client')}});
  assert.ok(r.lawyer.some((q)=>q.includes('взаимозависимые сроки')));assert.equal(r.broker.length,0);
});
test('11 incomplete answers stay unknown and produce no readiness or permission',()=>{
  const r=assess({...emptyState(),mode:'deposit'},catalog);
  assert.ok(r.facts.unknown.length>0);assert.ok(r.unreviewed.length>0);
  for(const key of ['ready','approved','legal_ready','tasks','deal_id'])assert.ok(!(key in r));
  assert.match(buildSummary(r,catalog),/Неизвестно:/);assert.match(buildSummary(r,catalog),/не является юридическим решением/);
});
test('12 changing price, parties or payment invalidates reuse of the old expert answer',()=>{
  const r=result({funding:['family_mortgage'],features:['changed'],facts:{loan:fact('yes','document'),changes:fact('yes','client')}});
  assert.match(r.next,/повторную проверку/);assert.ok(r.documents.some((d)=>d.id==='changed_terms'));
  assert.match(buildSummary(r,catalog),/пересогласовать|повторная оценка/);
});
test('13 two SPN coordinate without copying identities or generating assignments',()=>{
  const r=result({coordination:'two_spn'});assert.match(buildSummary(r,catalog),/Разные СПН/);
  assert.ok(!('tasks' in r));assert.ok(!('participants' in r.state));
});
test('14 urgent deposit still asks for real expert timing',()=>{
  const r=result({urgency:'urgent'});assert.match(buildSummary(r,catalog),/реальный срок согласовать до подписания/);
});
test('15 matcap, certificate and child funds without mortgage never route automatically to broker',()=>{
  for(const funding of [['own','matcap'],['certificate'],['matcap','certificate'],['child_funds']]){
    const r=result({funding});assert.equal(r.broker.length,0);assert.ok(r.lawyer.length>0);
    if(funding.includes('child_funds')){assert.equal(r.program.length,0);assert.ok(r.documents.some((d)=>d.id==='child_money_docs'));}
    else assert.ok(r.program.length>0);
  }
});
test('negative statements without a source are not confirmed absence of risk',()=>{
  const r=result({facts:{restrictions:fact('no'),owners:fact('yes','client')}});
  assert.ok(r.clarify.some((q)=>q.id==='restrictions'));assert.ok(r.facts.unchecked.some((q)=>q.id==='restrictions'));
  assert.equal(r.facts.document.length,0);
  assert.deepEqual(normalizeFact({value:false,source:'document'}),{value:'unknown',source:'unchecked'});
});
test('not applicable is distinct from no and carries its own qualification',()=>{
  const r=result({facts:{past_matcap:fact('not_applicable','document')}});
  assert.ok(r.facts.not_applicable.some((q)=>q.id==='past_matcap'));assert.ok(!r.facts.document.some((q)=>q.id==='past_matcap'));
  assert.match(buildSummary(r,catalog),/применимость не проверена/);
});
test('hidden answers and irrelevant available documents are excluded',()=>{
  const r=result({facts:{loan:fact('yes','document'),land:fact('no','client')},available:['loan_docs','egrn','not_real']});
  assert.ok(!('loan' in r.state.facts));assert.deepEqual(r.state.available,['egrn']);assert.ok(!buildSummary(r,catalog).includes('Кредитные параметры подтверждены'));
  const land=result({object:'land',features:['residents'],facts:{residents:fact('yes','client')}});assert.ok(!land.state.features.includes('residents'));assert.ok(!ids(land).includes('residents'));
});
test('data allowlist drops arbitrary client identifiers, payloads and repeated options',()=>{
  const normalized=normalizeState({...basic(),sellerName:'SYNTHETIC',phone:'SYNTHETIC',funding:['own','own','unknown','bad'],features:['bad'],facts:{password:fact('yes')}},catalog);
  assert.ok(!('sellerName' in normalized));assert.ok(!('phone' in normalized));assert.deepEqual(normalized.funding,['own']);assert.ok(!('password' in normalized.facts));
});
test('document available means received only, not checked or approved',()=>{
  const r=result({available:['egrn']});const text=buildSummary(r,catalog);
  assert.match(text,/Доступны в CRM: Сведения ЕГРН/);assert.match(text,/Получение не означает профессиональную проверку/);
});
test('rule edits cannot silently convert draft content into mandatory norms',()=>{
  const c=structuredClone(catalog);c.rules[0].kind='internal_required';assert.ok(validateCatalog(c).some((e)=>e.includes('Неутверждённое')));
  c.rules[0].owner='broker';assert.ok(validateCatalog(c).some((e)=>e.includes('Брокер без')));
});
test('catalog rejects broken dependencies, dangerous links and malformed structures',()=>{
  for(const mutate of [c=>c.rules[0].sources=['absent'],c=>c.rules[0].documents=['absent'],c=>c.sources[0].url='javascript:alert(1)',c=>c.questions[0].when={objects:['absent']},c=>c.rules[0].values=['invalid']]){
    const c=structuredClone(catalog);mutate(c);if(c.rules[0].values)c.rules[0].fact='owners';assert.ok(validateCatalog(c).length>0);
  }
  assert.ok(validateCatalog(null).length);assert.ok(validateCatalog({schema_version:1}).length);
});
test('selection of a feature without confirmation remains unknown',()=>{
  const r=result({features:['minor','spouse']});assert.ok(r.facts.unknown.some((q)=>q.id==='minor'));assert.equal(r.facts.document.length,0);
});
test('main deal adds transfer questions; new building variants use the correct route',()=>{
  const r=result({mode:'deal'});assert.ok(ids(r).includes('transfer'));
  for(const object of ['new_build','ddu','assignment'])assert.ok(result({object}).documents.some((d)=>d.id==='developer_docs'));
});
test('DDU and assignment do not ask for existing apartment ownership evidence',()=>{
  for(const object of ['ddu','assignment']){
    const r=result({object});assert.ok(ids(r).includes('contract_parties'));assert.ok(!ids(r).includes('owners'));
    assert.ok(!r.documents.some((d)=>d.id==='egrn'||d.id==='title_basis'));
  }
  assert.ok(!ids(result({object:'ddu'})).includes('past_matcap'));
});
test('child-owned money is a legal question, not automatically a benefit program',()=>{
  const r=result({funding:['child_funds']});assert.ok(ids(r).includes('child_money'));assert.ok(!ids(r).includes('social'));
  assert.equal(r.program.length,0);assert.equal(r.broker.length,0);
});

test('ordinary flow does not repeat a prior-consent question without that topic',()=>{
  assert.ok(!ids(result()).includes('changes'));
  const r=result({features:['changed']});assert.ok(ids(r).includes('changes'));
  assert.match(r.next,/Уточните/);assert.match(r.next,/повторную проверку/);
  assert.equal(r.active.filter((rule)=>rule.id.startsWith('changed')).length,1);
});
test('unknown selected features never become confirmed signals or a concrete incident',()=>{
  for(const feature of ['minor','poa','seller_mortgage','dispute','changed']){
    const r=result({features:[feature]});assert.equal(r.facts.document.length,0);assert.equal(r.facts.client.length,0);
    assert.ok(r.signals.every((signal)=>signal.startsWith('Пока не подтверждено:')));
    const prompts={minor:/есть ли/,poa:/будет ли/,seller_mortgage:/сохраняются ли/,dispute:/есть ли/,changed:/менялись ли/};
    assert.match(r.next,prompts[feature]);
  }
});
test('clarification is ordered by consequence and distinguishes missing from known facts',()=>{
  const unknown=result();assert.equal(unknown.clarify[0].id,'restrictions');
  const r=result({facts:{restrictions:fact('yes','document'),past_matcap:fact('yes','client')}});
  assert.equal(r.clarify.find((q)=>q.id==='restrictions').reason,'attention');
  assert.match(r.clarify.find((q)=>q.id==='restrictions').clarify,/Передайте юристу вид/);
  assert.match(r.clarify.find((q)=>q.id==='past_matcap').clarify,/Передайте юристу сведения/);
});
test('a positive source-less answer asks for its source instead of repeating the whole investigation',()=>{
  const r=result({facts:{owners:fact('yes')}});
  const item=r.clarify.find((q)=>q.id==='owners');assert.equal(item.reason,'source');assert.match(item.clarify,/откуда известен ответ/);
});
test('land-only and contract completion questions do not invent a house or key handover',()=>{
  const land=result({object:'land'});const q=land.questions.find((q)=>q.id==='land');
  assert.ok(!q.clarify.includes('дому'));assert.ok(!q.clarify.includes('обоим объектам'));
  for(const object of ['ddu','assignment']){
    const r=result({mode:'deal',object,features:['minor']});
    const minor=r.questions.find((q)=>q.id==='minor');assert.match(minor.title,/правообладатель/);assert.ok(!minor.title.includes('собственник'));
    assert.match(r.questions.find((q)=>q.id==='transfer').title,/регистрацию договора/);
    assert.ok(!r.questions.find((q)=>q.id==='transfer').title.includes('ключи'));
  }
});
test('unknown context wins over ordinary checklist and no source is guessed',()=>{
  const r=assess({...emptyState(),mode:'deposit'},catalog);assert.match(r.next,/Определить тип объекта/);
  const funding=result({funding:['unknown']});assert.match(funding.next,/источники оплаты/);
  assert.ok(r.questions.every((q)=>r.state.facts[q.id].source==='unchecked'));
});
test('mixed payment is a funding question and not an inferred sale chain or mortgage',()=>{
  const r=result({funding:['mixed']});assert.ok(ids(r).includes('funding_scheme'));assert.ok(!ids(r).includes('alternative'));
  assert.equal(r.broker.length,0);assert.equal(r.program.length,0);
});
test('plan copying retains document guidance, missing items and legal boundaries',()=>{
  const r=result({facts:{past_matcap:fact('yes','client')}});const plan=buildPlan(r,catalog);
  assert.match(plan,/Сейчас:/);assert.match(plan,/семейных долях/);assert.match(plan,/Документы-ориентиры:/);
  assert.match(plan,/отсутствие отметки не означает/);assert.match(plan,/не юридическое решение/);
});
test('variant metadata cannot change a question identity or smuggle unvalidated conditions',()=>{
  for(const mutate of [c=>c.questions[0].variants={},c=>c.questions[0].variants=[null],c=>c.questions[0].variants=[{id:'hidden',when:{objects:['flat']}}],c=>c.questions[0].variants=[{when:{objects:['not_real']},title:'x',short:'x',why:'x',clarify:'x'}]]){
    const c=structuredClone(catalog);mutate(c);assert.ok(validateCatalog(c).length);
  }
});

test('focused power-of-attorney question needs one answer and no generic preparation checklist',()=>{
  const r=assess({...emptyState(),mode:'question',features:['poa']},catalog);
  assert.deepEqual(ids(r),['poa']);assert.deepEqual(r.documents.map((d)=>d.id),['poa_docs']);
  assert.equal(r.lawyer.length,1);assert.equal(r.broker.length,0);assert.match(r.next,/будет ли представитель/);
  assert.ok(!r.next.includes('тип объекта'));assert.equal(r.facts.unknown.length,1);
  for(const text of [buildPlan(r,catalog),buildSummary(r,catalog)]){
    assert.match(text,/Остальные обстоятельства сделки здесь не проверялись/);
    assert.ok(!text.includes('Отдельно не проверялись:'));assert.match(text,/не юридическое решение|не является юридическим решением/);
  }
});
test('focused bank question routes only to bank and a negative correction removes that route',()=>{
  const r=assess({...emptyState(),mode:'question',features:['bank_question']},catalog);
  assert.deepEqual(ids(r),['bank_question']);assert.equal(r.lawyer.length,0);assert.equal(r.broker.length,1);
  assert.deepEqual(r.documents.map((d)=>d.id),['loan_docs']);assert.match(r.next,/именно ответ нужен от банка/);
  assert.match(buildSummary(r,catalog,'broker'),/Вопрос брокеру \/ банку/);
  const corrected=result({mode:'question',features:['bank_question'],facts:{bank_question:fact('no','document')}});
  assert.equal(corrected.broker.length,0);assert.equal(corrected.lawyer.length,0);assert.equal(corrected.documents.length,0);
  assert.ok(!corrected.next.includes('Передайте юристу'));
});
test('focused question retains relevant object and funding context without general core checks',()=>{
  for(const [extra,question] of [[{object:'land'},'land'],[{object:'share'},'share'],[{object:'ddu'},'developer'],[{funding:['mortgage']},'loan'],[{funding:['matcap']},'social'],[{funding:['child_funds']},'child_money']]){
    const r=result({mode:'question',...extra});assert.deepEqual(ids(r),[question]);
    assert.ok(!r.active.some((rule)=>rule.preparation_only));
    if(!extra.funding?.includes('mortgage'))assert.equal(r.broker.length,0);
  }
  const ordinary=result();assert.equal(ordinary.questions.length,4);assert.ok(ordinary.active.some((rule)=>rule.id==='base'));
});
test('empty question mode asks for a topic instead of inventing a legal or banking request',()=>{
  const r=assess({...emptyState(),mode:'question'},catalog);
  assert.equal(r.questions.length,0);assert.equal(r.active.length,0);assert.equal(r.documents.length,0);
  assert.equal(r.lawyer.length,0);assert.equal(r.broker.length,0);assert.match(r.next,/Выберите тему вопроса/);
  assert.ok(!buildPlan(r,catalog).includes('Документы-ориентиры: .'));
});
test('focused mode drops hidden core facts and documents after a topic is removed',()=>{
  const r=result({mode:'question',features:['bank_question'],facts:{owners:fact('yes','document'),poa:fact('yes','client')},available:['parties','egrn','poa_docs','loan_docs']});
  assert.deepEqual(Object.keys(r.state.facts),['bank_question']);assert.deepEqual(r.state.available,['loan_docs']);
  const removed=assess({...r.state,features:[]},catalog);assert.deepEqual(removed.state.facts,{});assert.deepEqual(removed.state.available,[]);
  assert.ok(!buildSummary(r,catalog,'broker').includes('Есть представитель по доверенности: да'));
});
test('catalog validates the preparation-only scope flag without changing approval requirements',()=>{
  const c=structuredClone(catalog);c.rules[0].preparation_only='yes';assert.ok(validateCatalog(c).some((e)=>e.includes('область применения')));
  c.rules[0].preparation_only=true;c.rules[0].kind='internal_required';assert.ok(validateCatalog(c).some((e)=>e.includes('Неутверждённое')));
});
