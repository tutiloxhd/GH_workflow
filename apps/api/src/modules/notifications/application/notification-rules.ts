import { and, asc, eq, inArray } from 'drizzle-orm';
import type { IdentityDependencies } from '../../identity/application/identity-dependencies.js';
import {
  notificationRules,
  notificationRuleSets,
  NOTIFICATION_TRIGGERS,
  type NotificationTrigger,
  workflowNotificationRuleSets,
} from '../../../platform/database/schema/notification.schema.js';
import { workflowTemplates } from '../../../platform/database/schema/workflow.schema.js';
import { rebuildNotificationsForRuleSet } from './notification-processor.js';

export interface NotificationRuleInput {
  readonly eventType: NotificationTrigger;
  readonly offsetMinutes: number;
  readonly isEnabled: boolean;
}

export interface NotificationRuleSetView {
  readonly id: number;
  readonly version: number;
  readonly workflowTemplate: {
    readonly id: number;
    readonly code: string;
    readonly name: string;
    readonly version: number;
  };
  readonly rules: readonly NotificationRuleInput[];
}

export async function listPublishedNotificationRuleSets(
  dependencies: IdentityDependencies,
): Promise<NotificationRuleSetView[]> {
  const sets = await dependencies.database.db
    .select({
      id: notificationRuleSets.id,
      version: notificationRuleSets.version,
      templateId: workflowTemplates.id,
      templateCode: workflowTemplates.code,
      templateName: workflowTemplates.name,
      templateVersion: workflowTemplates.version,
    })
    .from(notificationRuleSets)
    .innerJoin(workflowTemplates, eq(workflowTemplates.id, notificationRuleSets.workflowTemplateId))
    .where(eq(notificationRuleSets.isPublished, 1))
    .orderBy(asc(workflowTemplates.code), asc(workflowTemplates.version));

  const rules =
    sets.length === 0
      ? []
      : await dependencies.database.db
          .select({
            ruleSetId: notificationRules.ruleSetId,
            eventType: notificationRules.trigger,
            offsetMinutes: notificationRules.offsetMinutes,
            isEnabled: notificationRules.isEnabled,
          })
          .from(notificationRules)
          .where(
            inArray(
              notificationRules.ruleSetId,
              sets.map((set) => set.id),
            ),
          )
          .orderBy(asc(notificationRules.id));

  return sets.map((set) => ({
    id: set.id,
    version: set.version,
    workflowTemplate: {
      id: set.templateId,
      code: set.templateCode,
      name: set.templateName,
      version: set.templateVersion,
    },
    rules: rules
      .filter((rule) => rule.ruleSetId === set.id)
      .map((rule) => ({
        eventType: rule.eventType,
        offsetMinutes: rule.offsetMinutes,
        isEnabled: rule.isEnabled === 1,
      })),
  }));
}

export async function publishNotificationRuleSet(
  dependencies: IdentityDependencies,
  currentRuleSetId: number,
  rules: readonly NotificationRuleInput[],
): Promise<NotificationRuleSetView | undefined> {
  const newRuleSetId = await dependencies.database.db.transaction(async (transaction) => {
    const [current] = await transaction
      .select({
        id: notificationRuleSets.id,
        workflowTemplateId: notificationRuleSets.workflowTemplateId,
        version: notificationRuleSets.version,
      })
      .from(notificationRuleSets)
      .where(
        and(eq(notificationRuleSets.id, currentRuleSetId), eq(notificationRuleSets.isPublished, 1)),
      )
      .for('update');
    if (!current) return undefined;

    await transaction
      .update(notificationRuleSets)
      .set({ isPublished: 0 })
      .where(eq(notificationRuleSets.id, current.id));
    const [created] = await transaction
      .insert(notificationRuleSets)
      .values({
        workflowTemplateId: current.workflowTemplateId,
        version: current.version + 1,
        isPublished: 1,
      })
      .$returningId();
    if (!created) throw new Error('No se pudo crear la versión de reglas de notificación');
    await transaction.insert(notificationRules).values(
      rules.map((rule) => ({
        ruleSetId: created.id,
        trigger: rule.eventType,
        offsetMinutes: rule.offsetMinutes,
        isEnabled: rule.isEnabled ? 1 : 0,
      })),
    );
    await transaction
      .update(workflowNotificationRuleSets)
      .set({ ruleSetId: created.id })
      .where(eq(workflowNotificationRuleSets.ruleSetId, current.id));
    return created.id;
  });

  if (newRuleSetId === undefined) return undefined;
  await rebuildNotificationsForRuleSet(dependencies, newRuleSetId);
  const sets = await listPublishedNotificationRuleSets(dependencies);
  return sets.find((set) => set.id === newRuleSetId);
}

export function hasAllNotificationTriggers(rules: readonly NotificationRuleInput[]): boolean {
  return (
    rules.length === NOTIFICATION_TRIGGERS.length &&
    new Set(rules.map((rule) => rule.eventType)).size === NOTIFICATION_TRIGGERS.length
  );
}
