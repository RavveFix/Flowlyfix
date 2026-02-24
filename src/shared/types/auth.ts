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

export interface Profile {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  status: UserStatus;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TechnicianProfile extends Profile {
  role: UserRole.TECHNICIAN;
}
