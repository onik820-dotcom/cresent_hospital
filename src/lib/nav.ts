import type { TranslationKey } from '@/lib/i18n/dictionary';
import type { Role } from '@/lib/roles';

/**
 * The app's navigation as data.
 *
 * Every role used to see its sections as one flat, horizontally scrolling row —
 * seventeen labels for an admin. They are now sorted into four labelled groups
 * (a role's own dashboard stands alone above them), and the same groups drive
 * both the desktop sidebar and the phone's bottom bar.
 *
 * What a role may open is still decided in lib/roles.ts and, behind it, by RLS.
 * This file only decides where an allowed link is filed.
 */

export type NavBucket = 'operations' | 'finance' | 'reports' | 'settings';

export const BUCKET_ORDER: NavBucket[] = ['operations', 'finance', 'reports', 'settings'];

export const BUCKET_LABEL: Record<NavBucket, TranslationKey> = {
  operations: 'nav.group.operations',
  finance: 'nav.group.finance',
  reports: 'nav.group.reports',
  settings: 'nav.group.settings',
};

export interface NavItem {
  href: string;
  key: TranslationKey;
  roles: Role[];
  /** Absent for a role's own dashboard, which is listed above the groups. */
  bucket?: NavBucket;
  /** Files the link under a different group for the roles listed. */
  bucketFor?: Partial<Record<Role, NavBucket>>;
}

export const NAV: NavItem[] = [
  { href: '/manager', key: 'nav.dashboard', roles: ['manager'] },
  { href: '/admin', key: 'nav.dashboard', roles: ['admin'] },
  { href: '/md', key: 'nav.dashboard', roles: ['md'] },
  { href: '/accounts', key: 'nav.dashboard', roles: ['accountant'] },

  { href: '/shift/close', key: 'nav.shiftClose', roles: ['manager', 'admin'], bucket: 'operations' },
  { href: '/dispenser/meter', key: 'nav.meterEntry', roles: ['manager'], bucket: 'operations' },
  { href: '/dispenser/dip', key: 'nav.dipEntry', roles: ['manager'], bucket: 'operations' },
  { href: '/stock', key: 'nav.stock', roles: ['manager', 'admin'], bucket: 'operations' },
  { href: '/refill', key: 'nav.refill', roles: ['manager', 'admin'], bucket: 'operations' },

  { href: '/cash', key: 'nav.cash', roles: ['admin', 'accountant'], bucket: 'finance' },
  { href: '/bank-deposits', key: 'nav.bankDeposits', roles: ['admin', 'accountant'], bucket: 'finance' },
  { href: '/dues', key: 'nav.dues', roles: ['admin', 'accountant'], bucket: 'finance' },
  { href: '/expenses', key: 'nav.expenses', roles: ['admin', 'accountant'], bucket: 'finance' },
  { href: '/petty-cash', key: 'nav.pettyCash', roles: ['admin', 'accountant'], bucket: 'finance' },
  { href: '/oil-purchase', key: 'nav.oilPurchase', roles: ['manager', 'admin'], bucket: 'finance' },

  { href: '/reports', key: 'nav.reports', roles: ['admin', 'md'], bucket: 'reports' },

  { href: '/people', key: 'nav.people', roles: ['admin'], bucket: 'settings' },
  { href: '/lubricants', key: 'nav.lubricants', roles: ['admin'], bucket: 'settings' },
  { href: '/settings', key: 'nav.generalSettings', roles: ['admin'], bucket: 'settings' },
  // The MD has no settings to change; the assistant sits beside their reports.
  { href: '/chat', key: 'nav.chat', roles: ['admin', 'md'], bucket: 'settings', bucketFor: { md: 'reports' } },
];

export interface NavGroup {
  bucket: NavBucket;
  items: NavItem[];
}

export interface RoleNav {
  /** The role's own dashboard, if it has one. */
  home: NavItem | null;
  groups: NavGroup[];
}

export function navFor(role: Role): RoleNav {
  const visible = NAV.filter((item) => item.roles.includes(role));
  const home = visible.find((item) => !item.bucket) ?? null;
  const groups: NavGroup[] = BUCKET_ORDER.map((bucket) => ({
    bucket,
    items: visible.filter((item) => item.bucket && (item.bucketFor?.[role] ?? item.bucket) === bucket),
  })).filter((group) => group.items.length > 0);
  return { home, groups };
}

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The group a path belongs to, so the right bucket lights up. The longest
 * matching href wins: /dispenser/meter must not be claimed by a shorter prefix.
 */
export function activeBucket(nav: RoleNav, pathname: string): NavBucket | null {
  let best: { bucket: NavBucket; length: number } | null = null;
  for (const group of nav.groups) {
    for (const item of group.items) {
      if (isActivePath(pathname, item.href) && (!best || item.href.length > best.length)) {
        best = { bucket: group.bucket, length: item.href.length };
      }
    }
  }
  return best?.bucket ?? null;
}
