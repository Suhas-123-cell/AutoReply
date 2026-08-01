/**
 * Mirrors lib/workspace-access.ts's canManageWorkspace() role-ordering
 * semantics on the mobile side, without importing server code. Gate any
 * create/edit/delete/invite/role-change UI on this (OWNER or ADMIN only).
 */
const ROLE_ORDER = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

export function canManageWorkspace(role) {
  return Boolean(role) && ROLE_ORDER[role] >= ROLE_ORDER.ADMIN;
}
