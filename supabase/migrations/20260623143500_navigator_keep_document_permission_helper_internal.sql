revoke all on function public.nav_v2_can_change_document_status(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.nav_v2_can_change_document_status(uuid, text, uuid) to service_role;
