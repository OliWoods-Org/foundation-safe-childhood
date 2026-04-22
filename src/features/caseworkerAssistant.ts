/**
 * CaseworkerAssistant — Caseload management, visit tracking,
 * court date management, and overdue review flagging.
 */

import { z } from 'zod';

export const CaseSchema = z.object({
  caseId: z.string().uuid(), childId: z.string().uuid(), caseworkerId: z.string().uuid(),
  status: z.enum(['active', 'pending_review', 'court_scheduled', 'closing', 'closed']),
  openedDate: z.string(), permanencyGoal: z.enum(['reunification', 'adoption', 'guardianship', 'independent_living', 'pending']),
  nextCourtDate: z.string().optional(), lastVisitDate: z.string().optional(),
  visitFrequency: z.enum(['weekly', 'biweekly', 'monthly']),
  reviewDueDate: z.string().optional(),
  flags: z.array(z.enum(['overdue_visit', 'overdue_review', 'court_upcoming', 'placement_disruption', 'safety_concern', 'aging_out'])),
  tasks: z.array(z.object({ id: z.string(), task: z.string(), dueDate: z.string(), completed: z.boolean(), priority: z.enum(['critical', 'high', 'medium', 'low']) })),
  notes: z.array(z.object({ date: z.string(), author: z.string(), content: z.string(), type: z.enum(['visit', 'court', 'medical', 'school', 'general']) })),
});

export const CaseloadDashboardSchema = z.object({
  caseworkerId: z.string().uuid(), generatedAt: z.string().datetime(),
  totalCases: z.number().int(), activeCases: z.number().int(),
  overdueVisits: z.number().int(), overdueReviews: z.number().int(),
  courtThisWeek: z.number().int(), criticalFlags: z.number().int(),
  caseList: z.array(z.object({ caseId: z.string(), childName: z.string().optional(), status: z.string(), urgency: z.enum(['critical', 'high', 'normal', 'low']), nextAction: z.string(), dueDate: z.string() })),
  burnoutIndicator: z.object({ caseloadRatio: z.number(), recommendation: z.string() }),
});

export type Case = z.infer<typeof CaseSchema>;
export type CaseloadDashboard = z.infer<typeof CaseloadDashboardSchema>;

export function flagOverdueItems(caseData: Case): Case {
  const now = Date.now();
  const flags = new Set(caseData.flags);

  // Visit overdue check
  if (caseData.lastVisitDate) {
    const freqDays = caseData.visitFrequency === 'weekly' ? 7 : caseData.visitFrequency === 'biweekly' ? 14 : 30;
    const daysSinceVisit = (now - new Date(caseData.lastVisitDate).getTime()) / 86400000;
    if (daysSinceVisit > freqDays + 3) flags.add('overdue_visit');
    else flags.delete('overdue_visit');
  }

  // Review overdue
  if (caseData.reviewDueDate && new Date(caseData.reviewDueDate).getTime() < now) flags.add('overdue_review');

  // Court upcoming (within 7 days)
  if (caseData.nextCourtDate) {
    const daysToCourtDate = (new Date(caseData.nextCourtDate).getTime() - now) / 86400000;
    if (daysToCourtDate >= 0 && daysToCourtDate <= 7) flags.add('court_upcoming');
    else flags.delete('court_upcoming');
  }

  return { ...caseData, flags: Array.from(flags) as Case['flags'] };
}

export function generateDashboard(cases: Case[], caseworkerId: string): CaseloadDashboard {
  const flaggedCases = cases.map(flagOverdueItems);
  const active = flaggedCases.filter(c => c.status !== 'closed');

  const caseList = active.map(c => {
    const urgency = c.flags.includes('safety_concern') ? 'critical' as const
      : c.flags.includes('overdue_visit') || c.flags.includes('overdue_review') ? 'high' as const
      : c.flags.includes('court_upcoming') ? 'normal' as const : 'low' as const;

    const nextAction = c.flags.includes('overdue_visit') ? 'Schedule visit immediately'
      : c.flags.includes('court_upcoming') ? 'Prepare court report'
      : c.flags.includes('overdue_review') ? 'Complete case review'
      : c.tasks.filter(t => !t.completed).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0]?.task ?? 'Review case';

    const dueDate = c.flags.includes('court_upcoming') ? c.nextCourtDate!
      : c.tasks.filter(t => !t.completed).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0]?.dueDate ?? '';

    return { caseId: c.caseId, status: c.status, urgency, nextAction, dueDate };
  }).sort((a, b) => {
    const urgencyOrder = { critical: 0, high: 1, normal: 2, low: 3 };
    return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
  });

  const caseloadRatio = active.length / 15; // CWLA recommends max 12-15 cases
  const recommendation = caseloadRatio > 1.5 ? 'CRITICAL: Caseload exceeds safe limits. Request immediate load redistribution.'
    : caseloadRatio > 1 ? 'WARNING: Above recommended caseload. Prioritize critical cases.'
    : 'Caseload within recommended range.';

  return {
    caseworkerId, generatedAt: new Date().toISOString(),
    totalCases: flaggedCases.length, activeCases: active.length,
    overdueVisits: active.filter(c => c.flags.includes('overdue_visit')).length,
    overdueReviews: active.filter(c => c.flags.includes('overdue_review')).length,
    courtThisWeek: active.filter(c => c.flags.includes('court_upcoming')).length,
    criticalFlags: active.filter(c => c.flags.includes('safety_concern')).length,
    caseList, burnoutIndicator: { caseloadRatio: Math.round(caseloadRatio * 100) / 100, recommendation },
  };
}
