export const TEACHER_HONORIFIC_PRESETS = [
  'Dr.',
  'Prof.',
  'Prof. Dr.',
  'Mr.',
  'Mrs.',
  'Ms.',
  'Er.',
  'Shri',
  'Smt.',
] as const;

export function formatTeacherName(
  teacher: { honorific?: string | null; full_name?: string | null } | null | undefined
): string {
  if (!teacher) return '';
  const name = (teacher.full_name || '').trim();
  const prefix = (teacher.honorific || '').trim();
  if (!prefix) return name;
  if (!name) return prefix;
  if (name.toLowerCase().startsWith(`${prefix.toLowerCase()} `)) {
    return name;
  }
  return `${prefix} ${name}`;
}
