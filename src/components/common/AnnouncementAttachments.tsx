import React, { useState } from 'react';
import { Download, ExternalLink, FileText, Maximize2, X } from 'lucide-react';
import type { Announcement } from '../../types/database';

function isSafeHttpUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /^https?:\/\/.+/i.test(url.trim());
}

export const AnnouncementBanner: React.FC<{
  bannerUrl?: string | null;
  title: string;
}> = ({ bannerUrl, title }) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (!isSafeHttpUrl(bannerUrl)) return null;

  return (
    <>
      <div className="group relative mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-950">
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          aria-label={`View banner image for ${title}`}
          className="block w-full text-left focus:outline-none"
        >
          <img
            src={bannerUrl!}
            alt={`${title} announcement banner`}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="max-h-64 w-full object-cover transition-transform duration-300 group-hover:scale-[1.01]"
          />
          <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-lg bg-slate-950/70 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-xs">
            <Maximize2 className="h-3 w-3" />
            <span>View Banner</span>
          </span>
        </button>
      </div>

      {lightboxOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${title} banner preview`}
          onClick={() => setLightboxOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 text-white">
              <p className="truncate text-sm font-semibold">{title}</p>
              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                aria-label="Close banner preview"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex max-h-[80vh] items-center justify-center bg-slate-950 p-2">
              <img
                src={bannerUrl!}
                alt={`${title} full banner`}
                referrerPolicy="no-referrer"
                className="max-h-[76vh] w-auto max-w-full rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const AnnouncementActions: React.FC<{
  item: Pick<Announcement, 'pdf_url' | 'pdf_name' | 'external_url' | 'link_label'>;
}> = ({ item }) => {
  const hasPdf = isSafeHttpUrl(item.pdf_url);
  const hasLink = isSafeHttpUrl(item.external_url);

  if (!hasPdf && !hasLink) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2.5">
      {hasPdf && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
          <FileText className="h-4 w-4 shrink-0 text-red-700 dark:text-red-400" />
          <div className="min-w-0 max-w-[200px] sm:max-w-[260px]">
            <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
              {item.pdf_name || 'Official Notice.pdf'}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">PDF Notice</p>
          </div>
          <div className="flex items-center gap-1.5 pl-1">
            <a
              href={item.pdf_url!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-500"
            >
              <ExternalLink className="h-3 w-3" />
              <span>View PDF</span>
            </a>
            <a
              href={item.pdf_url!}
              download={item.pdf_name || 'notice.pdf'}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Download ${item.pdf_name || 'notice PDF'}`}
              className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Download className="h-3 w-3" />
              <span>Download</span>
            </a>
          </div>
        </div>
      )}

      {hasLink && (
        <a
          href={item.external_url!}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3.5 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-300 dark:hover:bg-teal-900/60"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span>{item.link_label || 'Open Link'}</span>
        </a>
      )}
    </div>
  );
};
