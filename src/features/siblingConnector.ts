/**
 * SiblingConnector — Help separated siblings maintain contact,
 * track sibling groups across placements, and advocate for joint placement.
 */

import { z } from 'zod';

export const SiblingGroupSchema = z.object({
  groupId: z.string().uuid(),
  siblings: z.array(z.object({
    childId: z.string().uuid(), name: z.string(), age: z.number().int(),
    currentPlacement: z.string(), placementType: z.enum(['foster_home', 'group_home', 'kinship', 'adopted', 'reunified', 'independent']),
    location: z.object({ city: z.string(), state: z.string() }),
    caseworkerId: z.string().uuid().optional(),
  })),
  separatedSince: z.string().optional(),
  jointPlacementAttempted: z.boolean(),
  contactSchedule: z.array(z.object({
    type: z.enum(['in_person', 'video_call', 'phone_call', 'letter']),
    frequency: z.enum(['weekly', 'biweekly', 'monthly', 'quarterly']),
    lastOccurrence: z.string().optional(),
    nextScheduled: z.string().optional(),
    facilitatedBy: z.string().optional(),
  })),
  barriers: z.array(z.string()),
});

export const ReunificationPlanSchema = z.object({
  groupId: z.string().uuid(), generatedAt: z.string().datetime(),
  feasibility: z.enum(['high', 'moderate', 'low', 'not_possible']),
  currentStatus: z.string(),
  steps: z.array(z.object({ step: z.number().int(), action: z.string(), responsible: z.string(), deadline: z.string(), completed: z.boolean() })),
  legalConsiderations: z.array(z.string()),
  resourcesNeeded: z.array(z.string()),
});

export type SiblingGroup = z.infer<typeof SiblingGroupSchema>;
export type ReunificationPlan = z.infer<typeof ReunificationPlanSchema>;

export function assessSiblingContactGaps(group: SiblingGroup): Array<{ concern: string; severity: 'critical' | 'high' | 'medium'; action: string }> {
  const gaps: Array<{ concern: string; severity: 'critical' | 'high' | 'medium'; action: string }> = [];
  const now = Date.now();

  if (group.contactSchedule.length === 0) {
    gaps.push({ concern: 'No contact schedule established between siblings', severity: 'critical', action: 'Establish minimum monthly contact per federal Fostering Connections Act' });
  }

  for (const schedule of group.contactSchedule) {
    if (schedule.lastOccurrence) {
      const daysSince = (now - new Date(schedule.lastOccurrence).getTime()) / 86400000;
      const expectedDays = schedule.frequency === 'weekly' ? 7 : schedule.frequency === 'biweekly' ? 14 : schedule.frequency === 'monthly' ? 30 : 90;
      if (daysSince > expectedDays * 2) {
        gaps.push({ concern: `${schedule.type} contact overdue by ${Math.round(daysSince - expectedDays)} days`, severity: daysSince > expectedDays * 3 ? 'critical' : 'high', action: `Schedule ${schedule.type} visit immediately` });
      }
    }
  }

  const states = new Set(group.siblings.map(s => s.location.state));
  if (states.size > 1) {
    gaps.push({ concern: 'Siblings placed across state lines', severity: 'high', action: 'Coordinate ICPC for cross-state sibling visits, explore video contact' });
  }

  return gaps;
}

export function generateReunificationPlan(group: SiblingGroup): ReunificationPlan {
  const sameState = new Set(group.siblings.map(s => s.location.state)).size === 1;
  const allFoster = group.siblings.every(s => s.placementType === 'foster_home' || s.placementType === 'kinship' || s.placementType === 'group_home');

  const feasibility = allFoster && sameState ? 'high' as const
    : allFoster ? 'moderate' as const
    : group.siblings.some(s => s.placementType === 'adopted') ? 'not_possible' as const : 'low' as const;

  const steps = [
    { step: 1, action: 'Request sibling placement review from supervising agency', responsible: 'Caseworker', deadline: '30 days', completed: false },
    { step: 2, action: 'Identify foster homes certified for sibling groups', responsible: 'Placement unit', deadline: '60 days', completed: false },
    { step: 3, action: 'Conduct sibling bonding assessment', responsible: 'Therapist', deadline: '45 days', completed: false },
    { step: 4, action: 'File court motion for joint placement if appropriate', responsible: 'Attorney/CASA', deadline: '90 days', completed: false },
  ];

  return {
    groupId: group.groupId, generatedAt: new Date().toISOString(), feasibility,
    currentStatus: `${group.siblings.length} siblings across ${new Set(group.siblings.map(s => s.currentPlacement)).size} placements`,
    steps, legalConsiderations: ['Fostering Connections Act mandates reasonable efforts to place siblings together', 'Court must document compelling reasons for separation'],
    resourcesNeeded: feasibility === 'high' ? ['Sibling-certified foster home with capacity'] : ['Cross-jurisdiction coordination', 'Specialized sibling placement resources'],
  };
}
