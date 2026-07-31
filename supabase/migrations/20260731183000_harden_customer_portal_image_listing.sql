-- Prevent public Storage API listing while keeping public object URLs available.
-- The bucket remains public; admin upload, update, and delete policies are unchanged.

drop policy if exists "public reads customer portal image files"
  on storage.objects;
