create index if not exists nav_deal_comments_v2_author_id_idx
  on public.nav_deal_comments_v2 (author_id);

create index if not exists nav_deal_tasks_v2_created_by_idx
  on public.nav_deal_tasks_v2 (created_by);
