import { Router } from 'express';
import { getSupabaseAdmin, writeAuditLog } from '../supabaseAdmin.ts';
import { requireAuth, requireTeacher } from '../middleware/auth.ts';
import { uploadAnnouncementMedia, type AnnouncementMediaKind } from '../services/announcementMedia.ts';
import {
  isMissingColumnOrSchemaError,
  mergeTeacherWithMetadata,
  saveTeacherExtendedMetadata,
  type TeacherExtendedMetadata,
} from '../services/teacherProfileCompat.ts';

export const teacherRouter = Router();

teacherRouter.use(requireAuth);
teacherRouter.use(requireTeacher);

const ALLOWED_CATEGORIES = new Set([
  'general',
  'academic',
  'examination',
  'chemistry',
  'security',
  'event',
  'promotion',
  'resource',
]);

const ALLOWED_PRIORITIES = new Set(['normal', 'important', 'urgent']);

// ----------------------------------------------------------------------------
// Teacher Announcements (Publish Links, Promotional Posts & Notices)
// ----------------------------------------------------------------------------
teacherRouter.get('/announcements', async (req, res) => {
  try {
    const ctx = req.authContext!;
    const admin = getSupabaseAdmin();

    const [{ data: announcements, error: annErr }, { data: departments, error: deptErr }] = await Promise.all([
      admin
        .from('announcements')
        .select('*, department:departments(id, name, code)')
        .or(`is_published.eq.true,author_user_id.eq.${ctx.userId}`)
        .order('is_pinned', { ascending: false })
        .order('published_at', { ascending: false })
        .limit(80),
      admin.from('departments').select('*').eq('is_active', true).order('name'),
    ]);

    if (annErr || deptErr) {
      res.status(500).json({ error: annErr?.message || deptErr?.message });
      return;
    }

    res.json({
      announcements: announcements || [],
      departments: departments || [],
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load announcements.' });
  }
});

teacherRouter.post('/announcements/upload-media', async (req, res) => {
  try {
    const ctx = req.authContext!;
    const { kind, contentType, base64Data, fileName } = req.body || {};

    if (kind !== 'pdf' && kind !== 'banner') {
      res.status(400).json({ error: 'Invalid media kind. Expected "pdf" or "banner".' });
      return;
    }

    const uploaded = await uploadAnnouncementMedia({
      userId: ctx.userId,
      kind: kind as AnnouncementMediaKind,
      contentType: String(contentType || ''),
      base64Data: String(base64Data || ''),
      fileName: fileName ? String(fileName) : undefined,
    });

    res.json(uploaded);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Unable to upload announcement media.',
    });
  }
});

teacherRouter.post('/announcements', async (req, res) => {
  try {
    const ctx = req.authContext!;
    const {
      title,
      body,
      category,
      priority,
      targetDepartmentId,
      isPinned,
      externalUrl,
      linkLabel,
      pdfUrl,
      pdfName,
      bannerUrl,
    } = req.body || {};

    const trimmedTitle = String(title || '').trim();
    const trimmedBody = String(body || '').trim();

    if (!trimmedTitle || !trimmedBody) {
      res.status(400).json({ error: 'Announcement title and details are required.' });
      return;
    }

    const safeCategory = ALLOWED_CATEGORIES.has(String(category)) ? String(category) : 'academic';
    const safePriority = ALLOWED_PRIORITIES.has(String(priority)) ? String(priority) : 'normal';
    const cleanedUrl = externalUrl ? String(externalUrl).trim() : null;
    const cleanedLabel = linkLabel ? String(linkLabel).trim().slice(0, 80) : null;
    const cleanedPdfUrl = pdfUrl ? String(pdfUrl).trim() : null;
    const cleanedPdfName = pdfName ? String(pdfName).trim().slice(0, 120) : null;
    const cleanedBannerUrl = bannerUrl ? String(bannerUrl).trim() : null;

    if (cleanedUrl && !/^https?:\/\/.+/i.test(cleanedUrl)) {
      res.status(400).json({ error: 'External link URL must start with http:// or https://.' });
      return;
    }
    if (cleanedPdfUrl && !/^https?:\/\/.+/i.test(cleanedPdfUrl)) {
      res.status(400).json({ error: 'PDF URL must start with http:// or https://.' });
      return;
    }
    if (cleanedBannerUrl && !/^https?:\/\/.+/i.test(cleanedBannerUrl)) {
      res.status(400).json({ error: 'Banner image URL must start with http:// or https://.' });
      return;
    }

    const admin = getSupabaseAdmin();

    const insertPayload: Record<string, unknown> = {
      title: trimmedTitle.slice(0, 200),
      body: trimmedBody.slice(0, 4000),
      category: safeCategory,
      priority: safePriority,
      target_department_id: targetDepartmentId || null,
      author_user_id: ctx.userId,
      author_name: ctx.fullName,
      author_role: 'teacher',
      external_url: cleanedUrl,
      link_label: cleanedUrl ? cleanedLabel || 'Open Link' : null,
      is_pinned: Boolean(isPinned),
      is_published: true,
    };

    if (cleanedPdfUrl) {
      insertPayload.pdf_url = cleanedPdfUrl;
      insertPayload.pdf_name = cleanedPdfName || 'Notice.pdf';
    }
    if (cleanedBannerUrl) {
      insertPayload.banner_url = cleanedBannerUrl;
    }

    const { data: created, error } = await admin
      .from('announcements')
      .insert(insertPayload)
      .select('*, department:departments(id, name, code)')
      .single();

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('pdf_url') || msg.includes('banner_url') || msg.includes('schema cache')) {
        res.status(400).json({
          error:
            'Database migration 008_announcement_media.sql has not been applied yet. Ask an administrator to run it in Supabase SQL Editor.',
          needsMigration: true,
        });
        return;
      }
      res.status(400).json({ error: error.message });
      return;
    }

    await writeAuditLog({
      actorUserId: ctx.userId,
      actorStudentId: ctx.studentId,
      actorRole: 'teacher',
      action: 'TEACHER_ANNOUNCEMENT_PUBLISHED',
      targetType: 'announcement',
      targetId: created.id,
      summary: `Teacher ${ctx.studentId} (${ctx.fullName}) published "${created.title}"${cleanedUrl ? ' with external link' : ''}${cleanedPdfUrl ? ' + PDF notice' : ''}${cleanedBannerUrl ? ' + banner' : ''}.`,
      metadata: {
        category: safeCategory,
        externalUrl: cleanedUrl,
        pdfUrl: cleanedPdfUrl,
        bannerUrl: cleanedBannerUrl,
      },
      ipAddress: ctx.ipAddress,
    });

    res.status(201).json({ announcement: created });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to publish announcement.' });
  }
});

teacherRouter.delete('/announcements/:id', async (req, res) => {
  try {
    const ctx = req.authContext!;
    const announcementId = req.params.id;
    const admin = getSupabaseAdmin();

    const { data: existing } = await admin
      .from('announcements')
      .select('id, title, author_user_id')
      .eq('id', announcementId)
      .maybeSingle();

    if (!existing) {
      res.status(404).json({ error: 'Announcement not found.' });
      return;
    }

    if (existing.author_user_id !== ctx.userId) {
      res.status(403).json({ error: 'Teachers can only delete announcements they authored.' });
      return;
    }

    const { error: delErr } = await admin.from('announcements').delete().eq('id', announcementId);
    if (delErr) {
      res.status(400).json({ error: delErr.message });
      return;
    }

    await writeAuditLog({
      actorUserId: ctx.userId,
      actorStudentId: ctx.studentId,
      actorRole: 'teacher',
      action: 'TEACHER_ANNOUNCEMENT_DELETED',
      targetType: 'announcement',
      targetId: announcementId,
      summary: `Teacher ${ctx.studentId} deleted announcement "${existing.title}".`,
      ipAddress: ctx.ipAddress,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete announcement.' });
  }
});

// ----------------------------------------------------------------------------
// Student Profile Inspection (Categorized by Department)
// ----------------------------------------------------------------------------
teacherRouter.get('/students', async (_req, res) => {
  try {
    const admin = getSupabaseAdmin();
    const [
      { data: studentRows, error: stuErr },
      { data: profileRows, error: profErr },
      { data: deptRows, error: deptErr },
      { data: courseRows, error: courseErr },
      { data: batchRows, error: batchErr },
    ] = await Promise.all([
      admin
        .from('students')
        .select(
          '*, department:departments(id, code, name, faculty_area), course:courses(id, code, name, degree_level), batch:batches(id, name, admission_year, graduation_year, current_semester, section)'
        )
        .order('full_name'),
      admin
        .from('profiles')
        .select(
          'id, display_name, personal_email, phone, bio, avatar_url, hometown, academic_interests, last_login_at'
        ),
      admin.from('departments').select('*').eq('is_active', true).order('name'),
      admin.from('courses').select('*').eq('is_active', true).order('name'),
      admin.from('batches').select('*').eq('is_active', true).order('admission_year', { ascending: false }),
    ]);

    if (stuErr || profErr || deptErr || courseErr || batchErr) {
      res.status(500).json({
        error: stuErr?.message || profErr?.message || deptErr?.message || courseErr?.message || batchErr?.message,
      });
      return;
    }

    const profileMap = new Map((profileRows || []).map((p) => [p.id, p]));
    const entries = (studentRows || []).map((s) => ({
      student: s,
      profile: profileMap.get(s.user_id) || null,
    }));

    res.json({
      entries,
      departments: deptRows || [],
      courses: courseRows || [],
      batches: batchRows || [],
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load student profiles.' });
  }
});

// ----------------------------------------------------------------------------
// Teacher Professional Profile Management
// ----------------------------------------------------------------------------
teacherRouter.put('/profile', async (req, res) => {
  try {
    const ctx = req.authContext!;
    const {
      honorific,
      fullName,
      designation,
      specialization,
      qualification,
      experienceYears,
      subjectsTaught,
      researchAreas,
      officeLocation,
      officeHours,
      personalEmail,
      phone,
      websiteUrl,
      publicationsSummary,
      bio,
    } = req.body || {};

    const trimmedName = String(fullName || '').trim();
    const trimmedDesignation = String(designation || '').trim();
    const cleanedHonorific = honorific ? String(honorific).trim().slice(0, 24) : null;

    if (!trimmedName || !trimmedDesignation) {
      res.status(400).json({ error: 'Full name and designation are required.' });
      return;
    }

    const cleanedWebsite = websiteUrl ? String(websiteUrl).trim() : null;
    if (cleanedWebsite && !/^https?:\/\/.+/i.test(cleanedWebsite)) {
      res.status(400).json({ error: 'Website / Google Scholar URL must start with http:// or https://.' });
      return;
    }

    const parsedExp =
      experienceYears !== undefined && experienceYears !== null && String(experienceYears).trim() !== ''
        ? Math.max(0, Math.min(70, Math.floor(Number(experienceYears))))
        : null;

    const normalizeTagArray = (input: unknown): string[] => {
      if (Array.isArray(input)) {
        return input
          .map((s) => String(s).trim())
          .filter(Boolean)
          .slice(0, 20);
      }
      if (typeof input === 'string') {
        return input
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 20);
      }
      return [];
    };

    const admin = getSupabaseAdmin();
    const nowIso = new Date().toISOString();
    const baseUpdates: Record<string, unknown> = {
      full_name: trimmedName.slice(0, 140),
      designation: trimmedDesignation.slice(0, 120),
      specialization: specialization ? String(specialization).trim().slice(0, 200) : null,
      personal_email: personalEmail ? String(personalEmail).trim().toLowerCase() : null,
      phone: phone ? String(phone).trim().slice(0, 40) : null,
    };

    const extended007: Omit<TeacherExtendedMetadata, 'honorific'> = {
      qualification: qualification ? String(qualification).trim().slice(0, 200) : null,
      experience_years: Number.isNaN(parsedExp) ? null : parsedExp,
      subjects_taught: normalizeTagArray(subjectsTaught),
      research_areas: normalizeTagArray(researchAreas),
      office_location: officeLocation ? String(officeLocation).trim().slice(0, 160) : null,
      office_hours: officeHours ? String(officeHours).trim().slice(0, 160) : null,
      website_url: cleanedWebsite,
      publications_summary: publicationsSummary
        ? String(publicationsSummary).trim().slice(0, 2500)
        : null,
      bio: bio ? String(bio).trim().slice(0, 2500) : null,
      profile_completed: true,
      profile_updated_at: nowIso,
    };

    const fullUpdates: Record<string, unknown> = {
      ...baseUpdates,
      ...extended007,
    };
    if (honorific !== undefined) {
      fullUpdates.honorific = cleanedHonorific;
    }

    let { data: updated, error } = await admin
      .from('teachers')
      .update(fullUpdates)
      .eq('user_id', ctx.userId)
      .select('*, department:departments(id, code, name, faculty_area)')
      .single();

    if (error && isMissingColumnOrSchemaError(error.message)) {
      const lowerMsg = (error.message || '').toLowerCase();
      let savedUserMeta: Record<string, unknown> | null = null;

      // Always keep extended fields synced in auth user_metadata if DB columns 007/009 are missing
      const metaPayload: TeacherExtendedMetadata = {
        ...extended007,
        ...(honorific !== undefined ? { honorific: cleanedHonorific } : {}),
      };

      // If only 009 honorific column was missing, still try saving 007 columns in public.teachers
      if (lowerMsg.includes('honorific') && !lowerMsg.includes('qualification')) {
        const retry007 = await admin
          .from('teachers')
          .update({ ...baseUpdates, ...extended007 })
          .eq('user_id', ctx.userId)
          .select('*, department:departments(id, code, name, faculty_area)')
          .single();

        if (!retry007.error && retry007.data) {
          savedUserMeta = await saveTeacherExtendedMetadata(admin, ctx.userId, metaPayload);
          updated = mergeTeacherWithMetadata(
            retry007.data as Record<string, unknown>,
            savedUserMeta
          );
          error = null;
        }
      }

      // If 007 columns (or both 007 + 009) are missing, save base 006 columns + metadata fallback
      if (error) {
        const retryBase = await admin
          .from('teachers')
          .update(baseUpdates)
          .eq('user_id', ctx.userId)
          .select('*, department:departments(id, code, name, faculty_area)')
          .single();

        if (retryBase.error || !retryBase.data) {
          res.status(400).json({ error: retryBase.error?.message || 'Unable to save teacher profile.' });
          return;
        }

        savedUserMeta = await saveTeacherExtendedMetadata(admin, ctx.userId, metaPayload);
        updated = mergeTeacherWithMetadata(
          retryBase.data as Record<string, unknown>,
          savedUserMeta
        );
        error = null;
      }
    }

    if (error || !updated) {
      res.status(400).json({ error: error?.message || 'Unable to save teacher profile.' });
      return;
    }

    await writeAuditLog({
      actorUserId: ctx.userId,
      actorStudentId: ctx.studentId,
      actorRole: 'teacher',
      action: 'TEACHER_PROFILE_UPDATED',
      targetType: 'teacher',
      targetId: String(updated.id),
      summary: `Teacher ${ctx.studentId} (${updated.full_name}) updated their professional profile.`,
      ipAddress: ctx.ipAddress,
    });

    res.json({ teacher: updated, message: 'Professional profile saved.' });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to save teacher profile.' });
  }
});

teacherRouter.post('/profile/avatar', async (req, res) => {
  try {
    const ctx = req.authContext!;
    const { contentType, base64Data } = req.body || {};
    const allowedTypes: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };

    const normalizedType = String(contentType || '').toLowerCase();
    const ext = allowedTypes[normalizedType];
    if (!ext) {
      res.status(400).json({ error: 'Only PNG, JPEG, or WebP images are supported.' });
      return;
    }

    const rawBase64 = String(base64Data || '').replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
    if (!rawBase64) {
      res.status(400).json({ error: 'Image file data is required.' });
      return;
    }

    const buffer = Buffer.from(rawBase64, 'base64');
    if (buffer.length === 0 || buffer.length > 2 * 1024 * 1024) {
      res.status(400).json({ error: 'Profile photo must be under 2 MB.' });
      return;
    }

    const admin = getSupabaseAdmin();
    await admin.storage
      .createBucket('avatars', {
        public: true,
        fileSizeLimit: 2097152,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      })
      .catch(() => {});

    const filePath = `teachers/${ctx.userId}/avatar-${Date.now()}.${ext}`;
    const { error: uploadErr } = await admin.storage
      .from('avatars')
      .upload(filePath, buffer, {
        contentType: normalizedType === 'image/jpg' ? 'image/jpeg' : normalizedType,
        upsert: true,
      });

    if (uploadErr) {
      res.status(400).json({ error: uploadErr.message });
      return;
    }

    const { data: urlData } = admin.storage.from('avatars').getPublicUrl(filePath);
    const { data: updated, error: updateErr } = await admin
      .from('teachers')
      .update({ avatar_url: urlData.publicUrl })
      .eq('user_id', ctx.userId)
      .select('*, department:departments(id, code, name, faculty_area)')
      .single();

    if (updateErr) {
      res.status(400).json({ error: updateErr.message });
      return;
    }

    res.json({ avatarUrl: urlData.publicUrl, teacher: updated });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Photo upload failed.' });
  }
});
