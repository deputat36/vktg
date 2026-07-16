from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

migration = (ROOT / "supabase/migrations/20260716064500_nav_v2_correct_mortgage_broker_scope.sql").read_text(encoding="utf-8")
money = (ROOT / "assets/js/nav-v2/spn-money-adaptive-v2.js").read_text(encoding="utf-8")
broker = (ROOT / "assets/js/nav-v2/broker-v2.js").read_text(encoding="utf-8")
correction = (ROOT / "assets/js/nav-v2/broker-scope-correction-v2.js").read_text(encoding="utf-8")
doc = (ROOT / "docs/NAV_V2_MORTGAGE_BROKER_SCOPE_2026-07-16.md").read_text(encoding="utf-8")

required_migration_markers = [
    "v_broker_needed := v_has_mortgage;",
    "Ипотечная консультация и одобрение",
    "подобрать ипотечную программу",
    "has_matcap is true",
    "coalesce(d.has_mortgage, false) is false",
    "d.broker_id is null",
    "t.source = 'auto_broker'",
    "status = 'cancelled'",
    "routing_corrected",
    "Маткапитал без ипотеки не относится к работе ипотечного брокера",
]
for marker in required_migration_markers:
    assert marker in migration, f"missing migration marker: {marker}"

assert "v_broker_needed := v_has_mortgage or public.nav_v2_jsonb_has(v_payments, 'matcap');" in migration, (
    "migration must prove it replaces the legacy matcap broker rule"
)
assert "and not (coalesce(d.wizard_snapshot -> 'deal' -> 'payments', '[]'::jsonb) ? 'mortgage')" in migration
assert "and not (coalesce(d.wizard_snapshot -> 'deal' -> 'payments', '[]'::jsonb) ? 'militaryMortgage')" in migration

required_money_markers = [
    "['mortgage', 'militaryMortgage'].includes(item)",
    "СПН и юрист: условия и оформление сделки",
    "Маткапитал ведут СПН и юрист",
    "Сертификат ведут СПН и юрист",
    "Брокер консультирует, подбирает программу, помогает получить одобрение и обучает СПН",
    "import './broker-scope-correction-v2.js?v=20260716-01';",
]
for marker in required_money_markers:
    assert marker in money, f"missing money-step marker: {marker}"

assert "['mortgage', 'militaryMortgage', 'matcap', 'certificate'].includes(item)" not in money

required_broker_markers = [
    "Очередь ипотечного брокера",
    "консультация клиента и СПН, подбор программы и помощь в получении одобрения банка",
    "Подготовку и оформление сделки ведут СПН и юрист",
    "Брокер не отвечает за оформление маткапитала или сертификата",
]
for marker in required_broker_markers:
    assert marker in broker, f"missing broker workspace marker: {marker}"

required_correction_markers = [
    "Ипотечный брокер не подключается, если ипотеки нет",
    "Кого подключить:\\s*брокер",
    "Маткапитал и сертификаты ведут СПН и юрист",
]
for marker in required_correction_markers:
    assert marker in correction, f"missing legacy correction marker: {marker}"

required_doc_markers = [
    "консультирует клиента и СПН по ипотеке",
    "подбирает подходящую ипотечную программу",
    "обучает СПН работе с ипотечными сценариями",
    "Маткапитал без ипотеки",
    "Сертификат или субсидия без ипотеки",
]
for marker in required_doc_markers:
    assert marker in doc, f"missing documentation marker: {marker}"

print("Navigator v2 mortgage broker scope contract: PASS")
