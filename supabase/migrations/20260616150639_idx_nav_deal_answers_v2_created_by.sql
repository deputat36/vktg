-- Navigator v2: index FK-like user reference used by answers audit/ownership.
-- Applied in Supabase on 2026-06-16.

create index if not exists nav_deal_answers_v2_created_by_idx
  on public.nav_deal_answers_v2 (created_by);
