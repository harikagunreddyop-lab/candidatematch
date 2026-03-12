import { FamilyMatchType, RoleFamily } from '../types';

export interface FamilyTaxonomyEntry {
  canonical_titles: string[];
  alias_titles: string[];
  title_keywords: string[];
  adjacent_families: RoleFamily[];
  forbidden_families: RoleFamily[];
}

export const FAMILY_TAXONOMY: Record<RoleFamily, FamilyTaxonomyEntry> = {
  'software-engineering': {
    canonical_titles: [
      'software engineer',
      'software developer',
      'backend engineer',
      'backend developer',
    ],
    alias_titles: ['programmer', 'coder', 'swe'],
    title_keywords: ['engineer', 'developer', 'software', 'backend', 'server'],
    adjacent_families: ['fullstack-engineering', 'devops-sre'],
    forbidden_families: [
      'desktop-support',
      'data-analyst',
      'design-ux',
      'qa-validation-compliance',
    ],
  },

  'frontend-engineering': {
    canonical_titles: [
      'frontend engineer',
      'frontend developer',
      'ui engineer',
      'ui developer',
    ],
    alias_titles: ['web developer', 'web engineer'],
    title_keywords: [
      'frontend',
      'front-end',
      'ui',
      'react',
      'angular',
      'vue',
      'web',
    ],
    adjacent_families: [
      'fullstack-engineering',
      'software-engineering',
      'design-ux',
    ],
    forbidden_families: [
      'backend-engineering',
      'data-engineering',
      'devops-sre',
      'desktop-support',
    ],
  },

  'backend-engineering': {
    canonical_titles: [
      'backend engineer',
      'backend developer',
      'server-side engineer',
      'api engineer',
    ],
    alias_titles: ['platform engineer', 'services engineer'],
    title_keywords: ['backend', 'server', 'api', 'services', 'platform'],
    adjacent_families: [
      'software-engineering',
      'fullstack-engineering',
      'devops-sre',
    ],
    forbidden_families: [
      'frontend-engineering',
      'design-ux',
      'desktop-support',
      'qa-validation-compliance',
    ],
  },

  'fullstack-engineering': {
    canonical_titles: [
      'fullstack engineer',
      'full-stack engineer',
      'fullstack developer',
    ],
    alias_titles: ['full stack developer', 'full stack engineer'],
    title_keywords: ['fullstack', 'full-stack', 'full stack'],
    adjacent_families: [
      'software-engineering',
      'frontend-engineering',
      'backend-engineering',
      'mobile-engineering',
    ],
    forbidden_families: [
      'desktop-support',
      'qa-validation-compliance',
      'business-analyst',
    ],
  },

  'data-engineering': {
    canonical_titles: [
      'data engineer',
      'data platform engineer',
      'etl developer',
      'data infrastructure engineer',
    ],
    alias_titles: ['analytics engineer', 'big data engineer'],
    title_keywords: [
      'data engineer',
      'etl',
      'pipeline',
      'data platform',
      'data infrastructure',
    ],
    adjacent_families: ['data-science', 'software-engineering', 'devops-sre'],
    forbidden_families: [
      'frontend-engineering',
      'desktop-support',
      'design-ux',
      'qa-validation-compliance',
    ],
  },

  'data-science': {
    canonical_titles: [
      'data scientist',
      'applied scientist',
      'machine learning engineer',
    ],
    alias_titles: ['ml engineer', 'research scientist'],
    title_keywords: [
      'data science',
      'data scientist',
      'machine learning',
      'ml',
      'modeling',
    ],
    adjacent_families: ['data-engineering', 'data-analyst', 'software-engineering'],
    forbidden_families: [
      'desktop-support',
      'qa-validation-compliance',
      'design-ux',
    ],
  },

  'data-analyst': {
    canonical_titles: ['data analyst', 'business data analyst', 'reporting analyst'],
    alias_titles: ['bi analyst', 'analytics specialist'],
    title_keywords: ['data analyst', 'analytics', 'reporting', 'bi'],
    adjacent_families: ['business-analyst', 'data-science'],
    forbidden_families: [
      'desktop-support',
      'qa-validation-compliance',
      'devops-sre',
    ],
  },

  'business-analyst': {
    canonical_titles: ['business analyst', 'systems analyst', 'product analyst'],
    alias_titles: ['ba', 'bsa', 'business systems analyst'],
    title_keywords: ['business analyst', 'requirements analyst', 'bsa'],
    adjacent_families: ['product-management', 'data-analyst'],
    forbidden_families: [
      'desktop-support',
      'qa-validation-compliance',
      'devops-sre',
    ],
  },

  'devops-sre': {
    canonical_titles: [
      'devops engineer',
      'site reliability engineer',
      'sre',
      'platform reliability engineer',
    ],
    alias_titles: ['infrastructure engineer', 'cloud engineer'],
    title_keywords: ['devops', 'sre', 'site reliability', 'infrastructure', 'platform'],
    adjacent_families: [
      'software-engineering',
      'backend-engineering',
      'data-engineering',
      'systems-admin',
    ],
    forbidden_families: [
      'desktop-support',
      'design-ux',
      'qa-validation-compliance',
    ],
  },

  'mobile-engineering': {
    canonical_titles: [
      'mobile engineer',
      'ios engineer',
      'android engineer',
      'mobile developer',
    ],
    alias_titles: ['ios developer', 'android developer'],
    title_keywords: ['mobile', 'ios', 'android', 'react native', 'flutter'],
    adjacent_families: [
      'frontend-engineering',
      'fullstack-engineering',
      'software-engineering',
    ],
    forbidden_families: [
      'desktop-support',
      'data-engineering',
      'qa-validation-compliance',
    ],
  },

  'qa-software': {
    canonical_titles: [
      'qa engineer',
      'test engineer',
      'sdet',
      'quality engineer',
      'automation engineer',
    ],
    alias_titles: ['qa analyst', 'software tester'],
    title_keywords: ['qa', 'quality', 'test', 'testing', 'automation', 'sdet'],
    adjacent_families: ['software-engineering', 'qa-validation-compliance'],
    forbidden_families: [
      'data-engineering',
      'devops-sre',
      'desktop-support',
      'design-ux',
    ],
  },

  'qa-validation-compliance': {
    canonical_titles: [
      'validation engineer',
      'csv analyst',
      'qa validation',
      'compliance analyst',
      'quality assurance specialist',
    ],
    alias_titles: ['validation specialist', 'quality compliance analyst'],
    title_keywords: [
      'validation',
      'csv',
      'compliance',
      'regulatory',
      'gmp',
      'quality assurance',
    ],
    adjacent_families: ['qa-software'],
    forbidden_families: [
      'software-engineering',
      'frontend-engineering',
      'data-engineering',
      'desktop-support',
    ],
  },

  'security-engineering': {
    canonical_titles: [
      'security engineer',
      'application security engineer',
      'security analyst',
    ],
    alias_titles: ['appsec engineer', 'infosec engineer'],
    title_keywords: ['security', 'infosec', 'appsec', 'application security'],
    adjacent_families: ['software-engineering', 'devops-sre', 'systems-admin'],
    forbidden_families: [
      'desktop-support',
      'design-ux',
      'qa-validation-compliance',
    ],
  },

  'product-management': {
    canonical_titles: [
      'product manager',
      'product owner',
      'group product manager',
    ],
    alias_titles: ['pm', 'senior product manager'],
    title_keywords: ['product manager', 'product management', 'product owner'],
    adjacent_families: ['business-analyst', 'design-ux'],
    forbidden_families: ['desktop-support', 'qa-validation-compliance'],
  },

  'desktop-support': {
    canonical_titles: [
      'desktop support',
      'it support',
      'helpdesk analyst',
      'it technician',
      'end user support',
    ],
    alias_titles: ['service desk analyst', 'support technician'],
    title_keywords: [
      'desktop',
      'helpdesk',
      'it support',
      'end user',
      'technician',
    ],
    adjacent_families: ['systems-admin'],
    forbidden_families: [
      'software-engineering',
      'data-engineering',
      'data-science',
      'qa-validation-compliance',
      'product-management',
    ],
  },

  'systems-admin': {
    canonical_titles: [
      'systems administrator',
      'system administrator',
      'sysadmin',
      'infrastructure administrator',
    ],
    alias_titles: ['windows administrator', 'linux administrator'],
    title_keywords: ['sysadmin', 'systems administrator', 'system admin'],
    adjacent_families: ['devops-sre', 'desktop-support', 'security-engineering'],
    forbidden_families: [
      'software-engineering',
      'frontend-engineering',
      'design-ux',
      'qa-validation-compliance',
    ],
  },

  'management-engineering': {
    canonical_titles: [
      'engineering manager',
      'director of engineering',
      'vp of engineering',
    ],
    alias_titles: ['tech lead manager', 'head of engineering'],
    title_keywords: [
      'engineering manager',
      'director of engineering',
      'head of engineering',
    ],
    adjacent_families: ['software-engineering', 'product-management'],
    forbidden_families: [
      'desktop-support',
      'qa-validation-compliance',
      'data-analyst',
    ],
  },

  'design-ux': {
    canonical_titles: [
      'product designer',
      'ux designer',
      'ui/ux designer',
      'interaction designer',
    ],
    alias_titles: ['ux researcher', 'ux strategist'],
    title_keywords: ['ux', 'ui', 'design', 'user experience', 'product design'],
    adjacent_families: ['frontend-engineering', 'product-management'],
    forbidden_families: [
      'data-engineering',
      'devops-sre',
      'desktop-support',
      'qa-validation-compliance',
    ],
  },

  general: {
    canonical_titles: [],
    alias_titles: [],
    title_keywords: [],
    adjacent_families: [],
    forbidden_families: [],
  },
};

export function getFamilyTaxonomy(
  family: RoleFamily,
): FamilyTaxonomyEntry | null {
  return FAMILY_TAXONOMY[family] ?? null;
}

export function getAdjacentFamilies(family: RoleFamily): RoleFamily[] {
  return FAMILY_TAXONOMY[family]?.adjacent_families ?? [];
}

export function getForbiddenFamilies(family: RoleFamily): RoleFamily[] {
  return FAMILY_TAXONOMY[family]?.forbidden_families ?? [];
}

const JOB_ENGINEERING: RoleFamily[] = [
  'software-engineering',
  'frontend-engineering',
  'backend-engineering',
  'fullstack-engineering',
  'mobile-engineering',
];

const DATA_DOMAIN: RoleFamily[] = [
  'data-engineering',
  'data-science',
  'data-analyst',
];

export function getFamilyMatchType(
  jobFamily: RoleFamily,
  candidateFamily: RoleFamily,
): FamilyMatchType {
  if (jobFamily === candidateFamily) return 'exact';

  if (getAdjacentFamilies(jobFamily).includes(candidateFamily)) {
    return 'adjacent';
  }

  if (getForbiddenFamilies(jobFamily).includes(candidateFamily)) {
    return 'forbidden';
  }

  const bothEngineering =
    JOB_ENGINEERING.includes(jobFamily) &&
    JOB_ENGINEERING.includes(candidateFamily);
  const bothData =
    DATA_DOMAIN.includes(jobFamily) && DATA_DOMAIN.includes(candidateFamily);

  if (bothEngineering || bothData) {
    return 'broad-related';
  }

  return 'mismatch';
}


