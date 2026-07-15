begin;

create or replace function nav_v2_private.nav_v2_sanitize_client_deal_json(p_deal jsonb)
returns jsonb
language sql
immutable
set search_path to 'public', 'nav_v2_private'
as $function$
  select coalesce(p_deal, '{}'::jsonb) - array[
    'sellerName', 'seller_name', 'sellerFullName', 'seller_fio',
    'sellerPhone', 'seller_phone',
    'buyerName', 'buyer_name', 'buyerFullName', 'buyer_fio',
    'buyerPhone', 'buyer_phone',
    'clientEmail', 'client_email'
  ]::text[];
$function$;

comment on function nav_v2_private.nav_v2_sanitize_client_deal_json(jsonb)
is 'Removes direct client names, contacts and legacy aliases from a deal JSON object. Does not inspect professional free-text notes.';

revoke all on function nav_v2_private.nav_v2_sanitize_client_deal_json(jsonb) from public;
revoke all on function nav_v2_private.nav_v2_sanitize_client_deal_json(jsonb) from anon;
revoke all on function nav_v2_private.nav_v2_sanitize_client_deal_json(jsonb) from authenticated;

create or replace function nav_v2_private.nav_v2_neutral_deal_title(p_object_type text, p_address text)
returns text
language sql
immutable
set search_path to 'public', 'nav_v2_private'
as $function$
  select concat_ws(
    ' — ',
    case nullif(trim(coalesce(p_object_type, '')), '')
      when 'flat_mkd' then 'Квартира в МКД'
      when 'flat_ground' then 'Квартира на земле'
      when 'room' then 'Комната'
      when 'share' then 'Доля'
      when 'house_land' then 'Дом с участком'
      when 'house' then 'Дом'
      when 'land' then 'Земельный участок'
      when 'new_building' then 'Новостройка'
      when 'commercial' then 'Коммерческий объект'
      else 'Объект'
    end,
    coalesce(nullif(trim(coalesce(p_address, '')), ''), 'ориентир уточняется')
  );
$function$;

comment on function nav_v2_private.nav_v2_neutral_deal_title(text, text)
is 'Builds a useful title from object type and neutral address/reference without client identity.';

revoke all on function nav_v2_private.nav_v2_neutral_deal_title(text, text) from public;
revoke all on function nav_v2_private.nav_v2_neutral_deal_title(text, text) from anon;
revoke all on function nav_v2_private.nav_v2_neutral_deal_title(text, text) from authenticated;

create or replace function nav_v2_private.nav_v2_guard_client_identifiers()
returns trigger
language plpgsql
set search_path to 'public', 'nav_v2_private'
as $function$
declare
  v_identity_changed boolean := false;
begin
  if tg_op = 'INSERT' then
    new.seller_name := null;
    new.buyer_name := null;
    new.seller_phone := null;
    new.buyer_phone := null;

    if jsonb_typeof(new.wizard_snapshot) = 'object'
       and jsonb_typeof(new.wizard_snapshot->'deal') = 'object' then
      new.wizard_snapshot := jsonb_set(
        new.wizard_snapshot,
        '{deal}',
        nav_v2_private.nav_v2_sanitize_client_deal_json(new.wizard_snapshot->'deal'),
        true
      );
    end if;

    if jsonb_typeof(new.deal_summary) = 'object' then
      new.deal_summary := nav_v2_private.nav_v2_sanitize_client_deal_json(new.deal_summary);
    end if;

    new.title := nav_v2_private.nav_v2_neutral_deal_title(new.object_type, new.address);
    return new;
  end if;

  if new.seller_name is distinct from old.seller_name then
    new.seller_name := null;
    v_identity_changed := true;
  end if;
  if new.buyer_name is distinct from old.buyer_name then
    new.buyer_name := null;
    v_identity_changed := true;
  end if;
  if new.seller_phone is distinct from old.seller_phone then
    new.seller_phone := null;
    v_identity_changed := true;
  end if;
  if new.buyer_phone is distinct from old.buyer_phone then
    new.buyer_phone := null;
    v_identity_changed := true;
  end if;

  if new.wizard_snapshot is distinct from old.wizard_snapshot
     and jsonb_typeof(new.wizard_snapshot) = 'object'
     and jsonb_typeof(new.wizard_snapshot->'deal') = 'object' then
    new.wizard_snapshot := jsonb_set(
      new.wizard_snapshot,
      '{deal}',
      nav_v2_private.nav_v2_sanitize_client_deal_json(new.wizard_snapshot->'deal'),
      true
    );
  end if;

  if new.deal_summary is distinct from old.deal_summary
     and jsonb_typeof(new.deal_summary) = 'object' then
    new.deal_summary := nav_v2_private.nav_v2_sanitize_client_deal_json(new.deal_summary);
  end if;

  if v_identity_changed then
    new.title := nav_v2_private.nav_v2_neutral_deal_title(new.object_type, new.address);
  end if;

  return new;
end;
$function$;

comment on function nav_v2_private.nav_v2_guard_client_identifiers()
is 'Minimizes every new deal. On historical rows it sanitizes only identity or JSON fields explicitly changed by the current write; unrelated edits do not silently clean history.';

revoke all on function nav_v2_private.nav_v2_guard_client_identifiers() from public;
revoke all on function nav_v2_private.nav_v2_guard_client_identifiers() from anon;
revoke all on function nav_v2_private.nav_v2_guard_client_identifiers() from authenticated;

drop trigger if exists nav_v2_deals_guard_client_identifiers on public.nav_deals_v2;
create trigger nav_v2_deals_guard_client_identifiers
before insert or update of seller_name, buyer_name, seller_phone, buyer_phone, wizard_snapshot, deal_summary
on public.nav_deals_v2
for each row
execute function nav_v2_private.nav_v2_guard_client_identifiers();

do $migration$
begin
  if to_regprocedure('nav_v2_private.nav_v2_save_wizard_result_legacy_20260715(jsonb)') is null then
    if to_regprocedure('public.nav_v2_save_wizard_result(jsonb)') is null then
      raise exception 'Expected public.nav_v2_save_wizard_result(jsonb) before minimization wrapper';
    end if;
    execute 'alter function public.nav_v2_save_wizard_result(jsonb) set schema nav_v2_private';
    execute 'alter function nav_v2_private.nav_v2_save_wizard_result(jsonb) rename to nav_v2_save_wizard_result_legacy_20260715';
  end if;
end;
$migration$;

revoke all on function nav_v2_private.nav_v2_save_wizard_result_legacy_20260715(jsonb) from public;
revoke all on function nav_v2_private.nav_v2_save_wizard_result_legacy_20260715(jsonb) from anon;
revoke all on function nav_v2_private.nav_v2_save_wizard_result_legacy_20260715(jsonb) from authenticated;

create or replace function public.nav_v2_save_wizard_result(p_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'nav_v2_private'
as $function$
declare
  v_sanitized jsonb := coalesce(p_result, '{}'::jsonb);
  v_saved jsonb;
  v_deal_id uuid;
  v_title text;
begin
  if jsonb_typeof(v_sanitized) = 'object'
     and jsonb_typeof(v_sanitized->'deal') = 'object' then
    v_sanitized := jsonb_set(
      v_sanitized,
      '{deal}',
      nav_v2_private.nav_v2_sanitize_client_deal_json(v_sanitized->'deal'),
      true
    );
  end if;

  v_saved := nav_v2_private.nav_v2_save_wizard_result_legacy_20260715(v_sanitized);
  v_deal_id := nullif(v_saved->>'id', '')::uuid;

  if v_deal_id is not null then
    select title into v_title
    from public.nav_deals_v2
    where id = v_deal_id and created_by = auth.uid();
  end if;

  return coalesce(v_saved, '{}'::jsonb)
    || jsonb_build_object(
      'title', coalesce(v_title, v_saved->>'title'),
      'client_identifiers_minimized', true
    );
end;
$function$;

comment on function public.nav_v2_save_wizard_result(jsonb)
is 'Authenticated wizard save wrapper. Preserves validated legacy deal-generation logic while removing direct client identifiers before persistence.';

revoke all on function public.nav_v2_save_wizard_result(jsonb) from public;
revoke all on function public.nav_v2_save_wizard_result(jsonb) from anon;
grant execute on function public.nav_v2_save_wizard_result(jsonb) to authenticated;

create or replace function public.nav_v2_update_deal_parties(
  p_deal_id uuid,
  p_seller_name text default null::text,
  p_buyer_name text default null::text,
  p_seller_phone text default null::text,
  p_buyer_phone text default null::text,
  p_address text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'nav_v2_private'
as $function$
declare
  v_uid uuid := auth.uid();
  v_address text := nullif(trim(coalesce(p_address, '')), '');
  v_object_type text;
  v_title text;
  v_rows integer := 0;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if p_deal_id is null then
    raise exception 'Не указана сделка' using errcode = '22023';
  end if;

  if not nav_v2_private.nav_v2_can_edit_deal(p_deal_id, v_uid) then
    raise exception 'Нет прав редактировать ориентир объекта' using errcode = '42501';
  end if;

  select object_type into v_object_type
  from public.nav_deals_v2
  where id = p_deal_id;

  if not found then
    raise exception 'Сделка не найдена' using errcode = 'P0002';
  end if;

  v_title := nav_v2_private.nav_v2_neutral_deal_title(v_object_type, v_address);

  update public.nav_deals_v2
  set address = v_address,
      title = v_title,
      updated_at = now()
  where id = p_deal_id;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Сделка не найдена' using errcode = 'P0002';
  end if;

  insert into public.nav_deal_events_v2 (deal_id, actor_id, event_type, event_title, event_data)
  values (
    p_deal_id,
    v_uid,
    'object_reference_updated',
    'Ориентир объекта обновлён',
    jsonb_build_object('address', v_address, 'title', v_title, 'client_identifiers_minimized', true)
  );

  return jsonb_build_object(
    'ok', true,
    'deal_id', p_deal_id,
    'title', v_title,
    'address', v_address,
    'client_identifiers_minimized', true
  );
end;
$function$;

comment on function public.nav_v2_update_deal_parties(uuid, text, text, text, text, text)
is 'Compatibility RPC: direct client identity arguments are ignored; only a neutral object reference and title can be updated.';

revoke all on function public.nav_v2_update_deal_parties(uuid, text, text, text, text, text) from public;
revoke all on function public.nav_v2_update_deal_parties(uuid, text, text, text, text, text) from anon;
grant execute on function public.nav_v2_update_deal_parties(uuid, text, text, text, text, text) to authenticated;

commit;
