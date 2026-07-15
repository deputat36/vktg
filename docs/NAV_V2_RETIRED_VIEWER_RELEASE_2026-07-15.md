# Navigator v2: release retirement роли viewer

Дата: 2026-07-15.

## Репозиторий

- implementation PR: #336;
- merged main: `7632f1c43847b6dde151e418dbba44cac4064d14`;
- Edge Function `nav-invite-user` не менялась;
- production migration source: `supabase/migrations/20260715195732_nav_v2_retire_viewer_assignment.sql`.

## Production

Миграция `20260715195732_nav_v2_retire_viewer_assignment` применена к проекту `ofewxuqfjhamgerwzull`.

После применения подтверждено:

- trigger `nav_v2_profiles_guard_retired_viewer` установлен;
- активный профиль `viewer` блокируется на таблице `nav_user_profiles`;
- `anon` и `authenticated` не могут напрямую вызывать trigger function;
- профилей всего: 5;
- профилей viewer: 0;
- активных viewer: 0;
- сделок: 23;
- задач: 98;
- документов: 198;
- рисков: 53.

Счётчики полностью совпали с pre-migration snapshot. Рабочие данные и назначения сотрудников не изменились.

## Проверки

- SQL DDL и trigger behavior проверены до применения в транзакции с `ROLLBACK`;
- GitHub static, JavaScript, invite/recovery и desktop/mobile viewer regression прошли;
- public browser smoke прошёл;
- authenticated smoke был пропущен из-за отсутствия изолированной среды и не считается выполненной ролевой матрицей;
- security/performance advisors выполнены после DDL;
- новых замечаний, связанных с trigger, не обнаружено;
- сохранились ранее известные предупреждения по публичным SECURITY DEFINER RPC, legacy/performance debt и отключённой leaked-password protection.

## Следующий этап

Защитить новые сделки от сохранения ФИО и телефонов клиентов одновременно в нормализованных колонках, browser draft и `wizard_snapshot`. Исторические записи не очищать без отдельного preview и решения владельца.
