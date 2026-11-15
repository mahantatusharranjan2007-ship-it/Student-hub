import React, { useEffect, useState } from 'react';
import { Users } from 'lucide-react';

interface AvatarThumbProps {
  src?: string | null;
  alt: string;
  fallbackText?: string;
  fallbackIcon?: 'users' | 'initials';
  sizeClass?: string;
  roundedClass?: string;
  textClass?: string;
  className?: string;
}

export function getInitials(name: string, fallback = 'DU'): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return fallback;
  return parts
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export const AvatarThumb: React.FC<AvatarThumbProps> = ({
  src,
  alt,
  fallbackText,
  fallbackIcon = 'initials',
  sizeClass = 'h-9 w-9',
  roundedClass = 'rounded-xl',
  textClass = 'text-xs',
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [src]);

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className={`${sizeClass} shrink-0 ${roundedClass} border border-slate-200 object-cover dark:border-slate-700 ${className}`}
      />
    );
  }

  if (fallbackIcon === 'users') {
    return (
      <div
        className={`flex ${sizeClass} shrink-0 items-center justify-center ${roundedClass} bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 ${className}`}
      >
        <Users className="h-4 w-4" />
      </div>
    );
  }

  return (
    <div
      className={`flex ${sizeClass} shrink-0 items-center justify-center ${roundedClass} bg-slate-100 font-display ${textClass} font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200 ${className}`}
    >
      {getInitials(fallbackText || alt)}
    </div>
  );
};
