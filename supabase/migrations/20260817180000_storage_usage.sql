-- Superadmin-only view of Supabase Storage usage per bucket, plus database size.
create or replace function public.get_storage_usage()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_superadmin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  select jsonb_build_object(
    'buckets', coalesce((
      select jsonb_object_agg(bucket_id, total_bytes)
      from (
        select bucket_id, sum(coalesce((metadata->>'size')::bigint, 0)) as total_bytes
        from storage.objects
        group by bucket_id
      ) t
    ), '{}'::jsonb),
    'databaseBytes', pg_database_size(current_database())
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_storage_usage() to authenticated;
