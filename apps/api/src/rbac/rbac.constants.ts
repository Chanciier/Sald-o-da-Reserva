import { Role } from '@prisma/client';

export enum Permission {
  USERS_READ = 'users:read',
  USERS_UPDATE = 'users:update',
  USERS_DELETE = 'users:delete',
  USERS_ASSIGN_ROLE = 'users:assign_role',

  PRODUCTS_CREATE = 'products:create',
  PRODUCTS_READ = 'products:read',
  PRODUCTS_UPDATE = 'products:update',
  PRODUCTS_DELETE = 'products:delete',

  ORDERS_CREATE = 'orders:create',
  ORDERS_READ = 'orders:read',
  ORDERS_READ_OWN = 'orders:read_own',
  ORDERS_UPDATE = 'orders:update',
  ORDERS_DELETE = 'orders:delete',

  REPORTS_READ = 'reports:read',
}

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.ADMIN]: Object.values(Permission),

  [Role.VENDEDOR]: [
    Permission.USERS_READ,
    Permission.PRODUCTS_CREATE,
    Permission.PRODUCTS_READ,
    Permission.PRODUCTS_UPDATE,
    Permission.PRODUCTS_DELETE,
    Permission.ORDERS_READ,
    Permission.ORDERS_UPDATE,
    Permission.REPORTS_READ,
  ],

  [Role.CLIENTE]: [Permission.PRODUCTS_READ, Permission.ORDERS_CREATE, Permission.ORDERS_READ_OWN],
};
