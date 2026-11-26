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
  findRegionIdsByName,
  findExistingEmails,
  findUserRegionsByAdminNewIds,
  findUserIdsByAdminNewUserIds,
  insertUser,
  updateUserRegion,
} from '../../identity/persistence/users-repository.js';
import type { AdminNewSource } from '../persistence/admin-new-source.js';
import type { SourceAgentUser } from '../domain/source-agent-user.js';

const AGENT_ROLES = ['MANAGER', 'BIDDER'] as const;
const LEGAL_REVIEWER_ROLE: RoleCode = 'LEGAL_REVIEWER';
const LEGAL_REVIEWER_AREA_IDS = new Set([1, 4]);
const DUMMY_EMAIL_DOMAIN = 'grupohouse.cl';
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const EMAIL_SCHEMA = z.email();

interface EligibleAgentUser {
  readonly source: SourceAgentUser;
  readonly email: string;
  readonly name: string;
  readonly rut: string | null;
  readonly password: string;
}

export interface AgentUserImportSummary {
  readonly eligibleUsers: number;
  readonly legalReviewerUsers: number;
  readonly assignedDummyEmails: number;
  readonly skippedIncompleteRecords: number;
  readonly alreadyImported: number;
  readonly imported: number;
  readonly regionsUpdated: number;
  readonly sourceUsersWithoutRegion: number;
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
  return user.source.areaId !== null && LEGAL_REVIEWER_AREA_IDS.has(user.source.areaId);
}

function rolesForUser(user: EligibleAgentUser): readonly RoleCode[] {
  return needsLegalReviewerRole(user) ? [...AGENT_ROLES, LEGAL_REVIEWER_ROLE] : AGENT_ROLES;
}

function eligibleAgentUsers(
  sourceUsers: readonly SourceAgentUser[],
  isDevelopmentImport: boolean,
): {
  readonly users: readonly EligibleAgentUser[];
  readonly assignedDummyEmails: number;
  readonly skippedIncompleteRecords: number;
} {
  const emailCounts = new Map<string, number>();
  for (const source of sourceUsers) {
    const email = source.email ? normalizeEmail(source.email) : '';
    if (isValidSourceEmail(email)) emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
  }

  const users: EligibleAgentUser[] = [];
  let assignedDummyEmails = 0;
  let skippedIncompleteRecords = 0;
  for (const source of sourceUsers) {
    const name =
      source.name?.replace(/\s+/g, ' ').trim() || `Agente admin_new ${source.adminNewUserId}`;
    const rut = source.rut?.trim() || null;
    const password = source.legacyPassword;
    if ((!password && !isDevelopmentImport) || !Number.isSafeInteger(source.adminNewUserId)) {
      skippedIncompleteRecords += 1;
      continue;
    }

    const sourceEmail = source.email ? normalizeEmail(source.email) : '';
    const usesDummyEmail =
      !isValidSourceEmail(sourceEmail) || (emailCounts.get(sourceEmail) ?? 0) !== 1;
    const email = usesDummyEmail ? dummyEmailFor(source.adminNewUserId) : sourceEmail;
    if (usesDummyEmail) assignedDummyEmails += 1;
    users.push({ source, email, name, rut, password: password ?? '' });
  }

  return { users, assignedDummyEmails, skippedIncompleteRecords };
}

function dummyEmailFor(adminNewUserId: number, suffix?: number): string {
  const localPart =
    suffix === undefined
      ? `test+admin-new-${adminNewUserId}`
      : `test+admin-new-${adminNewUserId}-${suffix}`;
  return `${localPart}@${DUMMY_EMAIL_DOMAIN}`;
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
  options?: { readonly developmentPassword: string },
): Promise<AgentUserImportSummary> {
  let sourceUsers: SourceAgentUser[];
  try {
    sourceUsers = await dependencies.source.readAgentUsers();
  } finally {
    await dependencies.source.close();
  }

  const eligibility = eligibleAgentUsers(sourceUsers, options !== undefined);
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
  const emailConflicts = notImported.filter((user) => existingEmails.has(user.email));
  let unresolvedEmailConflicts = emailConflicts;
  const resolvedEmailConflicts: EligibleAgentUser[] = [];
  for (let suffix = 1; unresolvedEmailConflicts.length > 0 && suffix <= 100; suffix += 1) {
    const proposed = unresolvedEmailConflicts.map((user) => ({
      ...user,
      email: dummyEmailFor(user.source.adminNewUserId, suffix),
    }));
    const occupiedAliases = await findExistingEmails(
      dependencies.database.db,
      proposed.map((user) => user.email),
    );
    const available = proposed.filter((user) => !occupiedAliases.has(user.email));
    resolvedEmailConflicts.push(...available);
    const availableIds = new Set(available.map((user) => user.source.adminNewUserId));
    unresolvedEmailConflicts = unresolvedEmailConflicts.filter(
      (user) => !availableIds.has(user.source.adminNewUserId),
    );
  }
  if (unresolvedEmailConflicts.length > 0) {
    throw new Error('No se pudo asignar un correo dummy único a cada agente');
  }
  const readyToImport = [
    ...notImported.filter((user) => !existingEmails.has(user.email)),
    ...resolvedEmailConflicts,
  ];

  let bcryptPasswords = 0;
  let plaintextPasswords = 0;
  for (const user of readyToImport) {
    if (options) continue;
    if (isSupportedBcryptHash(user.password)) bcryptPasswords += 1;
    else plaintextPasswords += 1;
  }

  let imported = 0;
  let regionsUpdated = 0;
  let legalReviewerRolesAdded = 0;
  let alreadyImported = existingSourceIds.size;
  const legalReviewerUsers = candidateUsers.filter(needsLegalReviewerRole).length;

  if (shouldApply && candidateUsers.length > 0) {
    const preparedUsers = await Promise.all(
      readyToImport.map(async (user) => ({
        ...user,
        passwordHash: options
          ? await dependencies.passwordHasher.hash(options.developmentPassword)
          : await hashLegacyPassword(user.password, dependencies.passwordHasher),
      })),
    );

    await dependencies.database.db.transaction(async (transaction) => {
      const currentUsersBySourceId = await findUserIdsByAdminNewUserIds(
        transaction,
        candidateSourceIds,
      );
      const currentRegionsBySourceId = await findUserRegionsByAdminNewIds(
        transaction,
        candidateSourceIds,
      );
      const regionIdsByName = await findRegionIdsByName(transaction, [
        'Región Metropolitana',
        ...candidateUsers.flatMap((user) =>
          user.source.regionName ? [user.source.regionName] : [],
        ),
      ]);
      const metropolitanRegionId = regionIdsByName.get('Región Metropolitana');
      if (metropolitanRegionId === undefined) throw new Error('Falta la Región Metropolitana');
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

      for (const user of candidateUsers) {
        const current = currentRegionsBySourceId.get(user.source.adminNewUserId);
        const sourceRegionId = user.source.regionName
          ? (regionIdsByName.get(user.source.regionName) ?? metropolitanRegionId)
          : metropolitanRegionId;
        if (current && current.regionId !== sourceRegionId) {
          await updateUserRegion(transaction, current.userId, sourceRegionId);
          regionsUpdated += 1;
        }
      }

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
          regionId: user.source.regionName
            ? (regionIdsByName.get(user.source.regionName) ?? metropolitanRegionId)
            : metropolitanRegionId,
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
    });
  }

  return {
    eligibleUsers: candidateUsers.length,
    legalReviewerUsers,
    assignedDummyEmails: eligibility.assignedDummyEmails + resolvedEmailConflicts.length,
    skippedIncompleteRecords: eligibility.skippedIncompleteRecords,
    alreadyImported,
    imported,
    regionsUpdated,
    sourceUsersWithoutRegion: candidateUsers.filter((user) => !user.source.regionName).length,
    legalReviewerRolesAdded,
    bcryptPasswords,
    plaintextPasswords,
  };
}
