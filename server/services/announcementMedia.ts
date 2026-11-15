import { getSupabaseAdmin } from '../supabaseAdmin.ts';

export type AnnouncementMediaKind = 'pdf' | 'banner';

const BUCKET_NAME = 'announcements';
const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_BANNER_BYTES = 4 * 1024 * 1024; // 4 MB

const ALLOWED_IMAGE_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function sanitizeBaseName(fileName: string | undefined, fallback: string): string {
  const base = (fileName || fallback)
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
  return base || fallback;
}

async function ensureAnnouncementsBucket() {
  const admin = getSupabaseAdmin();
  const bucketOptions = {
    public: true,
    fileSizeLimit: MAX_PDF_BYTES,
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  };

  const { error: createErr } = await admin.storage.createBucket(BUCKET_NAME, bucketOptions);
  if (createErr) {
    // Update existing bucket settings if it already exists so PDF and banner limits apply
    await admin.storage.updateBucket(BUCKET_NAME, bucketOptions).catch(() => {});
  }
}

export async function uploadAnnouncementMedia(params: {
  userId: string;
  kind: AnnouncementMediaKind;
  contentType: string;
  base64Data: string;
  fileName?: string;
}): Promise<{ publicUrl: string; fileName: string; sizeBytes: number }> {
  const { userId, kind, contentType, base64Data, fileName } = params;
  const normalizedType = String(contentType || '').trim().toLowerCase();

  await ensureAnnouncementsBucket();
  const admin = getSupabaseAdmin();
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, '') || 'staff';

  if (kind === 'pdf') {
    if (normalizedType !== 'application/pdf') {
      throw new Error('Only PDF files (.pdf) are supported for notice uploads.');
    }

    const rawBase64 = String(base64Data || '').replace(/^data:application\/pdf;base64,/i, '');
    if (!rawBase64) {
      throw new Error('PDF file data is required.');
    }

    const buffer = Buffer.from(rawBase64, 'base64');
    if (buffer.length === 0) {
      throw new Error('Uploaded PDF file is empty.');
    }
    if (buffer.length > MAX_PDF_BYTES) {
      throw new Error('Notice PDF must be 10 MB or smaller.');
    }
    if (buffer.subarray(0, 4).toString('utf8') !== '%PDF') {
      throw new Error('The selected file is not a valid PDF document.');
    }

    const cleanBase = sanitizeBaseName(fileName, 'university-notice');
    const finalFileName = `${cleanBase}.pdf`;
    const filePath = `pdfs/${safeUser}/${Date.now()}-${finalFileName}`;

    const { error: uploadErr } = await admin.storage.from(BUCKET_NAME).upload(filePath, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

    if (uploadErr) {
      throw new Error(uploadErr.message);
    }

    const { data: urlData } = admin.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    return {
      publicUrl: urlData.publicUrl,
      fileName: finalFileName,
      sizeBytes: buffer.length,
    };
  }

  if (kind === 'banner') {
    const ext = ALLOWED_IMAGE_MIME[normalizedType];
    if (!ext) {
      throw new Error('Banner picture must be PNG, JPEG, or WebP.');
    }

    const rawBase64 = String(base64Data || '').replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/i, '');
    if (!rawBase64) {
      throw new Error('Banner image data is required.');
    }

    const buffer = Buffer.from(rawBase64, 'base64');
    if (buffer.length === 0) {
      throw new Error('Uploaded banner image is empty.');
    }
    if (buffer.length > MAX_BANNER_BYTES) {
      throw new Error('Banner picture must be 4 MB or smaller.');
    }

    const cleanBase = sanitizeBaseName(fileName, 'announcement-banner');
    const finalFileName = `${cleanBase}.${ext}`;
    const filePath = `banners/${safeUser}/${Date.now()}-${cleanBase}.${ext}`;

    const { error: uploadErr } = await admin.storage.from(BUCKET_NAME).upload(filePath, buffer, {
      contentType: normalizedType === 'image/jpg' ? 'image/jpeg' : normalizedType,
      upsert: true,
    });

    if (uploadErr) {
      throw new Error(uploadErr.message);
    }

    const { data: urlData } = admin.storage.from(BUCKET_NAME).getPublicUrl(filePath);
    return {
      publicUrl: urlData.publicUrl,
      fileName: finalFileName,
      sizeBytes: buffer.length,
    };
  }

  throw new Error('Unsupported media upload type.');
}
