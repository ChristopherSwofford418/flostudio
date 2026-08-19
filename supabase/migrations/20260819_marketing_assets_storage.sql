-- Real creative files belong in a user-scoped folder inside the shared media bucket.
insert into storage.buckets (id, name, public, file_size_limit)
values ('marketing-assets', 'marketing-assets', true, 26214400)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "FloStudio users upload their media" on storage.objects;
create policy "FloStudio users upload their media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'marketing-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "FloStudio users read their media" on storage.objects;
create policy "FloStudio users read their media"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'marketing-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "FloStudio users update their media" on storage.objects;
create policy "FloStudio users update their media"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'marketing-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'marketing-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "FloStudio users delete their media" on storage.objects;
create policy "FloStudio users delete their media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'marketing-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
