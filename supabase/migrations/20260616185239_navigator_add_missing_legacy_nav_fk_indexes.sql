-- Add missing indexes for legacy Navigator foreign-key columns reported by Supabase Advisor.
-- This migration only touches nav_* tables and does not change data or access logic.

create index if not exists nav_deal_participants_created_by_idx
  on public.nav_deal_participants (created_by);

create index if not exists nav_deal_reviews_user_id_idx
  on public.nav_deal_reviews (user_id);
