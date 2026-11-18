import { z } from 'zod';
import type { Clock } from '../../../platform/clock/clock.js';
import type { Database } from '../../../platform/database/database.js';
import type { PasswordHasher } from '../../identity/application/password-hasher.js';
import { normalizeEmail } from '../../identity/domain/email.js';
import type { RoleCode } from '../../identity/domain/role-code.js';
import {
  addMissingUserRoleIds,
  findRoleIdsByCode,
  replaceUserRoleIds,
} from '../../identity/persistence/roles-repository.js';
import {
  findExistingEmails,
  findUserIdsByAdminNewUserIds,
  insertUser,
} from '../../identity/persistence/users-repository.js';
import type { AdminNewSource } from '../persistence/admin-new-source.js';
import type { SourceAgentUser } from '../domain/source-agent-user.js';

const AGENT_ROLES = ['MANAGER', 'BIDDER'] as const;
const LEGAL_REVIEWER_ROLE: RoleCode = 'LEGAL_REVIEWER';
const LEGAL_REVIEWER_AREA_NAMES = new Set(['legal', 'jefe legal']);
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const EMAIL_SCHEMA = z.email();

interface EligibleAgentUser {
  readonly source: SourceAgentUser;
  readonly email: string;
  readonly name: string;
  readonly rut: string;
  readonly password: string;
}

export interface AgentUserImportSummary {
  readonly eligibleUsers: number;
  readonly legalReviewerUsers: number;
  readonly skippedInvalidEmails: number;
  readonly skippedDuplicateEmails: number;
  readonly skippedIncompleteRecords: number;
  readonly alreadyImported: number;
  readonly emailConflicts: number;
  readonly imported: number;
  readonly legalReviewerRolesAdded: number;
  readonly bcryptPasswords: number;
  readonly plaintextPasswords: number;
}

export interface AgentUserImportDependencies {
  readonly database: Database;
  readonly source: AdminNewSource;
  readonly clock: Clock;
  readonly passwordHasher: PasswordHasher;
}

function isValidSourceEmail(email: string): boolean {
  return EMAIL_SCHEMA.safeParse(email).success;
}

function isSupportedBcryptHash(password: string): boolean {
  return BCRYPT_HASH_PATTERN.test(password);
}

function needsLegalReviewerRole(user: EligibleAgentUser): boolean {
  return LEGAL_REVIEWER_AREA_NAMES.has((user.source.adminNewAreaName ?? '').trim().toLowerCase());
}

function rolesForUser(user: EligibleAgentUser): readonly RoleCode[] {
  return needsLegalReviewerRole(user) ? [...AGENT_ROLES, LEGAL_REVIEWER_ROLE] : AGENT_ROLES;
}

function eligibleAgentUsers(sourceUsers: readonly SourceAgentUser[]): {
  readonly users: readonly EligibleAgentUser[];
  readonly skippedInvalidEmails: number;
  readonly skippedDuplicateEmails: number;
  readonly skippedIncompleteRecords: number;
} {
  const withValidEmails: Array<{ source: SourceAgentUser; email: string }> = [];
  let skippedInvalidEmails = 0;

  for (const source of sourceUsers) {
    if (!source.email) {
      skippedInvalidEmails += 1;
      continue;
    }
    const email = normalizeEmail(source.email);
    if (!isValidSourceEmail(email)) {
      skippedInvalidEmails += 1;
      continue;
    }
    withValidEmails.push({ source, email });
  }

  const emailCounts = new Map<string, number>();
  for (const candidate of withValidEmails) {
    emailCounts.set(candidate.email, (emailCounts.get(candidate.email) ?? 0) + 1);
  }

  const users: EligibleAgentUser[] = [];
  let skippedDuplicateEmails = 0;
  let skippedIncompleteRecords = 0;
  for (const candidate of withValidEmails) {
    if ((emailCounts.get(candidate.email) ?? 0) !== 1) {
      skippedDuplicateEmails += 1;
      continue;
    }

    const name = candidate.source.name?.trim();
    const rut = candidate.source.rut?.trim();
    const password = candidate.source.legacyPassword;
    if (!name || !rut || !password || !Number.isSafeInteger(candidate.source.adminNewAreaId)) {
      skippedIncompleteRecords += 1;
      continue;
    }

    users.push({ source: candidate.source, email: candidate.email, name, rut, password });
  }

  return { users, skippedInvalidEmails, skippedDuplicateEmails, skippedIncompleteRecords };
}

async function hashLegacyPassword(
  password: string,
  passwordHasher: PasswordHasher,
): Promise<string> {
  if (!isSupportedBcryptHash(password)) return passwordHasher.hash(password);

  return password.startsWith('$2y$') ? password.replace(/^\$2y\$/, () => '$2b$') : password;
}

export async function importAdminNewAgentUsers(
  dependencies: AgentUserImportDependencies,
  shouldApply: boolean,
): Promise<AgentUserImportSummary> {
  let sourceUsers: SourceAgentUser[];
  try {
    sourceUsers = await dependencies.source.readAgentUsers();
  } finally {
    await dependencies.source.close();
  }

  const eligibility = eligibleAgentUsers(sourceUsers);
  const candidateUsers = eligibility.users;
  const candidateSourceIds = candidateUsers.map((user) => user.source.adminNewUserId);
  const existingUsersBySourceId = await findUserIdsByAdminNewUserIds(
    dependencies.database.db,
    candidateSourceIds,
  );
  const existingSourceIds = new Set(existingUsersBySourceId.keys());
  const notImported = candidateUsers.filter(
    (user) => !existingSourceIds.has(user.source.adminNewUserId),
  );
  const existingEmails = await findExistingEmails(
    dependencies.database.db,
    notImported.map((user) => user.email),
  );
  const readyToImport = notImported.filter((user) => !existingEmails.has(user.email));

  let bcryptPasswords = 0;
  let plaintextPasswords = 0;
  for (const user of readyToImport) {
    if (isSupportedBcryptHash(user.password)) bcryptPasswords += 1;
    else plaintextPasswords += 1;
  }

  let imported = 0;
  let legalReviewerRolesAdded = 0;
  let alreadyImported = existingSourceIds.size;
  let emailConflicts = notImported.length - readyToImport.length;
  const legalReviewerUsers = candidateUsers.filter(needsLegalReviewerRole).length;

  if (shouldApply && (readyToImport.length > 0 || legalReviewerUsers > 0)) {
    const preparedUsers = await Promise.all(
      readyToImport.map(async (user) => ({
        ...user,
        passwordHash: await hashLegacyPassword(user.password, dependencies.passwordHasher),
      })),
    );

    await dependencies.database.db.transaction(async (transaction) => {
      const currentUsersBySourceId = await findUserIdsByAdminNewUserIds(
        transaction,
        candidateSourceIds,
      );
      const remainingUsers = preparedUsers.filter(
        (user) => !currentUsersBySourceId.has(user.source.adminNewUserId),
      );
      const currentEmails = await findExistingEmails(
        transaction,
        remainingUsers.map((user) => user.email),
      );
      const usersToInsert = remainingUsers.filter((user) => !currentEmails.has(user.email));
      const rolesToEnsure: readonly RoleCode[] = [...AGENT_ROLES, LEGAL_REVIEWER_ROLE];
      const roleIds = await findRoleIdsByCode(transaction, rolesToEnsure);
      const roleId = (role: RoleCode): number => {
        const id = roleIds.get(role);
        if (id === undefined) throw new Error(`Falta el rol requerido ${role} en workflow`);
        return id;
      };
      const assignedAt = dependencies.clock.now();

      for (const user of candidateUsers.filter(needsLegalReviewerRole)) {
        const userId = currentUsersBySourceId.get(user.source.adminNewUserId);
        if (userId === undefined) continue;
        legalReviewerRolesAdded += await addMissingUserRoleIds(transaction, {
          userId,
          roleIds: [roleId(LEGAL_REVIEWER_ROLE)],
          assignedBy: null,
          assignedAt,
        });
      }

      for (const user of usersToInsert) {
        const userId = await insertUser(transaction, {
          name: user.name,
          email: user.email,
          passwordHash: user.passwordHash,
          rut: user.rut,
          adminNewUserId: user.source.adminNewUserId,
          adminNewAreaId: user.source.adminNewAreaId,
          adminNewAreaName: user.source.adminNewAreaName,
        });
        await replaceUserRoleIds(transaction, {
          userId,
          roleIds: rolesForUser(user).map(roleId),
          assignedBy: null,
          assignedAt,
        });
        if (needsLegalReviewerRole(user)) legalReviewerRolesAdded += 1;
      }

      imported = usersToInsert.length;
      alreadyImported = currentUsersBySourceId.size;
      emailConflicts += remainingUsers.length - usersToInsert.length;
    });
  }

  return {
    eligibleUsers: candidateUsers.length,
    legalReviewerUsers,
    skippedInvalidEmails: eligibility.skippedInvalidEmails,
    skippedDuplicateEmails: eligibility.skippedDuplicateEmails,
    skippedIncompleteRecords: eligibility.skippedIncompleteRecords,
    alreadyImported,
    emailConflicts,
    imported,
    legalReviewerRolesAdded,
    bcryptPasswords,
    plaintextPasswords,
  };
}
