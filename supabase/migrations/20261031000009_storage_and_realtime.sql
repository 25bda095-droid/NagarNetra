-- Storage buckets and Realtime.

-- raw    : private. Original photos and voice notes. Uploaded with signed URLs made by the server.
-- public : blurred, EXIF-stripped WebP photos shown on incident pages.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('raw',    'raw',    false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav']),
  ('public', 'public', true,  2097152,  array['image/webp'])
on conflict (id) do nothing;

-- Stream pipeline steps to the browser (RLS still applies: only the report owner receives them).
alter publication supabase_realtime add table public.pipeline_steps;
