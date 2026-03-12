import { FamilyRubric } from './types';
import { RoleFamily } from '../types';
import { SOFTWARE_ENGINEERING_RUBRIC } from './software-engineering';
import { FRONTEND_ENGINEERING_RUBRIC } from './frontend-engineering';
import { QA_VALIDATION_RUBRIC } from './qa-validation';
import { DATA_ANALYST_RUBRIC } from './data-analyst';
import { DATA_ENGINEERING_RUBRIC } from './data-engineering';
import { DESKTOP_SUPPORT_RUBRIC } from './desktop-support';
import { BUSINESS_ANALYST_RUBRIC } from './business-analyst';
import { PRODUCT_MANAGER_RUBRIC } from './product-manager';
import { DEVOPS_SRE_RUBRIC } from './devops-sre';
import { DATA_SCIENCE_RUBRIC } from './data-science';

export const DEFAULT_RUBRIC: FamilyRubric = SOFTWARE_ENGINEERING_RUBRIC;

export const RUBRIC_REGISTRY: Map<RoleFamily, FamilyRubric> = new Map<
  RoleFamily,
  FamilyRubric
>([
  ['software-engineering', SOFTWARE_ENGINEERING_RUBRIC],
  ['frontend-engineering', FRONTEND_ENGINEERING_RUBRIC],
  ['qa-validation-compliance', QA_VALIDATION_RUBRIC],
  ['data-analyst', DATA_ANALYST_RUBRIC],
  ['data-engineering', DATA_ENGINEERING_RUBRIC],
  ['desktop-support', DESKTOP_SUPPORT_RUBRIC],
  ['business-analyst', BUSINESS_ANALYST_RUBRIC],
  ['product-management', PRODUCT_MANAGER_RUBRIC],
  ['devops-sre', DEVOPS_SRE_RUBRIC],
  ['data-science', DATA_SCIENCE_RUBRIC],
]);

export function getRubric(family: RoleFamily): FamilyRubric {
  return RUBRIC_REGISTRY.get(family) ?? DEFAULT_RUBRIC;
}


