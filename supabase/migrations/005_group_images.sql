-- ============================================================================
-- Dharanidhar University Student Hub - Migration 005
-- Group Images (Managed by Administrators)
-- ============================================================================

-- 1. Add image_url column to groups table
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. Allow Super Admins and Batch Admins to upload/update/delete group images
--    under the 'groups/' folder in the public 'avatars' storage bucket
DROP POLICY IF EXISTS "avatars_admin_group_upload" ON storage.objects;
CREATE POLICY "avatars_admin_group_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'groups'
    AND (public.is_super_admin() OR public.is_batch_admin())
  );

DROP POLICY IF EXISTS "avatars_admin_group_update" ON storage.objects;
CREATE POLICY "avatars_admin_group_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'groups'
    AND (public.is_super_admin() OR public.is_batch_admin())
  );

DROP POLICY IF EXISTS "avatars_admin_group_delete" ON storage.objects;
CREATE POLICY "avatars_admin_group_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = 'groups'
    AND (public.is_super_admin() OR public.is_batch_admin())
  );
