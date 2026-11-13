export const USER_STATUSES = ['ACTIVE', 'INACTIVE', 'BLOCKED'] as const;

export type UserStatus = (typeof USER_STATUSES)[number];

export const isAllowedToSignIn = (status: UserStatus): boolean => status === 'ACTIVE';
