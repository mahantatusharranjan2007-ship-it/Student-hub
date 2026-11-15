import type { AdminTierRole, StudentBadgeInfo, TagColor } from '../types/database';

export const CUSTOM_TAG_PRESETS = [
  'President',
  'Vice President',
  'General Secretary',
  'Class Representative',
  'Cultural Secretary',
  'Sports Captain',
  'Technical Lead',
  'Lab Coordinator',
  'NSS Lead',
  'Gold Medalist',
] as const;

export interface TagThemeSpec {
  id: TagColor;
  label: string;
  swatchClass: string;
  badgeClass: string;
  cardClass: string;
  avatarRingClass: string;
  cornerClass: string;
  bubbleBorderClass: string;
}

export const TAG_COLOR_THEMES: Record<TagColor, TagThemeSpec> = {
  gold: {
    id: 'gold',
    label: 'Royal Gold',
    swatchClass: 'bg-amber-500',
    badgeClass:
      'border-amber-300/90 bg-amber-50 text-amber-950 dark:border-amber-500/50 dark:bg-amber-950/60 dark:text-amber-200',
    cardClass:
      'border-amber-300/80 bg-gradient-to-br from-amber-50/50 via-white to-white dark:border-amber-500/40 dark:from-amber-950/25 dark:via-slate-900 dark:to-slate-900',
    avatarRingClass: 'ring-2 ring-amber-400/85 ring-offset-2 ring-offset-white dark:ring-amber-500/75 dark:ring-offset-slate-900',
    cornerClass: 'bg-amber-500 text-white border-white dark:border-slate-900',
    bubbleBorderClass: 'border-amber-300/80 dark:border-amber-500/40',
  },
  violet: {
    id: 'violet',
    label: 'Imperial Violet',
    swatchClass: 'bg-violet-600',
    badgeClass:
      'border-violet-300/90 bg-violet-50 text-violet-950 dark:border-violet-500/50 dark:bg-violet-950/60 dark:text-violet-200',
    cardClass:
      'border-violet-300/80 bg-gradient-to-br from-violet-50/50 via-white to-white dark:border-violet-500/40 dark:from-violet-950/25 dark:via-slate-900 dark:to-slate-900',
    avatarRingClass: 'ring-2 ring-violet-500/80 ring-offset-2 ring-offset-white dark:ring-violet-400/75 dark:ring-offset-slate-900',
    cornerClass: 'bg-violet-600 text-white border-white dark:border-slate-900',
    bubbleBorderClass: 'border-violet-300/80 dark:border-violet-500/40',
  },
  teal: {
    id: 'teal',
    label: 'University Teal',
    swatchClass: 'bg-teal-700',
    badgeClass:
      'border-teal-300/90 bg-teal-50 text-teal-950 dark:border-teal-500/50 dark:bg-teal-950/60 dark:text-teal-200',
    cardClass:
      'border-teal-300/80 bg-gradient-to-br from-teal-50/50 via-white to-white dark:border-teal-500/40 dark:from-teal-950/25 dark:via-slate-900 dark:to-slate-900',
    avatarRingClass: 'ring-2 ring-teal-600/80 ring-offset-2 ring-offset-white dark:ring-teal-400/75 dark:ring-offset-slate-900',
    cornerClass: 'bg-teal-700 text-white border-white dark:border-slate-900',
    bubbleBorderClass: 'border-teal-300/80 dark:border-teal-500/40',
  },
  indigo: {
    id: 'indigo',
    label: 'Sapphire Indigo',
    swatchClass: 'bg-indigo-600',
    badgeClass:
      'border-indigo-300/90 bg-indigo-50 text-indigo-950 dark:border-indigo-500/50 dark:bg-indigo-950/60 dark:text-indigo-200',
    cardClass:
      'border-indigo-300/80 bg-gradient-to-br from-indigo-50/50 via-white to-white dark:border-indigo-500/40 dark:from-indigo-950/25 dark:via-slate-900 dark:to-slate-900',
    avatarRingClass: 'ring-2 ring-indigo-500/80 ring-offset-2 ring-offset-white dark:ring-indigo-400/75 dark:ring-offset-slate-900',
    cornerClass: 'bg-indigo-600 text-white border-white dark:border-slate-900',
    bubbleBorderClass: 'border-indigo-300/80 dark:border-indigo-500/40',
  },
  rose: {
    id: 'rose',
    label: 'Crimson Rose',
    swatchClass: 'bg-rose-600',
    badgeClass:
      'border-rose-300/90 bg-rose-50 text-rose-950 dark:border-rose-500/50 dark:bg-rose-950/60 dark:text-rose-200',
    cardClass:
      'border-rose-300/80 bg-gradient-to-br from-rose-50/50 via-white to-white dark:border-rose-500/40 dark:from-rose-950/25 dark:via-slate-900 dark:to-slate-900',
    avatarRingClass: 'ring-2 ring-rose-500/80 ring-offset-2 ring-offset-white dark:ring-rose-400/75 dark:ring-offset-slate-900',
    cornerClass: 'bg-rose-600 text-white border-white dark:border-slate-900',
    bubbleBorderClass: 'border-rose-300/80 dark:border-rose-500/40',
  },
};

export interface RoleTierSpec {
  role: AdminTierRole;
  starCount: 1 | 2 | 3;
  label: string;
  shortLabel: string;
  badgeClass: string;
  starClass: string;
  cardClass: string;
  avatarRingClass: string;
  cornerClass: string;
  bubbleBorderClass: string;
}

export const ROLE_TIER_SPECS: Record<AdminTierRole, RoleTierSpec> = {
  super_admin: {
    role: 'super_admin',
    starCount: 3,
    label: 'Super Admin',
    shortLabel: 'Super Admin',
    badgeClass:
      'border-amber-400/90 bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-100/90 text-amber-950 shadow-xs dark:border-amber-500/55 dark:from-amber-950/70 dark:via-amber-900/50 dark:to-amber-950/70 dark:text-amber-200',
    starClass: 'fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400',
    cardClass:
      'border-amber-300/90 bg-gradient-to-br from-amber-50/65 via-white to-white dark:border-amber-500/45 dark:from-amber-950/30 dark:via-slate-900 dark:to-slate-900',
    avatarRingClass:
      'ring-2 ring-amber-400 ring-offset-2 ring-offset-white dark:ring-amber-500 dark:ring-offset-slate-900',
    cornerClass: 'bg-amber-500 text-white border-white dark:border-slate-900',
    bubbleBorderClass: 'border-amber-300 dark:border-amber-500/50',
  },
  batch_admin: {
    role: 'batch_admin',
    starCount: 2,
    label: 'Batch Admin',
    shortLabel: 'Batch Admin',
    badgeClass:
      'border-emerald-400/85 bg-gradient-to-r from-emerald-50 to-teal-50/90 text-emerald-950 shadow-xs dark:border-emerald-500/50 dark:from-emerald-950/65 dark:to-teal-950/55 dark:text-emerald-200',
    starClass: 'fill-emerald-600 text-emerald-600 dark:fill-emerald-400 dark:text-emerald-400',
    cardClass:
      'border-emerald-300/85 bg-gradient-to-br from-emerald-50/55 via-white to-white dark:border-emerald-500/40 dark:from-emerald-950/25 dark:via-slate-900 dark:to-slate-900',
    avatarRingClass:
      'ring-2 ring-emerald-500 ring-offset-2 ring-offset-white dark:ring-emerald-400 dark:ring-offset-slate-900',
    cornerClass: 'bg-emerald-600 text-white border-white dark:border-slate-900',
    bubbleBorderClass: 'border-emerald-300 dark:border-emerald-500/45',
  },
  moderator: {
    role: 'moderator',
    starCount: 1,
    label: 'Moderator',
    shortLabel: 'Moderator',
    badgeClass:
      'border-sky-400/85 bg-gradient-to-r from-sky-50 to-indigo-50/80 text-sky-950 shadow-xs dark:border-sky-500/50 dark:from-sky-950/65 dark:to-indigo-950/55 dark:text-sky-200',
    starClass: 'fill-sky-600 text-sky-600 dark:fill-sky-400 dark:text-sky-400',
    cardClass:
      'border-sky-300/85 bg-gradient-to-br from-sky-50/55 via-white to-white dark:border-sky-500/40 dark:from-sky-950/25 dark:via-slate-900 dark:to-slate-900',
    avatarRingClass:
      'ring-2 ring-sky-500 ring-offset-2 ring-offset-white dark:ring-sky-400 dark:ring-offset-slate-900',
    cornerClass: 'bg-sky-600 text-white border-white dark:border-slate-900',
    bubbleBorderClass: 'border-sky-300 dark:border-sky-500/45',
  },
};

export function getTagTheme(color?: TagColor | null): TagThemeSpec {
  if (color && color in TAG_COLOR_THEMES) {
    return TAG_COLOR_THEMES[color];
  }
  return TAG_COLOR_THEMES.gold;
}

export function getUniqueCardSurfaceClass(badge?: StudentBadgeInfo | null): string {
  if (!badge) {
    return 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';
  }
  if (badge.highestAdminRole) {
    return ROLE_TIER_SPECS[badge.highestAdminRole].cardClass;
  }
  if (badge.customTag) {
    return getTagTheme(badge.tagColor).cardClass;
  }
  return 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';
}

export function getUniqueRowAccentClass(badge?: StudentBadgeInfo | null): string {
  if (!badge) return '';
  if (badge.highestAdminRole === 'super_admin') {
    return 'bg-amber-50/35 dark:bg-amber-950/15';
  }
  if (badge.highestAdminRole === 'batch_admin') {
    return 'bg-emerald-50/30 dark:bg-emerald-950/15';
  }
  if (badge.highestAdminRole === 'moderator') {
    return 'bg-sky-50/30 dark:bg-sky-950/15';
  }
  if (badge.customTag) {
    return 'bg-violet-50/25 dark:bg-violet-950/15';
  }
  return '';
}

export function getUniqueMessageBubbleClass(
  badge: StudentBadgeInfo | null | undefined,
  isMine: boolean
): string {
  if (isMine) {
    return 'bg-teal-700 text-white dark:bg-teal-600';
  }
  if (badge?.highestAdminRole) {
    return `border ${ROLE_TIER_SPECS[badge.highestAdminRole].bubbleBorderClass} bg-white text-slate-900 shadow-xs dark:bg-slate-950 dark:text-slate-100`;
  }
  if (badge?.customTag) {
    return `border ${getTagTheme(badge.tagColor).bubbleBorderClass} bg-white text-slate-900 shadow-xs dark:bg-slate-950 dark:text-slate-100`;
  }
  return 'border border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100';
}
