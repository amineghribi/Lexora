-- LEXORA core schema (Phase 2)
-- Multi-tenant legal practice management SaaS

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============ ORGANIZATIONS ============
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('solo','firm')),
  plan text not null default 'trial' check (plan in ('trial','solo','professional','business')),
  status text not null default 'active' check (status in ('active','suspended','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','lawyer','assistant','secretary')),
  status text not null default 'active' check (status in ('active','invited','suspended','removed')),
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  unique (organization_id, user_id)
);
create index if not exists idx_org_members_org on public.organization_members(organization_id);
create index if not exists idx_org_members_user on public.organization_members(user_id);

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner','lawyer','assistant','secretary')),
  invited_by uuid references auth.users(id),
  token text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','expired','revoked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  phone text,
  language text default 'fr' check (language in ('ar','fr','en')),
  timezone text default 'Africa/Tunis',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ CLIENTS ============
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reference text not null,
  full_name text not null,
  client_type text not null default 'individual' check (client_type in ('individual','company')),
  cin_or_reg text,
  phone text,
  email text,
  address text,
  notes text,
  archived boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, reference)
);
create index if not exists idx_clients_org on public.clients(organization_id);
create index if not exists idx_clients_name on public.clients(organization_id, full_name);

create table if not exists public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  role text,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.client_addresses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  label text,
  address text not null,
  city text,
  country text default 'Tunisia',
  created_at timestamptz not null default now()
);

create table if not exists public.client_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_id uuid references auth.users(id),
  content text not null,
  created_at timestamptz not null default now()
);

-- ============ CASES ============
create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  reference text not null,
  title text not null,
  case_number text,
  legal_category text,
  court text,
  chamber text,
  opposing_party text,
  opposing_lawyer text,
  opening_date date,
  status text not null default 'open' check (status in ('open','in_progress','pending','closed','archived')),
  description text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, reference)
);
create index if not exists idx_cases_org on public.cases(organization_id);
create index if not exists idx_cases_client on public.cases(client_id);
create index if not exists idx_cases_status on public.cases(organization_id, status);

create table if not exists public.case_assignments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text default 'lawyer',
  assigned_at timestamptz not null default now(),
  unique (case_id, user_id)
);

create table if not exists public.case_participants (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  name text not null,
  participant_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.case_updates (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_id uuid references auth.users(id),
  update_type text not null default 'note',
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_case_updates_case on public.case_updates(case_id);

create table if not exists public.case_notes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_id uuid references auth.users(id),
  content text not null,
  created_at timestamptz not null default now()
);

-- ============ HEARINGS / CALENDAR ============
create table if not exists public.hearings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid references public.cases(id) on delete set null,
  court text,
  hearing_date date not null,
  start_time time,
  location text,
  hearing_type text,
  assigned_lawyer uuid references auth.users(id),
  notes text,
  status text not null default 'scheduled' check (status in ('scheduled','completed','adjourned','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_hearings_org_date on public.hearings(organization_id, hearing_date);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  event_type text not null default 'event' check (event_type in ('event','hearing','deadline','task')),
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null default false,
  case_id uuid references public.cases(id) on delete set null,
  assigned_to uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_cal_events_org_start on public.calendar_events(organization_id, start_at);

create table if not exists public.event_reminders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  remind_at timestamptz not null,
  channel text not null default 'in_app' check (channel in ('in_app','email')),
  sent boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.legal_deadlines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  title text not null,
  due_date date not null,
  description text,
  status text not null default 'pending' check (status in ('pending','completed','missed')),
  created_at timestamptz not null default now()
);

-- ============ DOCUMENTS ============
create table if not exists public.document_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  unique (organization_id, name)
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  case_id uuid references public.cases(id) on delete set null,
  category_id uuid references public.document_categories(id) on delete set null,
  name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  version int not null default 1,
  uploaded_by uuid references auth.users(id),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_docs_org on public.documents(organization_id);
create index if not exists idx_docs_case on public.documents(case_id);

create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version int not null,
  storage_path text not null,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.document_access_permissions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null check (permission in ('view','edit','delete')),
  granted_at timestamptz not null default now(),
  unique (document_id, user_id, permission)
);

-- ============ TASKS ============
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo','in_progress','completed','overdue')),
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  due_date date,
  case_id uuid references public.cases(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  assigned_to uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_tasks_org on public.tasks(organization_id);
create index if not exists idx_tasks_assigned on public.tasks(assigned_to);

create table if not exists public.task_assignments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique (task_id, user_id)
);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_id uuid references auth.users(id),
  content text not null,
  created_at timestamptz not null default now()
);

-- ============ FINANCIAL ============
create table if not exists public.case_fees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  agreed_amount numeric(12,3) not null default 0,
  currency text not null default 'TND',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid references public.cases(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  amount numeric(12,3) not null,
  currency text not null default 'TND',
  payment_date date not null default current_date,
  method text,
  reference text,
  notes text,
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_payments_org on public.payments(organization_id);

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  unique (organization_id, name)
);

-- ============ NOTIFICATIONS ============
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  resource_type text,
  resource_id uuid,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notif_user on public.notifications(user_id, read);

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email_enabled boolean not null default true,
  in_app_enabled boolean not null default true,
  reminders_24h boolean not null default true,
  reminders_48h boolean not null default true,
  unique (user_id, organization_id)
);

-- ============ AUDIT LOGS ============
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_org on public.audit_logs(organization_id, created_at desc);

-- ============ SUBSCRIPTIONS ============
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan text not null,
  status text not null default 'trial' check (status in ('trial','active','past_due','cancelled','expired')),
  trial_start timestamptz,
  trial_end timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  currency text default 'TND',
  timezone text default 'Africa/Tunis',
  language text default 'fr',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ RLS ============
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.user_profiles enable row level security;
alter table public.clients enable row level security;
alter table public.client_contacts enable row level security;
alter table public.client_addresses enable row level security;
alter table public.client_notes enable row level security;
alter table public.cases enable row level security;
alter table public.case_assignments enable row level security;
alter table public.case_participants enable row level security;
alter table public.case_updates enable row level security;
alter table public.case_notes enable row level security;
alter table public.hearings enable row level security;
alter table public.calendar_events enable row level security;
alter table public.event_reminders enable row level security;
alter table public.legal_deadlines enable row level security;
alter table public.document_categories enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_access_permissions enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignments enable row level security;
alter table public.task_comments enable row level security;
alter table public.case_fees enable row level security;
alter table public.payments enable row level security;
alter table public.payment_methods enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.audit_logs enable row level security;
alter table public.subscriptions enable row level security;
alter table public.organization_settings enable row level security;

-- helper: is member of org
create or replace function public.is_org_member(org uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

-- organizations: members can view their orgs
create policy org_select on public.organizations for select
  using (exists (select 1 from public.organization_members m where m.organization_id = organizations.id and m.user_id = auth.uid() and m.status='active'));
create policy org_update on public.organizations for update
  using (exists (select 1 from public.organization_members m where m.organization_id = organizations.id and m.user_id = auth.uid() and m.role='owner' and m.status='active'));

-- organization_members
create policy om_select on public.organization_members for select
  using (public.is_org_member(organization_id));
create policy om_insert on public.organization_members for insert
  with check (public.is_org_member(organization_id));
create policy om_update on public.organization_members for update
  using (exists (select 1 from public.organization_members m where m.organization_id=organization_members.organization_id and m.user_id=auth.uid() and m.role='owner' and m.status='active'));
create policy om_delete on public.organization_members for delete
  using (exists (select 1 from public.organization_members m where m.organization_id=organization_members.organization_id and m.user_id=auth.uid() and m.role='owner' and m.status='active'));

-- user_profiles
create policy up_select on public.user_profiles for select using (auth.uid() = id or exists (select 1 from public.organization_members m join public.organization_members m2 on m.organization_id=m2.organization_id where m.user_id=auth.uid() and m2.user_id=user_profiles.id and m.status='active'));
create policy up_insert on public.user_profiles for insert with check (auth.uid() = id);
create policy up_update on public.user_profiles for update using (auth.uid() = id);

-- generic org-scoped policies for business tables
-- clients
create policy clients_all on public.clients for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
-- client_notes
create policy client_notes_all on public.client_notes for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
-- cases
create policy cases_all on public.cases for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
-- case_updates
create policy case_updates_all on public.case_updates for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
-- case_notes
create policy case_notes_all on public.case_notes for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
-- hearings
create policy hearings_all on public.hearings for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
-- calendar_events
create policy cal_events_all on public.calendar_events for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
-- event_reminders
create policy event_reminders_all on public.event_reminders for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
-- legal_deadlines
create policy legal_deadlines_all on public.legal_deadlines for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
-- document_categories
create policy doc_cat_all on public.document_categories for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
-- documents
create policy docs_all on public.documents for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
-- tasks
create policy tasks_all on public.tasks for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
-- task_comments
create policy task_comments_all on public.task_comments for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
-- case_fees
create policy case_fees_all on public.case_fees for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
-- payments
create policy payments_all on public.payments for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
-- payment_methods
create policy payment_methods_all on public.payment_methods for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
-- notifications
create policy notif_select on public.notifications for select using (user_id = auth.uid() and public.is_org_member(organization_id));
create policy notif_update on public.notifications for update using (user_id = auth.uid());
create policy notif_insert on public.notifications for insert with check (public.is_org_member(organization_id));
-- notification_preferences
create policy np_all on public.notification_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- audit_logs
create policy audit_select on public.audit_logs for select using (public.is_org_member(organization_id));
create policy audit_insert on public.audit_logs for insert with check (public.is_org_member(organization_id));
-- subscriptions
create policy subs_all on public.subscriptions for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
-- organization_settings
create policy org_settings_all on public.organization_settings for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
-- organization_invitations
create policy org_inv_select on public.organization_invitations for select using (public.is_org_member(organization_id));
create policy org_inv_insert on public.organization_invitations for insert with check (public.is_org_member(organization_id));
-- document_versions / document_access_permissions / client_contacts / client_addresses / case_assignments / case_participants / task_assignments
create policy dv_all on public.document_versions for all using (exists (select 1 from public.documents d where d.id=document_versions.document_id and public.is_org_member(d.organization_id))) with check (exists (select 1 from public.documents d where d.id=document_versions.document_id and public.is_org_member(d.organization_id)));
create policy dap_all on public.document_access_permissions for all using (exists (select 1 from public.documents d where d.id=document_access_permissions.document_id and public.is_org_member(d.organization_id))) with check (exists (select 1 from public.documents d where d.id=document_access_permissions.document_id and public.is_org_member(d.organization_id)));
create policy cc_all on public.client_contacts for all using (exists (select 1 from public.clients c where c.id=client_contacts.client_id and public.is_org_member(c.organization_id))) with check (exists (select 1 from public.clients c where c.id=client_contacts.client_id and public.is_org_member(c.organization_id)));
create policy ca_all on public.client_addresses for all using (exists (select 1 from public.clients c where c.id=client_addresses.client_id and public.is_org_member(c.organization_id))) with check (exists (select 1 from public.clients c where c.id=client_addresses.client_id and public.is_org_member(c.organization_id)));
create policy case_assign_all on public.case_assignments for all using (exists (select 1 from public.cases c where c.id=case_assignments.case_id and public.is_org_member(c.organization_id))) with check (exists (select 1 from public.cases c where c.id=case_assignments.case_id and public.is_org_member(c.organization_id)));
create policy case_part_all on public.case_participants for all using (exists (select 1 from public.cases c where c.id=case_participants.case_id and public.is_org_member(c.organization_id))) with check (exists (select 1 from public.cases c where c.id=case_participants.case_id and public.is_org_member(c.organization_id)));
create policy ta_all on public.task_assignments for all using (exists (select 1 from public.tasks t where t.id=task_assignments.task_id and public.is_org_member(t.organization_id))) with check (exists (select 1 from public.tasks t where t.id=task_assignments.task_id and public.is_org_member(t.organization_id)));
