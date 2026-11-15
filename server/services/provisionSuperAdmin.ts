import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
  studentIdToAuthEmail,
  writeAuditLog,
} from '../supabaseAdmin.ts';

export const INITIAL_SUPER_ADMIN_STUDENT_ID = '5301K24032';

export interface ProvisionResult {
  status: 'provisioned' | 'already_provisioned';
  studentId: string;
  department: string;
  course: string;
  institution: string;
  mustChangePassword: boolean;
  message: string;
}

export async function provisionInitialSuperAdmin(ipAddress?: string | null): Promise<ProvisionResult> {
  if (!isSupabaseAdminConfigured()) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured before provisioning.');
  }

  const initialPassword = (process.env.SUPER_ADMIN_INITIAL_PASSWORD || '').trim();
  if (!initialPassword || initialPassword === 'SET_STRONG_INITIAL_PASSWORD_IN_ENV') {
    throw new Error('SUPER_ADMIN_INITIAL_PASSWORD environment secret is required and must not be a placeholder.');
  }
  if (initialPassword.length < 10) {
    throw new Error('SUPER_ADMIN_INITIAL_PASSWORD must be at least 10 characters long.');
  }

  const admin = getSupabaseAdmin();

  // 1. Idempotency check: verify if student 5301K24032 and super_admin role already exist
  const { data: existingStudent, error: existingStudentErr } = await admin
    .from('students')
    .select('id, user_id, student_id, department_id, course_id')
    .eq('student_id', INITIAL_SUPER_ADMIN_STUDENT_ID)
    .maybeSingle();

  if (existingStudentErr) {
    throw new Error(`Database query failed: ${existingStudentErr.message}. Ensure SQL migrations have been applied.`);
  }

  if (existingStudent) {
    const { data: existingRole } = await admin
      .from('admin_roles')
      .select('id, is_active')
      .eq('user_id', existingStudent.user_id)
      .eq('role', 'super_admin')
      .eq('is_active', true)
      .maybeSingle();

    if (existingRole) {
      return {
        status: 'already_provisioned',
        studentId: INITIAL_SUPER_ADMIN_STUDENT_ID,
        department: 'Chemistry',
        course: 'B.Sc. Chemistry',
        institution: 'Dharanidhar University',
        mustChangePassword: true,
        message: 'Initial Super Admin (5301K24032) is already provisioned. No duplicate records were created.',
      };
    }
  }

  // 2. Ensure Security Settings, Chemistry Department, B.Sc. Chemistry Course, and Batch exist
  await admin
    .from('security_settings')
    .upsert(
      {
        id: 1,
        institution_name: 'Dharanidhar University',
        require_admin_approval: true,
        enforce_first_login_password_change: true,
        min_password_length: 10,
        max_devices_per_student: 5,
        session_timeout_hours: 72,
        allow_student_direct_messages: true,
        maintenance_mode: false,
      },
      { onConflict: 'id', ignoreDuplicates: true }
    );

  const { data: dept, error: deptErr } = await admin
    .from('departments')
    .upsert(
      {
        code: 'CHEM',
        name: 'Chemistry',
        faculty_area: 'School of Physical & Chemical Sciences',
        description: 'Department of Chemistry, Dharanidhar University, Keonjhar, Odisha.',
        is_active: true,
      },
      { onConflict: 'code' }
    )
    .select('id, name')
    .single();

  if (deptErr || !dept) {
    throw new Error(`Failed to ensure Chemistry department: ${deptErr?.message}`);
  }

  const { data: course, error: courseErr } = await admin
    .from('courses')
    .upsert(
      {
        department_id: dept.id,
        code: 'BSC-CHEM',
        name: 'B.Sc. Chemistry',
        degree_level: 'Undergraduate',
        duration_years: 3,
        total_semesters: 6,
        is_active: true,
      },
      { onConflict: 'code' }
    )
    .select('id, name')
    .single();

  if (courseErr || !course) {
    throw new Error(`Failed to ensure B.Sc. Chemistry course: ${courseErr?.message}`);
  }

  const { data: batch, error: batchErr } = await admin
    .from('batches')
    .upsert(
      {
        department_id: dept.id,
        course_id: course.id,
        name: 'B.Sc. Chemistry (2024–2027)',
        admission_year: 2024,
        graduation_year: 2027,
        current_semester: 1,
        section: 'A',
        is_active: true,
      },
      { onConflict: 'course_id,admission_year,section' }
    )
    .select('id')
    .single();

  if (batchErr || !batch) {
    throw new Error(`Failed to ensure initial Chemistry batch: ${batchErr?.message}`);
  }

  // 3. Create or locate Supabase Auth user for 5301K24032
  const authEmail = studentIdToAuthEmail(INITIAL_SUPER_ADMIN_STUDENT_ID);
  let userId = existingStudent?.user_id || '';

  if (!userId) {
    const { data: createdAuth, error: createAuthErr } = await admin.auth.admin.createUser({
      email: authEmail,
      password: initialPassword,
      email_confirm: true,
      user_metadata: {
        student_id: INITIAL_SUPER_ADMIN_STUDENT_ID,
        institution: 'Dharanidhar University',
        is_initial_provisioned: true,
      },
    });

    if (createAuthErr) {
      // If auth user already exists from a partial previous attempt, locate it safely
      const { data: listed } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const matched = listed?.users?.find((u) => u.email?.toLowerCase() === authEmail);
      if (!matched) {
        throw new Error(`Failed to create Super Admin auth user: ${createAuthErr.message}`);
      }
      userId = matched.id;
    } else if (createdAuth.user) {
      userId = createdAuth.user.id;
    }
  }

  if (!userId) {
    throw new Error('Unable to resolve Supabase Auth user ID for Super Admin.');
  }

  // 4. Upsert Student record (normal Chemistry student)
  const { data: studentRecord, error: studentUpsertErr } = await admin
    .from('students')
    .upsert(
      {
        user_id: userId,
        student_id: INITIAL_SUPER_ADMIN_STUDENT_ID,
        full_name: 'Student 5301K24032',
        institution: 'Dharanidhar University',
        campus_location: 'Keonjhar, Odisha, India',
        department_id: dept.id,
        course_id: course.id,
        batch_id: batch.id,
        semester: 1,
        student_status: 'active',
        academic_status: 'studying',
        verification_status: 'provisioned_unverified',
        is_initial_provisioned: true,
      },
      { onConflict: 'student_id' }
    )
    .select('id')
    .single();

  if (studentUpsertErr || !studentRecord) {
    throw new Error(`Failed to upsert Super Admin student record: ${studentUpsertErr?.message}`);
  }

  // 5. Upsert Profile record (require password change at first login)
  const { error: profileErr } = await admin
    .from('profiles')
    .upsert(
      {
        id: userId,
        student_record_id: studentRecord.id,
        student_id: INITIAL_SUPER_ADMIN_STUDENT_ID,
        display_name: 'Student 5301K24032',
        bio: 'Initial platform Super Admin & B.Sc. Chemistry student at Dharanidhar University.',
        must_change_password: true,
        privacy_directory_visible: true,
      },
      { onConflict: 'id' }
    );

  if (profileErr) {
    throw new Error(`Failed to upsert Super Admin profile: ${profileErr.message}`);
  }

  // 6. Connect super_admin role to the same student account
  const { error: roleErr } = await admin
    .from('admin_roles')
    .upsert(
      {
        user_id: userId,
        student_record_id: studentRecord.id,
        role: 'super_admin',
        granted_reason: 'One-time secure server-side Super Admin provisioning',
        is_active: true,
        revoked_at: null,
      },
      { onConflict: 'user_id,role' }
    );

  if (roleErr) {
    throw new Error(`Failed to assign super_admin role: ${roleErr.message}`);
  }

  // 7. Ensure membership in official commons & Chemistry department group
  const { data: groups } = await admin
    .from('groups')
    .select('id')
    .in('slug', ['ddu-commons', 'dept-chemistry']);

  if (groups && groups.length > 0) {
    await admin.from('group_members').upsert(
      groups.map((g) => ({
        group_id: g.id,
        user_id: userId,
        member_role: 'lead',
      })),
      { onConflict: 'group_id,user_id', ignoreDuplicates: true }
    );
  }

  // 8. Record audit log
  await writeAuditLog({
    actorUserId: userId,
    actorStudentId: INITIAL_SUPER_ADMIN_STUDENT_ID,
    actorRole: 'system_provisioning',
    action: 'SUPER_ADMIN_PROVISIONED',
    targetType: 'student',
    targetId: studentRecord.id,
    summary: `Idempotent server provisioning completed for Super Admin ${INITIAL_SUPER_ADMIN_STUDENT_ID} (B.Sc. Chemistry, Dharanidhar University).`,
    metadata: {
      department: 'Chemistry',
      course: 'B.Sc. Chemistry',
      verification_status: 'provisioned_unverified',
      must_change_password: true,
    },
    ipAddress: ipAddress ?? null,
  });

  return {
    status: 'provisioned',
    studentId: INITIAL_SUPER_ADMIN_STUDENT_ID,
    department: 'Chemistry',
    course: 'B.Sc. Chemistry',
    institution: 'Dharanidhar University',
    mustChangePassword: true,
    message: 'Initial Super Admin (5301K24032) provisioned securely with first-login password change required.',
  };
}
