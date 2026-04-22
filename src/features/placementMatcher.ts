/**
 * PlacementMatcher — AI-powered foster care placement matching
 * optimizing for child needs, family strengths, sibling proximity,
 * school stability, and cultural factors.
 */

import { z } from 'zod';

export const ChildProfileSchema = z.object({
  childId: z.string().uuid(), age: z.number().int().min(0).max(21),
  gender: z.string(), ethnicity: z.string().optional(), languages: z.array(z.string()),
  needs: z.object({
    medical: z.array(z.string()), behavioral: z.array(z.string()), educational: z.array(z.string()),
    therapeutic: z.array(z.enum(['individual_therapy', 'family_therapy', 'trauma_informed', 'substance_abuse', 'none'])),
    level: z.enum(['basic', 'moderate', 'specialized', 'therapeutic', 'intensive']),
  }),
  siblings: z.array(z.object({ id: z.string().uuid(), name: z.string(), currentPlacement: z.string().optional() })),
  school: z.object({ name: z.string(), address: z.string().optional(), grade: z.number().int().optional(), iep: z.boolean() }).optional(),
  currentPlacement: z.object({ id: z.string().optional(), since: z.string().optional(), placementNumber: z.number().int() }),
  preferences: z.object({ stayInSchool: z.boolean(), nearSiblings: z.boolean(), culturalMatch: z.boolean(), petFriendly: z.boolean().optional() }),
  attachments: z.array(z.string()).optional(),
});

export const FosterFamilySchema = z.object({
  familyId: z.string().uuid(), names: z.array(z.string()),
  location: z.object({ latitude: z.number(), longitude: z.number(), address: z.string() }),
  capacity: z.object({ total: z.number().int(), current: z.number().int(), available: z.number().int() }),
  certifications: z.array(z.enum(['basic', 'therapeutic', 'medical', 'sibling_group', 'infant', 'teen', 'lgbtq_affirming', 'bilingual'])),
  experience: z.object({ yearsLicensed: z.number(), totalPlacements: z.number().int(), disruptionRate: z.number().min(0).max(1), reunificationRate: z.number().min(0).max(1) }),
  strengths: z.array(z.string()), languages: z.array(z.string()), ethnicity: z.string().optional(),
  ageRange: z.object({ min: z.number().int(), max: z.number().int() }),
  schoolDistrict: z.string().optional(), hasPets: z.boolean().optional(),
  lastPlacementDate: z.string().optional(),
});

export const PlacementMatchSchema = z.object({
  childId: z.string().uuid(), familyId: z.string().uuid(), matchedAt: z.string().datetime(),
  overallScore: z.number().min(0).max(100),
  dimensions: z.object({
    needsCapability: z.number().min(0).max(100), siblingProximity: z.number().min(0).max(100),
    schoolStability: z.number().min(0).max(100), culturalAlignment: z.number().min(0).max(100),
    experienceMatch: z.number().min(0).max(100), capacityFit: z.number().min(0).max(100),
  }),
  strengths: z.array(z.string()), concerns: z.array(z.string()),
  recommendation: z.enum(['strong_match', 'good_match', 'acceptable', 'concerns', 'not_recommended']),
});

export type ChildProfile = z.infer<typeof ChildProfileSchema>;
export type FosterFamily = z.infer<typeof FosterFamilySchema>;
export type PlacementMatch = z.infer<typeof PlacementMatchSchema>;

function geoDistMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180; const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function matchPlacement(child: ChildProfile, families: FosterFamily[]): PlacementMatch[] {
  return families
    .filter(f => f.capacity.available > 0 && child.age >= f.ageRange.min && child.age <= f.ageRange.max)
    .map(f => {
      // Needs vs capability
      const levelMap = { basic: 1, moderate: 2, specialized: 3, therapeutic: 4, intensive: 5 };
      const certLevel = f.certifications.includes('therapeutic') ? 4 : f.certifications.includes('medical') ? 3 : 2;
      const needsScore = certLevel >= levelMap[child.needs.level] ? 90 : certLevel >= levelMap[child.needs.level] - 1 ? 60 : 30;

      // Sibling proximity (simplified — would use real geocoding)
      const siblingScore = child.siblings.length === 0 ? 80 : f.capacity.available >= child.siblings.length + 1 ? 95 : 40;

      // School stability
      const schoolScore = !child.preferences.stayInSchool ? 70 : (f.schoolDistrict === child.school?.name) ? 95 : 50;

      // Cultural alignment
      const culturalScore = !child.preferences.culturalMatch ? 70
        : (f.ethnicity === child.ethnicity) ? 90
        : f.languages.some(l => child.languages.includes(l)) ? 75 : 40;

      // Experience
      const expScore = Math.min(100, 40 + f.experience.yearsLicensed * 5 + (1 - f.experience.disruptionRate) * 40);

      // Capacity
      const capScore = f.capacity.available >= 2 ? 90 : 70;

      const overall = Math.round(needsScore * 0.3 + siblingScore * 0.2 + schoolScore * 0.15 + culturalScore * 0.15 + expScore * 0.1 + capScore * 0.1);
      const rec = overall >= 85 ? 'strong_match' as const : overall >= 70 ? 'good_match' as const : overall >= 55 ? 'acceptable' as const : overall >= 40 ? 'concerns' as const : 'not_recommended' as const;

      const strengths: string[] = [];
      if (needsScore >= 80) strengths.push('Family certified for child\'s care level');
      if (siblingScore >= 80) strengths.push('Can accommodate sibling placement');
      if (schoolScore >= 80) strengths.push('Same school district — minimal disruption');

      const concerns: string[] = [];
      if (needsScore < 60) concerns.push('Family may not have certifications for child\'s needs');
      if (f.experience.disruptionRate > 0.3) concerns.push(`Higher disruption rate (${Math.round(f.experience.disruptionRate * 100)}%)`);

      return {
        childId: child.childId, familyId: f.familyId, matchedAt: new Date().toISOString(),
        overallScore: overall,
        dimensions: { needsCapability: needsScore, siblingProximity: siblingScore, schoolStability: schoolScore, culturalAlignment: culturalScore, experienceMatch: Math.round(expScore), capacityFit: capScore },
        strengths, concerns, recommendation: rec,
      };
    })
    .sort((a, b) => b.overallScore - a.overallScore);
}
