export interface GroupScope {
  is_active?: boolean;
  department_id?: string | null;
  course_id?: string | null;
  batch_id?: string | null;
}

export interface StudentScope {
  department_id: string;
  course_id: string;
  batch_id: string | null;
}

/**
 * Students may only access university-wide groups (department_id === null)
 * or groups explicitly scoped to their own department, course, and batch.
 */
export function isGroupEligibleForStudent(
  group: GroupScope | null | undefined,
  student: StudentScope | null | undefined
): boolean {
  if (!group || !student) return false;
  if (group.is_active === false) return false;
  if (group.department_id && group.department_id !== student.department_id) return false;
  if (group.course_id && group.course_id !== student.course_id) return false;
  if (group.batch_id && group.batch_id !== student.batch_id) return false;
  return true;
}
