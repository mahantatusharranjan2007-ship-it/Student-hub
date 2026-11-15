export type AppRole = 'super_admin' | 'batch_admin' | 'moderator' | 'teacher' | 'student';
export type StudentStatus = 'active' | 'inactive' | 'suspended' | 'alumni';
export type AcademicStatus = 'studying' | 'graduated' | 'on_leave' | 'withdrawn';
export type VerificationStatus = 'provisioned_unverified' | 'pending_review' | 'verified' | 'flagged';
export type RegistrationStatus = 'pending' | 'approved' | 'rejected';
export type GroupType = 'official' | 'department' | 'course' | 'batch' | 'study_circle';
export type ReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed';
export type TagColor = 'gold' | 'violet' | 'teal' | 'indigo' | 'rose';
export type AdminTierRole = 'super_admin' | 'batch_admin' | 'moderator';

export interface StudentBadgeInfo {
  userId: string;
  studentRecordId: string;
  highestAdminRole: AdminTierRole | null;
  starCount: 0 | 1 | 2 | 3;
  customTag: string | null;
  tagColor: TagColor;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  faculty_area: string;
  head_name: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  department_id: string;
  code: string;
  name: string;
  degree_level: string;
  duration_years: number;
  total_semesters: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  department?: Department;
}

export interface Batch {
  id: string;
  department_id: string;
  course_id: string;
  name: string;
  admission_year: number;
  graduation_year: number;
  current_semester: number;
  section: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  department?: Department;
  course?: Course;
}

export interface StudentRecord {
  id: string;
  user_id: string;
  student_id: string;
  full_name: string;
  institution: string;
  campus_location: string;
  department_id: string;
  course_id: string;
  batch_id: string | null;
  semester: number;
  roll_number: string | null;
  custom_tag?: string | null;
  tag_color?: TagColor | null;
  student_status: StudentStatus;
  academic_status: AcademicStatus;
  verification_status: VerificationStatus;
  is_initial_provisioned: boolean;
  profile_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  department?: Department;
  course?: Course;
  batch?: Batch | null;
}

export interface ProfileRecord {
  id: string;
  student_record_id: string;
  student_id: string;
  display_name: string;
  personal_email: string | null;
  phone: string | null;
  bio: string | null;
  avatar_url: string | null;
  hometown: string | null;
  academic_interests: string[];
  must_change_password: boolean;
  password_changed_at: string | null;
  privacy_show_email: boolean;
  privacy_show_phone: boolean;
  privacy_directory_visible: boolean;
  theme_preference: 'light' | 'dark';
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminRoleRecord {
  id: string;
  user_id: string;
  student_record_id: string;
  role: AppRole;
  scope_department_id: string | null;
  scope_batch_id: string | null;
  granted_by: string | null;
  granted_reason: string | null;
  is_active: boolean;
  created_at: string;
  revoked_at: string | null;
  student?: StudentRecord;
}

export interface RegistrationRequest {
  id: string;
  student_id: string;
  full_name: string;
  personal_email: string;
  phone: string | null;
  department_id: string;
  course_id: string;
  batch_id: string | null;
  admission_year: number;
  supporting_note: string | null;
  status: RegistrationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_user_id: string | null;
  created_at: string;
  department?: Department;
  course?: Course;
  batch?: Batch | null;
}

export interface RegisteredDevice {
  id: string;
  user_id: string;
  device_fingerprint: string;
  device_name: string;
  platform: string;
  user_agent: string | null;
  is_trusted: boolean;
  is_revoked: boolean;
  first_seen_at: string;
  last_seen_at: string;
}

export interface DeviceSession {
  id: string;
  user_id: string;
  device_id: string;
  ip_address: string | null;
  user_agent: string | null;
  is_active: boolean;
  started_at: string;
  last_active_at: string;
  revoked_at: string | null;
  device?: RegisteredDevice;
}

export interface AdminAuditLog {
  id: string;
  actor_user_id: string | null;
  actor_student_id: string | null;
  actor_role: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface GroupRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url?: string | null;
  group_type: GroupType;
  department_id: string | null;
  course_id: string | null;
  batch_id: string | null;
  is_active: boolean;
  created_at: string;
  department?: Department | null;
}

export interface TeacherRecord {
  id: string;
  user_id: string;
  teacher_id: string;
  honorific?: string | null;
  full_name: string;
  department_id: string;
  designation: string;
  specialization: string | null;
  personal_email: string | null;
  phone: string | null;
  avatar_url: string | null;
  qualification?: string | null;
  experience_years?: number | null;
  subjects_taught?: string[] | null;
  research_areas?: string[] | null;
  office_location?: string | null;
  office_hours?: string | null;
  bio?: string | null;
  website_url?: string | null;
  publications_summary?: string | null;
  profile_completed?: boolean;
  profile_updated_at?: string | null;
  is_active: boolean;
  must_change_password: boolean;
  password_changed_at: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  department?: Department | null;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category:
    | 'general'
    | 'academic'
    | 'examination'
    | 'chemistry'
    | 'security'
    | 'event'
    | 'promotion'
    | 'resource';
  priority: 'normal' | 'important' | 'urgent';
  target_department_id: string | null;
  target_batch_id: string | null;
  author_user_id: string | null;
  author_name?: string | null;
  author_role?: string | null;
  external_url?: string | null;
  link_label?: string | null;
  pdf_url?: string | null;
  pdf_name?: string | null;
  banner_url?: string | null;
  is_pinned: boolean;
  is_published: boolean;
  published_at: string;
  created_at: string;
  department?: Department | null;
}

export interface MessageRecord {
  id: string;
  sender_id: string;
  recipient_id: string | null;
  group_id: string | null;
  content: string;
  is_read: boolean;
  is_flagged: boolean;
  deleted_at: string | null;
  created_at: string;
}

export interface ModerationReport {
  id: string;
  reporter_user_id: string;
  reported_user_id: string | null;
  target_type: 'message' | 'profile' | 'group' | 'other';
  target_id: string | null;
  reason: string;
  details: string | null;
  status: ReportStatus;
  resolved_by: string | null;
  resolution_notes: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface SecuritySettings {
  id: number;
  institution_name: string;
  require_admin_approval: boolean;
  enforce_first_login_password_change: boolean;
  min_password_length: number;
  max_devices_per_student: number;
  session_timeout_hours: number;
  allow_student_direct_messages: boolean;
  maintenance_mode: boolean;
  updated_at: string;
}

export interface SystemHealth {
  ok: boolean;
  institution: string;
  supabasePublicConfigured: boolean;
  supabaseAdminConfigured: boolean;
  initialPasswordConfigured: boolean;
  schemaReady: boolean;
  superAdminProvisioned: boolean;
  provisioningTokenRequired: boolean;
  databaseError: string | null;
}
