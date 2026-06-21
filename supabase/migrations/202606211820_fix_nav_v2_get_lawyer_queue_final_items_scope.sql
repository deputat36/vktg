-- Fix nav_v2_get_lawyer_queue: final_items is a CTE and is visible only inside
-- the statement where it is declared. The function previously selected items
-- from final_items and then tried to select counts from final_items in a second
-- statement, causing: relation "final_items" does not exist.
--
-- This migration keeps the existing function body and replaces only the broken
-- counts block. Counts are now derived from the already built v_items jsonb array.

do $$
declare
  v_def text;
  v_old text := $old$
  select jsonb_build_object(
    'total', count(*),
    'urgent', count(*) filter (where lawyer_queue = 'urgent'),
    'resubmitted', count(*) filter (where lawyer_queue = 'resubmitted'),
    'rework', count(*) filter (where lawyer_queue = 'rework'),
    'docs', count(*) filter (where lawyer_queue = 'docs'),
    'deposit', count(*) filter (where lawyer_queue = 'deposit'),
    'deal', count(*) filter (where lawyer_queue = 'deal'),
    'active', count(*) filter (where lawyer_queue = 'active'),
    'other', count(*) filter (where lawyer_queue = 'other')
  )
  into v_counts
  from final_items;
$old$;
  v_new text := $new$
  select jsonb_build_object(
    'total', count(*),
    'urgent', count(*) filter (where item->>'lawyer_queue' = 'urgent'),
    'resubmitted', count(*) filter (where item->>'lawyer_queue' = 'resubmitted'),
    'rework', count(*) filter (where item->>'lawyer_queue' = 'rework'),
    'docs', count(*) filter (where item->>'lawyer_queue' = 'docs'),
    'deposit', count(*) filter (where item->>'lawyer_queue' = 'deposit'),
    'deal', count(*) filter (where item->>'lawyer_queue' = 'deal'),
    'active', count(*) filter (where item->>'lawyer_queue' = 'active'),
    'other', count(*) filter (where item->>'lawyer_queue' = 'other')
  )
  into v_counts
  from jsonb_array_elements(coalesce(v_items, '[]'::jsonb)) as item;
$new$;
begin
  select pg_get_functiondef('public.nav_v2_get_lawyer_queue(integer)'::regprocedure)
  into v_def;

  if position(v_old in v_def) > 0 then
    execute replace(v_def, v_old, v_new);
  else
    raise notice 'nav_v2_get_lawyer_queue final_items counts block was not found; migration may already be applied.';
  end if;
end;
$$;
