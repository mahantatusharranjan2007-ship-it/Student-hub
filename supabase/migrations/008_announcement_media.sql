-- ============================================================================
-- Dharanidhar University Student Hub - Announcement PDF Notice & Banner Image
-- Migration 008: Adds pdf_url, pdf_name, and banner_url columns to announcements
-- ============================================================================

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS pdf_name TEXT,
  ADD COLUMN IF NOT EXISTS banner_url TEXT;

NOTIFY pgrst, 'reload schema';
