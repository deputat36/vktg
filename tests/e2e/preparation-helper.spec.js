import { test, expect } from '@playwright/test';
import { captureRuntimeFailures, expectNoRuntimeFailures } from './helpers.mjs';

async function open(page){
  const response=await page.goto('preparation.html');expect(response.status()).toBe(200);
  await expect(page.getByRole('button',{name:'Готовлю задаток'})).toBeVisible();
}
async function start(page,mode='deposit'){
  await open(page);await page.locator(`[data-mode="${mode}"]`).click();
  await expect(page.locator('h1')).toHaveText('Какая у вас ситуация?');
}
async function choose(page,{object='flat',funding=['own'],features=[],urgency,coordination}={}){
  if(await page.locator('#question-context').count())await page.locator('#question-context > summary').click();
  await page.locator('#object').selectOption(object);
  for(const id of funding){
    const input=page.locator(`#funding-${id}`);
    if(!await input.isVisible())await page.locator('#more-funding summary').click();
    await input.check();
  }
  for(const id of features)await page.locator(`#feature-${id}`).check();
  if(urgency)await page.locator('#urgency').selectOption(urgency);
  if(coordination){await page.locator('#coordination-details summary').click();await page.locator('#coordination').selectOption(coordination);}
}
const scenarios=[
  {name:'01 simple flat',options:{},expected:'Документ об основании права',notBank:true},
  {name:'02 mortgage',options:{funding:['mortgage']},expected:'Что уточнить у брокера / банка'},
  {name:'03 house and land',options:{object:'house_land'},expected:'Сведения о правах, границах и использовании земли',notBank:true},
  {name:'04 share',options:{object:'share'},expected:'Сведения о долях и статусе комнаты',notBank:true},
  {name:'05 minor',options:{features:['minor']},expected:'Документы о правах ребёнка и необходимых разрешениях',notBank:true},
  {name:'06 previous matcap',options:{},answer:['past_matcap','yes','client'],expected:'Сведения об использовании маткапитала и семейных долях',notBank:true},
  {name:'07 seller mortgage',options:{features:['seller_mortgage']},expected:'Актуальная информация банка продавца'},
  {name:'08 inheritance',options:{features:['inheritance']},expected:'Документ об основании наследования',notBank:true},
  {name:'09 power of attorney',options:{features:['poa']},expected:'Доверенность и сведения о её актуальности',notBank:true},
  {name:'10 alternative',options:{features:['alternative']},expected:'взаимозависимые сроки',notBank:true},
  {name:'11 incomplete',options:{object:'unknown',funding:['unknown']},expected:'Определить тип объекта по документам',notBank:true},
  {name:'12 changed terms',options:{features:['changed'],funding:['family_mortgage']},expected:'старый ответ не подтверждает новые вводные'},
  {name:'13 two SPN',options:{coordination:'two_spn'},expected:'Согласовать с другим СПН',notBank:true},
  {name:'14 urgent',options:{urgency:'urgent'},expected:'Срочность не заменяет проверку',notBank:true},
  {name:'15 social funds without a loan',options:{funding:['matcap','certificate']},expected:'У оператора программы',notBank:true}
];
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    window.__storageHits=[];
    for(const method of ['getItem','setItem','removeItem','clear'])Storage.prototype[method]=function(){window.__storageHits.push(method);throw new Error('Browser storage is not allowed in preparation helper');};
  });
});
for(const scenario of scenarios)test(scenario.name,async({page},testInfo)=>{
  const failures=captureRuntimeFailures(page);const requests=[];page.on('request',(request)=>requests.push({url:request.url(),method:request.method()}));
  await start(page);await choose(page,scenario.options);
  if(scenario.answer){
    await page.locator('[data-action=details]').click();const[id,value,source]=scenario.answer;
    await page.locator(`#fact-${id}-${value}`).check();await page.locator(`#source-${id}`).selectOption(source);
    await page.locator('[data-action=result]').click();
  }else await page.locator('[data-action=result]').click();
  await expect(page.locator('h1')).toHaveText('Ваш план подготовки');
  await page.locator('#documents > summary').click();
  await expect(page.locator('#main')).toContainText(scenario.expected);
  if(scenario.notBank)await expect(page.getByRole('heading',{name:'Что уточнить у брокера / банка'})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  expect(await page.evaluate(()=>window.__storageHits)).toEqual([]);
  expect(requests.filter((request)=>request.method!=='GET')).toEqual([]);
  const base=new URL(testInfo.project.use.baseURL);const prefix=base.pathname.endsWith('/')?base.pathname:`${base.pathname}/`;
  expect(requests.filter((request)=>{const url=new URL(request.url);return url.origin!==base.origin||!url.pathname.startsWith(prefix)||!url.pathname.slice(prefix.length).match(/^(preparation\.html|assets\/(js\/preparation|css\/preparation)|config\/preparation-catalog\.json|favicon\.ico)/);})).toEqual([]);
  await expectNoRuntimeFailures(failures,testInfo,'preparation-scenario');
});

test('beginner flow: provenance, copying fallback, missing details, reset and reload',async({page},testInfo)=>{
  const failures=captureRuntimeFailures(page);await start(page);await choose(page,{features:['minor']});
  await page.locator('[data-action=details]').click();await expect(page.locator('[data-question=loan]')).toHaveCount(0);await expect(page.locator('[data-question=land]')).toHaveCount(0);
  await page.locator('#topic-minor > summary').click();await page.locator('#fact-minor-yes').check();await page.locator('#source-minor').selectOption('client');
  await page.locator('#fact-owners-yes').check();await page.locator('#source-owners').selectOption('document');
  await page.locator('[data-action=result]').click();
  await expect(page.locator('.fact-group').filter({hasText:'Со слов клиента'})).toContainText('Несовершеннолетний собственник');
  await page.locator('#documents > summary').click();await page.locator('#available-egrn').check();
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('not_allowed'))}}));
  await page.locator('[data-action=copy-lawyer]').click();await expect(page.locator('#summary-text')).toBeFocused();
  const copied=await page.locator('#summary-text').inputValue();expect(copied).toContain('Со слов клиента:');expect(copied).toContain('Сведения ЕГРН');expect(copied).toContain('не является юридическим решением');
  await page.reload();await expect(page.locator('.mode-grid')).toBeVisible();await expect(page.locator('#summary-text')).toHaveCount(0);
  await page.locator('[data-mode=deal]').click();await page.locator('[data-action=reset]').click();await expect(page.locator('.mode-grid')).toBeVisible();
  await expectNoRuntimeFailures(failures,testInfo,'beginner');
});
test('experienced flow: skip, successful clipboard, main deal and context correction',async({page})=>{
  await start(page,'deal');await choose(page,{object:'house_land',funding:['mortgage']});await page.locator('[data-action=details]').click();
  await expect(page.locator('[data-question=transfer]')).toBeVisible();
  await page.locator('#fact-loan-yes').check();await page.locator('#source-loan').selectOption('document');
  await page.locator('[data-action=situation]').click();await page.locator('#object').selectOption('flat');
  await page.locator('#funding-own').check();await page.locator('#funding-mortgage').uncheck();await page.locator('[data-action=details]').click();
  await expect(page.locator('[data-question=loan]')).toHaveCount(0);await expect(page.locator('[data-question=land]')).toHaveCount(0);
  await expect(page.locator('#fact-owners-unknown')).toBeChecked();
  await page.locator('[data-action=result]').click();
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text)=>{window.__copied=text;}}}));
  await page.locator('[data-action=copy-lawyer]').click();await expect(page.locator('#copy-status')).toContainText('Скопировано');
  expect(await page.evaluate(()=>window.__copied)).not.toContain('Кредитные параметры подтверждены: да');
});
test('question flow and every four-way answer are usable with native keyboard controls',async({page})=>{
  await start(page,'question');await choose(page,{features:['poa']});await page.locator('[data-action=details]').click();
  await expect(page.locator('h1')).toBeFocused();await expect(page.locator('[data-question]')).toHaveCount(1);await page.locator('#fact-poa-unknown').focus();await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#fact-poa-no')).toBeChecked();
  await page.locator('#fact-poa-not_applicable').check();await page.locator('[data-action=result]').click();
  await expect(page.locator('#main')).toContainText('применимость не проверена');
  await page.locator('[data-nav=details]').click();await expect(page.locator('#fact-poa-not_applicable')).toBeChecked();
});
test('catalog outage and invalid catalog show recovery without false legal results',async({page})=>{
  await page.route('**/config/preparation-catalog.json',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
  await page.goto('preparation.html');await expect(page.locator('h1')).toHaveText('Не удалось открыть сценарии');
  await expect(page.locator('[data-action=copy-lawyer]')).toHaveCount(0);
  await page.unroute('**/config/preparation-catalog.json');await page.locator('[data-action=retry]').click();await expect(page.locator('.mode-grid')).toBeVisible();
  await page.route('**/config/preparation-catalog.json',route=>route.fulfill({status:200,contentType:'application/json',body:'{"schema_version":1}'}));
  await page.reload();await expect(page.locator('h1')).toHaveText('Не удалось открыть сценарии');
});
test('ordinary plan copy stays compact and no client data entry is offered',async({page})=>{
  await start(page);await choose(page);await page.locator('[data-action=result]').click();
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text)=>{window.__copied=text;}}}));
  await page.locator('[data-action=copy-lawyer]').click();
  expect((await page.evaluate(()=>window.__copied)).length).toBeLessThan(3000);
  await expect(page.locator('input[type=text],input[type=tel],input[type=email],input[type=file],textarea:not([readonly])')).toHaveCount(0);
});
test('responsive screenshots at narrow phone, tablet and desktop widths',async({page},testInfo)=>{
  for(const width of [320,768,1280]){
    await page.setViewportSize({width,height:900});await open(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await testInfo.attach(`home-${width}.png`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
    await page.locator('[data-mode=deposit]').click();await choose(page,{features:['minor','poa']});
    const wordLines=await page.locator('label[for=feature-minor] span, label[for=funding-own] span').evaluateAll(nodes=>nodes.map(node=>{
      const text=node.firstChild;const range=document.createRange();range.setStart(text,0);range.setEnd(text,text.textContent.split(' ')[0].length);return range.getClientRects().length;
    }));expect(wordLines).toEqual([1,1]);
    await testInfo.attach(`situation-${width}.png`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
    await page.locator('[data-action=details]').click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await testInfo.attach(`details-${width}.png`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
    await page.locator('[data-action=result]').click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await testInfo.attach(`result-${width}.png`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
  }
});
test('methodologist edits a draft and exports without any server mutation',async({page})=>{
  const requests=[];page.on('request',(request)=>requests.push(request.method()));
  await page.goto('preparation-rules.html');await expect(page.locator('#rule-select')).toBeVisible();
  await page.locator('#edit-question').fill('Уточнить комплект исходных документов для выбранного действия?');
  await page.locator('#catalog-version').fill('0.1.1');
  const downloadPromise=page.waitForEvent('download');await page.locator('#export-catalog').click();const download=await downloadPromise;
  expect(download.suggestedFilename()).toBe('preparation-catalog-draft-0.1.1.json');await expect(page.locator('#editor-status')).toContainText('сайт не изменён');
  expect(requests.filter((method)=>method!=='GET')).toEqual([]);expect(await page.evaluate(()=>window.__storageHits)).toEqual([]);
});
test('DDU and child money avoid unrelated ownership and social program questions',async({page})=>{
  await start(page);await choose(page,{object:'ddu',funding:['child_funds']});await page.locator('[data-action=details]').click();
  await expect(page.locator('[data-question=contract_parties]')).toBeVisible();await expect(page.locator('[data-question=child_money]')).toBeVisible();
  await expect(page.locator('[data-question=owners]')).toHaveCount(0);await expect(page.locator('[data-question=social]')).toHaveCount(0);
  await expect(page.locator('[data-question=past_matcap]')).toHaveCount(0);await page.locator('[data-action=result]').click();
  await expect(page.getByRole('heading',{name:'У оператора программы'})).toHaveCount(0);await page.locator('#documents > summary').click();
  await expect(page.locator('#main')).not.toContainText('Сведения ЕГРН по объекту');
});

test('shared answer source applies only to new answers and per-answer corrections stay intact',async({page})=>{
  await start(page);await choose(page);await page.locator('[data-action=details]').click();
  await expect(page.locator('.questions > [data-question]')).toHaveCount(4);
  await page.locator('#answer-source').selectOption('client');
  await page.locator('#fact-owners-yes').check();await expect(page.locator('#source-owners')).toHaveValue('client');
  await page.locator('#answer-source').selectOption('document');
  await expect(page.locator('#source-owners')).toHaveValue('client');
  await page.locator('#fact-restrictions-no').check();await expect(page.locator('#source-restrictions')).toHaveValue('document');
  await page.locator('#source-owners').selectOption('unchecked');
  await page.locator('#fact-owners-no').check();await expect(page.locator('#source-owners')).toHaveValue('unchecked');
  await page.locator('#fact-past_matcap-not_applicable').check();await expect(page.locator('#source-past_matcap')).toHaveCount(0);
  await page.locator('[data-action=result]').click();await page.locator('#request-preview summary').click();
  await expect(page.locator('.summary-preview')).toContainText('Со слов клиента: не отмечено');
  await page.locator('[data-action=reset]').click();await page.locator('[data-mode=deposit]').click();
  await page.locator('[data-action=details]').click();await expect(page.locator('#answer-source')).toHaveValue('unchecked');
});
test('changing payment preserves property facts and clears payment-dependent confirmations',async({page})=>{
  await start(page);await choose(page,{funding:['mortgage']});await page.locator('[data-action=details]').click();
  await page.locator('#fact-owners-yes').check();await page.locator('#source-owners').selectOption('document');
  await page.locator('#fact-terms-yes').check();await page.locator('#source-terms').selectOption('client');
  await page.locator('#fact-loan-yes').check();await page.locator('#source-loan').selectOption('document');
  await page.locator('[data-action=situation]').click();await page.locator('#funding-family_mortgage').check();
  await expect(page.locator('#funding-mortgage')).not.toBeChecked();
  await page.locator('[data-action=details]').click();
  await expect(page.locator('#fact-owners-yes')).toBeChecked();await expect(page.locator('#source-owners')).toHaveValue('document');
  await expect(page.locator('#fact-terms-unknown')).toBeChecked();await expect(page.locator('#fact-loan-unknown')).toBeChecked();
  await expect(page.locator('#answer-source')).toHaveValue('unchecked');
});
test('selected topics are already used without repeating their confirmation and can be corrected',async({page})=>{
  await start(page);await choose(page,{features:['minor']});await page.locator('[data-action=details]').click();
  await expect(page.locator('#topic-minor')).not.toHaveAttribute('open','');
  await expect(page.locator('#fact-minor-yes')).not.toBeVisible();
  await page.locator('[data-action=result]').click();await page.locator('#request-preview summary').click();
  await expect(page.locator('.summary-preview')).toContainText('Выбраны темы для проверки (не подтверждение фактов)');
  await expect(page.locator('.summary-preview')).toContainText('Неизвестно:');
  await page.locator('[data-action=details]').click();await page.locator('#topic-minor > summary').click();await page.locator('#fact-minor-no').check();await page.locator('#source-minor').selectOption('document');
  await page.locator('[data-action=result]').click();await expect(page.locator('#available-minor_docs')).toHaveCount(0);
});
test('plan copying and preview update immediately after corrections',async({page})=>{
  await start(page);await choose(page);await page.locator('[data-action=result]').click();
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text)=>{window.__copied=text;}}}));
  await page.locator('[data-action=copy-plan]').click();expect(await page.evaluate(()=>window.__copied)).toContain('План подготовки');
  await page.locator('#request-preview summary').click();await expect(page.locator('.summary-preview')).toContainText('наличие документов не отмечено');
  await page.locator('#documents > summary').click();await page.locator('#available-egrn').check();
  await expect(page.locator('.summary-preview')).toContainText('Доступны в CRM: Сведения ЕГРН');
  await page.locator('[data-action=details]').click();await page.locator('#fact-past_matcap-yes').check();
  await page.locator('#source-past_matcap').selectOption('client');await page.locator('[data-action=result]').click();
  await page.locator('[data-action=copy-plan]').click();expect(await page.evaluate(()=>window.__copied)).toContain('семейных долях');
});
test('mobile action bar stays visible and inputs can be reached without overlap',async({page})=>{
  await page.setViewportSize({width:360,height:800});await start(page);await choose(page);
  const button=page.locator('[data-action=details]');await expect(button).toBeInViewport();
  await button.click();await expect(page.locator('[data-action=result]')).toBeInViewport();
  await page.locator('#fact-terms-no').check();await page.locator('#source-terms').selectOption('client');
  const bottom=await page.locator('.action-bar').boundingBox();expect(bottom.y+bottom.height).toBeLessThanOrEqual(800);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('contract-side children and completion do not become existing ownership or immediate keys',async({page})=>{
  await start(page,'deal');await choose(page,{object:'assignment',features:['minor']});await page.locator('[data-action=details]').click();
  await expect(page.locator('[data-question=transfer]')).toContainText('регистрацию договора');
  await page.locator('#topic-minor > summary').click();await expect(page.locator('[data-question=minor] legend')).toContainText('правообладатель');
  await page.locator('#fact-minor-yes').check();await page.locator('#source-minor').selectOption('client');
  await page.locator('[data-action=result]').click();await page.locator('#request-preview summary').click();
  await expect(page.locator('.summary-preview')).toContainText('Ребёнок среди правообладателей по договору: да');
});

test('methodologist can edit an object-specific question and export its variant without changing the base',async({page})=>{
  await page.goto('preparation-rules.html');await page.locator('#question-editor > summary').click();
  await page.locator('#question-select').selectOption('land');await page.locator('#question-variant').selectOption('0');
  await expect(page.locator('#question-why')).toContainText('Забор');
  await page.locator('#question-title').fill('Проверены сведения об участке и доступе?');
  await page.locator('#question-variant').selectOption('-1');
  await expect(page.locator('#question-title')).toHaveValue('Права на землю, границы и доступ к участку сверили?');
  await page.locator('#question-variant').selectOption('0');
  await expect(page.locator('#question-title')).toHaveValue('Проверены сведения об участке и доступе?');
  const downloadPromise=page.waitForEvent('download');await page.locator('#export-catalog').click();
  const download=await downloadPromise;const stream=await download.createReadStream();const chunks=[];
  for await(const chunk of stream)chunks.push(chunk);
  const c=JSON.parse(Buffer.concat(chunks).toString());
  expect(c.questions.find((q)=>q.id==='land').variants[0].title).toBe('Проверены сведения об участке и доступе?');
  expect(c.rules.every((rule)=>rule.approval==='draft')).toBe(true);
});

test('focused bank question skips optional context and produces only a bank request',async({page},testInfo)=>{
  const failures=captureRuntimeFailures(page);await start(page,'question');
  await expect(page.locator('#object')).not.toBeVisible();await page.locator('#feature-bank_question').check();
  await page.locator('[data-action=result]').click();
  await expect(page.locator('#question-scope')).toContainText('Остальные обстоятельства сделки здесь не проверялись');
  await expect(page.locator('#clarifications [data-edit-question]')).toHaveCount(1);
  await expect(page.locator('#lawyer-request')).toHaveCount(0);await expect(page.locator('[data-action=copy-lawyer]')).toHaveCount(0);
  await expect(page.locator('#broker-request')).toBeVisible();await expect(page.locator('.next-step')).not.toContainText('Определить тип объекта');
  await page.locator('#broker-preview > summary').click();await expect(page.locator('.summary-preview')).toContainText('Вопрос брокеру / банку');
  await expect(page.locator('.summary-preview')).not.toContainText('Отдельно не проверялись:');
  await page.locator('#documents > summary').click();await expect(page.locator('#available-loan_docs')).toBeVisible();await expect(page.locator('#available-egrn')).toHaveCount(0);
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text)=>{window.__copied=text;}}}));
  await page.locator('[data-action=copy-broker]').click();expect(await page.evaluate(()=>window.__copied)).toContain('Остальные обстоятельства сделки здесь не проверялись');
  expect(await page.evaluate(()=>window.__storageHits)).toEqual([]);await expectNoRuntimeFailures(failures,testInfo,'focused-bank');
});
test('focused topic can be corrected from the plan without unrelated documents or requests',async({page})=>{
  await start(page,'question');await page.locator('#feature-poa').check();await page.locator('[data-action=result]').click();
  await expect(page.locator('#clarifications [data-edit-question]')).toHaveCount(1);
  await page.locator('#edit-clarify-poa').click();await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('#fact-poa-no').check();await page.locator('#source-poa').selectOption('client');
  await expect(page.getByRole('dialog')).toBeVisible();await page.locator('[data-action=close-answer]').click();
  await expect(page.locator('#lawyer-request')).toHaveCount(0);await expect(page.locator('#documents')).toHaveCount(0);
  await expect(page.locator('#edit-known-poa')).toBeFocused();await expect(page.locator('#known-facts')).toContainText('Со слов клиента');
  await page.locator('[data-action=details]').click();await expect(page.locator('[data-question]')).toHaveCount(1);await expect(page.locator('#fact-poa-no')).toBeChecked();
});
test('empty focused question provides a topic prompt without a false zero-risk plan',async({page})=>{
  await start(page,'question');await page.locator('[data-action=details]').click();
  await expect(page.getByRole('heading',{name:'Выберите тему вопроса'})).toBeVisible();
  await page.locator('[data-action=result]').click();await expect(page.locator('.next-step')).toContainText('Выберите тему вопроса');
  await expect(page.locator('#clarifications')).not.toContainText('неизвестного не осталось');
  await expect(page.locator('#lawyer-request, #broker-request, #documents')).toHaveCount(0);
});
test('answer dialog recomputes the plan and returns focus without inheriting the bulk source',async({page},testInfo)=>{
  const failures=captureRuntimeFailures(page);await start(page);await choose(page);await page.locator('[data-action=details]').click();
  await page.locator('#answer-source').selectOption('document');await page.locator('[data-action=result]').click();
  await page.locator('#request-preview > summary').click();await page.locator('#edit-clarify-owners').click();
  await expect(page.locator('#answer-editor-title')).toBeFocused();
  await page.locator('#fact-owners-yes').check();await expect(page.locator('#source-owners')).toHaveValue('unchecked');
  await expect(page.locator('#fact-owners-yes')).toBeFocused();await page.keyboard.press('Tab');
  await expect(page.locator('#source-owners')).toBeFocused();await page.locator('#source-owners').selectOption('client');
  await expect(page.locator('#source-owners')).toBeFocused();await expect(page.locator('#answer-editor')).toBeVisible();
  for(let index=0;index<8;index++){
    await page.keyboard.press('Tab');expect(await page.evaluate(()=>document.activeElement.closest('dialog')?.id)).toBe('answer-editor');
  }
  await page.keyboard.press('Escape');await expect(page.locator('#answer-editor')).toHaveCount(0);
  await expect(page.locator('#edit-known-owners')).toBeFocused();await expect(page.locator('#known-facts')).toHaveAttribute('open','');
  await expect(page.locator('.summary-preview')).toContainText('Со слов клиента: Собственники и подписанты понятны: да');
  await expect(page.locator('#clarifications')).not.toContainText('откуда известен ответ: «Собственники');
  expect(await page.evaluate(()=>window.__storageHits)).toEqual([]);await expectNoRuntimeFailures(failures,testInfo,'answer-dialog');
});
test('correction removes obsolete documents while dialog stays open and not-applicable can be edited',async({page})=>{
  await start(page);await choose(page,{features:['minor']});await page.locator('[data-action=result]').click();
  await page.locator('#documents > summary').click();await page.locator('#available-minor_docs').check();
  await page.locator('#edit-clarify-minor').click();await page.locator('#fact-minor-no').check();await page.locator('#source-minor').selectOption('document');
  await expect(page.locator('#answer-editor')).toBeVisible();await expect(page.locator('#available-minor_docs')).toHaveCount(0);
  await page.locator('[data-action=close-answer]').click();await expect(page.locator('#edit-known-minor')).toBeFocused();
  await page.locator('#edit-known-minor').click();await page.locator('#fact-minor-not_applicable').check();await page.keyboard.press('Escape');
  await expect(page.locator('#known-facts')).toContainText('«Не относится» — применимость не проверена');
  await page.locator('#edit-known-minor').click();await page.locator('#fact-minor-unknown').check();await page.locator('[data-action=close-answer]').click();
  await expect(page.locator('#edit-clarify-minor')).toBeFocused();await expect(page.locator('#available-minor_docs')).not.toBeChecked();
  await page.reload();await expect(page.locator('.mode-grid')).toBeVisible();await expect(page.locator('#answer-editor')).toHaveCount(0);
});
test('focused question and answer dialog fit 320, 768 and 1280 pixels',async({page},testInfo)=>{
  for(const width of [320,768,1280]){
    await page.setViewportSize({width,height:800});await start(page,'question');
    await testInfo.attach(`focused-situation-${width}.png`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
    await page.locator('#feature-bank_question').check();await page.locator('[data-action=result]').click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await testInfo.attach(`focused-result-${width}.png`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
    await page.locator('#edit-clarify-bank_question').click();await page.locator('#fact-bank_question-yes').check();
    await page.locator('#source-bank_question').selectOption('client');await page.locator('#why-bank_question > summary').click();
    const dialog=page.locator('#answer-editor');await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((node)=>node.scrollWidth<=node.clientWidth)).toBe(true);
    expect(await dialog.locator('.answer').evaluateAll((labels)=>labels.every((label)=>{
      const box=label.getBoundingClientRect();
      return [...label.childNodes].filter((node)=>node.nodeType===Node.TEXT_NODE && node.textContent.trim()).every((node)=>{
        const range=document.createRange();range.selectNodeContents(node);
        return [...range.getClientRects()].every((rect)=>rect.left>=box.left && rect.right<=box.right);
      });
    }))).toBe(true);
    expect(await dialog.evaluate((node)=>{const rect=node.getBoundingClientRect();return rect.left>=0 && rect.right<=innerWidth && rect.top>=0 && rect.bottom<=innerHeight;})).toBe(true);
    await page.locator('[data-action=close-answer]').scrollIntoViewIfNeeded();await expect(page.locator('[data-action=close-answer]')).toBeInViewport();
    await testInfo.attach(`answer-dialog-${width}.png`,{body:await page.screenshot(),contentType:'image/png'});
    await page.locator('[data-action=close-answer]').click();await expect(page.locator('#answer-editor')).toHaveCount(0);
  }
});
