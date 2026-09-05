import type { RolePublic } from '@/contracts/types';

const roleAvatars: Record<string, string> = {
  'role-professor': '👨‍🏫',
  'role-skeptic': '👩',
  'role-observer': '👨',
  'role-engineer': '🧓',
  'role-analyst': '🤖',
};

const roleFallback = ['🧑', '👩', '👨', '🧓', '🤖'];

export function getRoleAvatar(role: RolePublic): string {
  return roleAvatars[role.role_id] || '🧑';
}

export function getRoleName(role: RolePublic): string {
  return role.display_name;
}

export function getRoleBio(role: RolePublic): string {
  return role.public_bio;
}
