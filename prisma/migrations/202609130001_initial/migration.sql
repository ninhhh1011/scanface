CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS btree_gist;
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "employee_id" TEXT,
    "role" TEXT NOT NULL,
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "id" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'USER',

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'USER',

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "department_id" TEXT NOT NULL,
    "position_id" TEXT NOT NULL,
    "manager_id" TEXT,
    "hire_date" DATE NOT NULL,
    "end_date" DATE,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE,
    "base_salary" DECIMAL(18,0) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "source" TEXT NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "break_minutes" INTEGER NOT NULL DEFAULT 60,
    "grace_minutes" INTEGER NOT NULL DEFAULT 5,
    "weekdays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "source" TEXT NOT NULL DEFAULT 'USER',

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_assignments" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'USER',

    CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_events" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "source" TEXT NOT NULL,
    "proof_id" TEXT,
    "actor_id" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "work_date" DATE NOT NULL,
    "check_in" TIMESTAMPTZ NOT NULL,
    "check_out" TIMESTAMPTZ,
    "worked_minutes" INTEGER NOT NULL DEFAULT 0,
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "early_minutes" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "attendance_id" TEXT NOT NULL,
    "requested_in" TIMESTAMPTZ NOT NULL,
    "requested_out" TIMESTAMPTZ,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reviewer_id" TEXT,
    "review_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_periods" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "source" TEXT NOT NULL DEFAULT 'USER',

    CONSTRAINT "timesheet_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "annual_days" INTEGER NOT NULL DEFAULT 12,
    "paid" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "type_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "granted" INTEGER NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_ledger" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "type_id" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "type_id" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "days" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reviewer_id" TEXT,
    "review_reason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_requests" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reviewer_id" TEXT,
    "review_reason" TEXT,
    "source" TEXT NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "overtime_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timesheet_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "source" TEXT NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_items" (
    "id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "base_amount" DECIMAL(18,0) NOT NULL,
    "allowance_amount" DECIMAL(18,0) NOT NULL,
    "adjustment_amount" DECIMAL(18,0) NOT NULL,
    "total_amount" DECIMAL(18,0) NOT NULL,
    "worked_minutes" INTEGER NOT NULL,
    "overtime_minutes" INTEGER NOT NULL,

    CONSTRAINT "payroll_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_components" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(18,0) NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'USER',

    CONSTRAINT "salary_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT,
    "contract_id" TEXT,
    "owner_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "classification" TEXT NOT NULL DEFAULT 'GENERAL',
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "author_id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_cycles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'USER',

    CONSTRAINT "review_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_reviews" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "self_comment" TEXT,
    "manager_comment" TEXT,
    "score" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "source" TEXT NOT NULL DEFAULT 'USER',

    CONSTRAINT "performance_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "face_profiles" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "model_version" TEXT NOT NULL,
    "dimension" INTEGER NOT NULL,
    "sample_count" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "face_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "face_templates" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "model_version" TEXT NOT NULL,
    "dimension" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "face_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_consents" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "enrollment_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "face_challenges" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "consumed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "face_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "face_verifications" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "challenge_id" TEXT NOT NULL,
    "model_version" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "consumed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "face_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "allowed_roles" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "active_version_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_versions" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effective_from" TIMESTAMPTZ NOT NULL,
    "effective_to" TIMESTAMPTZ,
    "file_id" TEXT NOT NULL,
    "content_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_chunks" (
    "id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "section" TEXT,
    "page" INTEGER,
    "embedding_model" TEXT NOT NULL,
    "embedding_dimension" INTEGER NOT NULL,
    "embedding" vector NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_jobs" (
    "id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "locked_at" TIMESTAMPTZ,
    "available_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingestion_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "permission_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB NOT NULL DEFAULT '[]',
    "route" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "result" TEXT NOT NULL,
    "reason" TEXT,
    "request_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

-- CreateIndex
CREATE UNIQUE INDEX "positions_name_key" ON "positions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "employees_code_key" ON "employees"("code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");

-- CreateIndex
CREATE INDEX "employees_manager_id_idx" ON "employees"("manager_id");

-- CreateIndex
CREATE INDEX "employees_department_id_status_idx" ON "employees"("department_id", "status");

-- CreateIndex
CREATE INDEX "contracts_employee_id_ends_on_idx" ON "contracts"("employee_id", "ends_on");

-- CreateIndex
CREATE INDEX "shift_assignments_employee_id_starts_on_ends_on_idx" ON "shift_assignments"("employee_id", "starts_on", "ends_on");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_events_proof_id_key" ON "attendance_events"("proof_id");

-- CreateIndex
CREATE INDEX "attendance_events_employee_id_occurred_at_idx" ON "attendance_events"("employee_id", "occurred_at");

-- CreateIndex
CREATE INDEX "attendance_sessions_work_date_idx" ON "attendance_sessions"("work_date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_employee_id_work_date_shift_id_key" ON "attendance_sessions"("employee_id", "work_date", "shift_id");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_name_key" ON "leave_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_employee_id_type_id_year_key" ON "leave_balances"("employee_id", "type_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "leave_ledger_request_id_action_key" ON "leave_ledger"("request_id", "action");

-- CreateIndex
CREATE INDEX "leave_requests_employee_id_starts_on_ends_on_idx" ON "leave_requests"("employee_id", "starts_on", "ends_on");

-- CreateIndex
CREATE INDEX "overtime_requests_employee_id_starts_at_idx" ON "overtime_requests"("employee_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_timesheet_id_key" ON "payroll_periods"("timesheet_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_items_period_id_employee_id_key" ON "payroll_items"("period_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_storage_key_key" ON "documents"("storage_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "performance_reviews_employee_id_cycle_id_key" ON "performance_reviews"("employee_id", "cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "face_profiles_employee_id_key" ON "face_profiles"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "face_challenges_nonce_key" ON "face_challenges"("nonce");

-- CreateIndex
CREATE UNIQUE INDEX "face_verifications_challenge_id_key" ON "face_verifications"("challenge_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_document_id_version_key" ON "document_versions"("document_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "document_chunks_version_id_ordinal_key" ON "document_chunks"("version_id", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "ingestion_jobs_version_id_key" ON "ingestion_jobs"("version_id");

-- CreateIndex
CREATE INDEX "ingestion_jobs_status_available_at_idx" ON "ingestion_jobs"("status", "available_at");

-- CreateIndex
CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at");

-- Domain constraints
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"(id) ON DELETE RESTRICT;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"(id) ON DELETE RESTRICT;
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"(id) ON DELETE RESTRICT;
ALTER TABLE "employees" ADD CONSTRAINT "employees_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"(id) ON DELETE RESTRICT;
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"(id) ON DELETE RESTRICT;
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"(id) ON DELETE RESTRICT;
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"(id) ON DELETE RESTRICT;
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"(id) ON DELETE RESTRICT;
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"(id) ON DELETE RESTRICT;
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"(id) ON DELETE RESTRICT;
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"(id) ON DELETE RESTRICT;
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "attendance_sessions"(id) ON DELETE RESTRICT;
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_proof_id_fkey" FOREIGN KEY ("proof_id") REFERENCES "face_verifications"(id) ON DELETE RESTRICT;
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"(id) ON DELETE RESTRICT;
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "attendance_sessions"(id) ON DELETE RESTRICT;
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"(id) ON DELETE RESTRICT;
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "leave_types"(id) ON DELETE RESTRICT;
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"(id) ON DELETE RESTRICT;
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "leave_types"(id) ON DELETE RESTRICT;
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "leave_requests"(id) ON DELETE RESTRICT;
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"(id) ON DELETE RESTRICT;
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "leave_types"(id) ON DELETE RESTRICT;
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"(id) ON DELETE RESTRICT;
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheet_periods"(id) ON DELETE RESTRICT;
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "payroll_periods"(id) ON DELETE RESTRICT;
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"(id) ON DELETE RESTRICT;
ALTER TABLE "salary_components" ADD CONSTRAINT "salary_components_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"(id) ON DELETE RESTRICT;
ALTER TABLE "documents" ADD CONSTRAINT "documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"(id) ON DELETE RESTRICT;
ALTER TABLE "documents" ADD CONSTRAINT "documents_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"(id) ON DELETE RESTRICT;
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"(id) ON DELETE RESTRICT;
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"(id) ON DELETE RESTRICT;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"(id) ON DELETE RESTRICT;
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"(id) ON DELETE RESTRICT;
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "review_cycles"(id) ON DELETE RESTRICT;
ALTER TABLE "face_profiles" ADD CONSTRAINT "face_profiles_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"(id) ON DELETE RESTRICT;
ALTER TABLE "face_templates" ADD CONSTRAINT "face_templates_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "face_profiles"(id) ON DELETE RESTRICT;
ALTER TABLE "enrollment_consents" ADD CONSTRAINT "enrollment_consents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"(id) ON DELETE RESTRICT;
ALTER TABLE "enrollment_consents" ADD CONSTRAINT "enrollment_consents_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"(id) ON DELETE RESTRICT;
ALTER TABLE "face_challenges" ADD CONSTRAINT "face_challenges_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"(id) ON DELETE RESTRICT;
ALTER TABLE "face_challenges" ADD CONSTRAINT "face_challenges_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"(id) ON DELETE RESTRICT;
ALTER TABLE "face_verifications" ADD CONSTRAINT "face_verifications_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"(id) ON DELETE RESTRICT;
ALTER TABLE "face_verifications" ADD CONSTRAINT "face_verifications_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "face_challenges"(id) ON DELETE RESTRICT;
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"(id) ON DELETE RESTRICT;
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"(id) ON DELETE RESTRICT;
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "documents"(id) ON DELETE RESTRICT;
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "document_versions"(id) ON DELETE RESTRICT;
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "document_versions"(id) ON DELETE RESTRICT;
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"(id) ON DELETE RESTRICT;
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"(id) ON DELETE RESTRICT;
ALTER TABLE shift_assignments ADD CONSTRAINT no_assignment_overlap EXCLUDE USING gist (employee_id WITH =, daterange(starts_on,ends_on,'[]') WITH &&);
ALTER TABLE shift_assignments ADD CHECK (ends_on >= starts_on);
ALTER TABLE shifts ADD CHECK (start_minute BETWEEN 0 AND 1439 AND end_minute BETWEEN 0 AND 1439 AND break_minutes >= 0 AND grace_minutes >= 0);
ALTER TABLE attendance_sessions ADD CHECK (check_out IS NULL OR check_out >= check_in);
CREATE UNIQUE INDEX one_open_attendance ON attendance_sessions(employee_id) WHERE check_out IS NULL;
ALTER TABLE leave_balances ADD CHECK (used >= 0 AND used <= granted);
ALTER TABLE leave_requests ADD CHECK (ends_on >= starts_on AND days > 0);
ALTER TABLE leave_requests ADD CONSTRAINT no_active_leave_overlap EXCLUDE USING gist (employee_id WITH =, daterange(starts_on,ends_on,'[]') WITH &&) WHERE (status IN ('SUBMITTED','APPROVED'));
ALTER TABLE overtime_requests ADD CHECK (ends_at > starts_at);
ALTER TABLE overtime_requests ADD CONSTRAINT no_active_ot_overlap EXCLUDE USING gist (employee_id WITH =, tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE (status IN ('SUBMITTED','APPROVED'));
ALTER TABLE performance_reviews ADD CHECK (score IS NULL OR score BETWEEN 1 AND 5);
ALTER TABLE timesheet_periods ADD CHECK (ends_on >= starts_on);
ALTER TABLE timesheet_periods ADD CONSTRAINT no_timesheet_overlap EXCLUDE USING gist (daterange(starts_on,ends_on,'[]') WITH &&);
ALTER TABLE users ADD CHECK (role IN ('SUPER_ADMIN','HR_ADMIN','MANAGER','EMPLOYEE'));
