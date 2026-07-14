-- Navigator v2: prevent a second exact wizard payload from creating a duplicate deal.
--
-- Scope:
-- - only INSERT into nav_deals_v2;
-- - only rows with created_by and a JSON object wizard_snapshot;
-- - same creator + exact jsonb payload within two minutes;
-- - no cleanup or mutation of existing deals.

create or replace function public.nav_v2_block_exact_recent_wizard_duplicate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_deal_id uuid;
  v_lock_key bigint;
begin
  if new.created_by is null
     or new.wizard_snapshot is null
     or jsonb_typeof(new.wizard_snapshot) <> 'object'
     or not (new.wizard_snapshot ? 'deal') then
    return new;
  end if;

  -- Serialize only identical payloads from the same creator. Hash collisions can
  -- only cause extra waiting; the exact jsonb equality below decides blocking.
  v_lock_key := pg_catalog.hashtextextended(
    new.created_by::text || ':' || pg_catalog.md5(new.wizard_snapshot::text),
    0
  );
  perform pg_catalog.pg_advisory_xact_lock(v_lock_key);

  select d.id
    into v_existing_deal_id
  from public.nav_deals_v2 d
  where d.created_by = new.created_by
    and d.wizard_snapshot = new.wizard_snapshot
    and d.created_at >= pg_catalog.clock_timestamp() - interval '2 minutes'
  order by d.created_at desc, d.id desc
  limit 1;

  if v_existing_deal_id is not null then
    raise exception using
      errcode = 'P0001',
      message = 'Идентичная заявка уже создана из мастера',
      detail = jsonb_build_object(
        'code', 'NAV_V2_EXACT_WIZARD_DUPLICATE',
        'existing_deal_id', v_existing_deal_id
      )::text,
      hint = 'Откройте существующую карточку вместо повторного сохранения.';
  end if;

  return new;
end;
$$;

alter function public.nav_v2_block_exact_recent_wizard_duplicate() owner to postgres;
revoke all on function public.nav_v2_block_exact_recent_wizard_duplicate() from public, anon, authenticated;

drop trigger if exists nav_v2_block_exact_recent_wizard_duplicate on public.nav_deals_v2;
create trigger nav_v2_block_exact_recent_wizard_duplicate
before insert on public.nav_deals_v2
for each row
when (new.wizard_snapshot is not null)
execute function public.nav_v2_block_exact_recent_wizard_duplicate();

comment on function public.nav_v2_block_exact_recent_wizard_duplicate() is
  'Blocks a second exact wizard payload by the same creator within two minutes. Existing rows are never changed.';
