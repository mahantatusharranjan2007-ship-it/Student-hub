import React from 'react';
import { Award, Star } from 'lucide-react';
import {
  getTagTheme,
  ROLE_TIER_SPECS,
} from '../../lib/studentBadges';
import type { AdminTierRole, StudentBadgeInfo, TagColor } from '../../types/database';
import { AvatarThumb } from './AvatarThumb';

export const RoleStarBadge: React.FC<{
  role?: AdminTierRole | null;
  compact?: boolean;
  showLabel?: boolean;
}> = ({ role, compact = false, showLabel = true }) => {
  if (!role) return null;
  const spec = ROLE_TIER_SPECS[role];
  const stars = Array.from({ length: spec.starCount });

  return (
    <span
      title={`${spec.starCount}-Star Premium ${spec.label}`}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border font-semibold ${
        spec.badgeClass
      } ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'}`}
    >
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        {stars.map((_, idx) => (
          <Star
            key={idx}
            className={`${spec.starClass} ${compact ? 'h-2.5 w-2.5' : 'h-3 w-3'}`}
          />
        ))}
      </span>
      {showLabel && <span>{spec.label}</span>}
    </span>
  );
};

export const CustomStudentTagBadge: React.FC<{
  tag?: string | null;
  color?: TagColor | null;
  compact?: boolean;
}> = ({ tag, color, compact = false }) => {
  if (!tag || !tag.trim()) return null;
  const theme = getTagTheme(color);

  return (
    <span
      title={`University Tag: ${tag}`}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border font-semibold ${
        theme.badgeClass
      } ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'}`}
    >
      <Award className={compact ? 'h-2.5 w-2.5 shrink-0' : 'h-3 w-3 shrink-0'} />
      <span className="max-w-[140px] truncate">{tag}</span>
    </span>
  );
};

export const StudentBadgesLine: React.FC<{
  badge?: StudentBadgeInfo | null;
  compact?: boolean;
  className?: string;
}> = ({ badge, compact = false, className = '' }) => {
  if (!badge || (!badge.highestAdminRole && !badge.customTag)) return null;

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {badge.highestAdminRole && (
        <RoleStarBadge role={badge.highestAdminRole} compact={compact} />
      )}
      {badge.customTag && (
        <CustomStudentTagBadge tag={badge.customTag} color={badge.tagColor} compact={compact} />
      )}
    </div>
  );
};

export const AvatarWithBadgeFrame: React.FC<{
  src?: string | null;
  alt: string;
  fallbackText?: string;
  sizeClass?: string;
  roundedClass?: string;
  textClass?: string;
  badge?: StudentBadgeInfo | null;
  unreadDot?: boolean;
  className?: string;
}> = ({
  src,
  alt,
  fallbackText,
  sizeClass = 'h-12 w-12',
  roundedClass = 'rounded-xl',
  textClass = 'text-xs',
  badge,
  unreadDot = false,
  className = '',
}) => {
  const roleSpec = badge?.highestAdminRole ? ROLE_TIER_SPECS[badge.highestAdminRole] : null;
  const tagTheme = badge?.customTag ? getTagTheme(badge.tagColor) : null;

  const ringClass = roleSpec
    ? roleSpec.avatarRingClass
    : tagTheme
      ? tagTheme.avatarRingClass
      : '';

  const cornerClass = roleSpec
    ? roleSpec.cornerClass
    : tagTheme
      ? tagTheme.cornerClass
      : '';

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      <AvatarThumb
        src={src}
        alt={alt}
        fallbackText={fallbackText}
        sizeClass={sizeClass}
        roundedClass={roundedClass}
        textClass={textClass}
        className={ringClass}
      />

      {unreadDot && (
        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-white dark:ring-slate-900" />
      )}

      {(roleSpec || tagTheme) && (
        <span
          title={
            roleSpec
              ? `${roleSpec.starCount}-Star ${roleSpec.label}${badge?.customTag ? ` · ${badge.customTag}` : ''}`
              : badge?.customTag || undefined
          }
          className={`absolute -bottom-1 -right-1 inline-flex items-center justify-center rounded-md border px-1 py-0.5 text-[9px] font-bold leading-none shadow-xs ${cornerClass}`}
        >
          {roleSpec ? (
            <span className="inline-flex items-center gap-0.5" aria-hidden="true">
              {Array.from({ length: roleSpec.starCount }).map((_, idx) => (
                <Star key={idx} className="h-2.5 w-2.5 fill-current" />
              ))}
            </span>
          ) : (
            <Award className="h-2.5 w-2.5" />
          )}
        </span>
      )}
    </div>
  );
};
