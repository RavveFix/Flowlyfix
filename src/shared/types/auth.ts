export enum UserRole {
  ADMIN = 'ADMIN',
  TECHNICIAN = 'TECHNICIAN',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export interface Organization {
  id: string;
  name: string;
  org_number?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMembership {
  id: string;
  user_id: string;
  organization_id: string;
  role: UserRole;
  status: UserStatus;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  organization?: Organization | null;
}

export interface OrganizationInvite {
  id: string;
  organization_id: string;
  email: string;
  role: UserRole;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  invited_by?: string | null;
  expires_at?: string | null;
  accepted_by?: string | null;
  accepted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthIdentity {
  activeOrganizationId: string | null;
  activeRole: UserRole | null;
  memberships: OrganizationMembership[];
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string | null;
  active_organization_id?: string | null;
  created_at: string;
  updated_at: string;
  // Derived compatibility fields (legacy schema fields are deprecated for authz).
  organization_id: string;
  role: UserRole;
  status: UserStatus;
}

export interface TechnicianProfile extends Profile {
  role: UserRole.TECHNICIAN;
}
