-- Publish account data so active sessions on other devices stay in sync.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if to_regclass('public.user_settings') is not null and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'user_settings'
    ) then
      execute 'alter publication supabase_realtime add table public.user_settings';
    end if;

    if to_regclass('public.profiles') is not null and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'profiles'
    ) then
      execute 'alter publication supabase_realtime add table public.profiles';
    end if;
  end if;
end;
$$;
