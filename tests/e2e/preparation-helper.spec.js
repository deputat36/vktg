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
  await expect(page.locator('h1')).toBeFocused();await page.locator('#topic-poa > summary').click();await page.locator('#fact-poa-unknown').focus();await page.keyboard.press('ArrowLeft');
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
