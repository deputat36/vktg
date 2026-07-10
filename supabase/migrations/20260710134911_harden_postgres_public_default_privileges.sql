alter default privileges for role postgres in schema public revoke select, insert, update, delete, truncate, references, trigger on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated, public;
alter default privileges for role postgres in schema public revoke usage, select, update on sequences from anon, authenticated;
