/**
 * Skill Ontology
 *
 * Canonical skill names, aliases, and related skills for resume↔JD matching.
 * Used by the ATS engine for:
 * - Canonicalization (React/ReactJS/React.js → react)
 * - Semantic expansion (distributed systems → microservices, kafka, redis, ...)
 * - Related-skills lookups for explainability
 */

// ═════════════════════════════════════════════════════════════════════════════
// SYNONYM GROUPS (canonical = first element, rest = aliases)
// ═════════════════════════════════════════════════════════════════════════════

export const SYNONYM_GROUPS: string[][] = [
  ['javascript', 'js', 'ecmascript', 'es6', 'es2015', 'es2020'],
  ['typescript', 'ts'],
  ['react', 'react.js', 'reactjs', 'react js'],
  ['react native', 'reactnative', 'rn'],
  ['angular', 'angular.js', 'angularjs', 'angular 2+'],
  ['vue', 'vue.js', 'vuejs', 'vue 3'],
  ['next.js', 'nextjs', 'next js'],
  ['node', 'node.js', 'nodejs', 'node js'],
  ['express', 'express.js', 'expressjs'],
  ['python', 'python3', 'python 3'],
  ['java', 'java se', 'java ee', 'j2ee', 'java 8', 'java 11', 'java 17'],
  ['spring', 'spring boot', 'spring framework', 'springboot'],
  ['c#', 'csharp', 'c sharp', '.net', 'dotnet', 'asp.net'],
  ['c++', 'cpp', 'c plus plus'],
  ['go', 'golang', 'go lang'],
  ['rust', 'rust lang', 'rustlang'],
  ['ruby', 'ruby on rails', 'rails', 'ror'],
  ['php', 'laravel', 'symfony'],
  ['swift', 'swiftui'],
  ['kotlin', 'kotlin/jvm'],
  ['scala', 'scala lang'],
  ['sql', 'structured query language'],
  ['mysql', 'my sql'],
  ['postgresql', 'postgres', 'psql', 'pg'],
  ['mongodb', 'mongo', 'mongo db', 'nosql'],
  ['redis', 'redis cache'],
  ['elasticsearch', 'elastic search', 'elastic', 'opensearch'],
  ['dynamodb', 'dynamo db', 'dynamo'],
  ['cassandra', 'apache cassandra'],
  ['kafka', 'apache kafka', 'confluent kafka'],
  ['rabbitmq', 'rabbit mq', 'amqp'],
  ['aws', 'amazon web services', 'amazon aws'],
  ['gcp', 'google cloud', 'google cloud platform'],
  ['azure', 'microsoft azure', 'ms azure'],
  ['docker', 'containerization', 'containers'],
  ['kubernetes', 'k8s', 'kube', 'eks', 'aks', 'gke'],
  ['terraform', 'terraform iac', 'tf', 'hashicorp terraform'],
  ['ansible', 'ansible automation'],
  ['jenkins', 'jenkins ci'],
  ['ci/cd', 'cicd', 'ci cd', 'continuous integration', 'continuous deployment', 'continuous delivery'],
  ['git', 'github', 'gitlab', 'bitbucket', 'version control'],
  ['rest', 'rest api', 'restful', 'restful api'],
  ['graphql', 'graph ql'],
  ['grpc', 'g rpc', 'protocol buffers', 'protobuf'],
  ['microservices', 'micro services', 'micro-services'],
  ['machine learning', 'ml', 'deep learning', 'dl'],
  ['artificial intelligence', 'ai'],
  ['nlp', 'natural language processing'],
  ['computer vision', 'cv', 'image recognition'],
  ['tensorflow', 'tensor flow'],
  ['pytorch', 'py torch', 'torch'],
  ['scikit-learn', 'sklearn', 'scikit learn'],
  ['pandas', 'pd'],
  ['numpy', 'np'],
  ['spark', 'apache spark', 'pyspark'],
  ['hadoop', 'apache hadoop', 'hdfs', 'mapreduce'],
  ['airflow', 'apache airflow'],
  ['dbt', 'data build tool'],
  ['snowflake', 'snowflake db'],
  ['databricks', 'data bricks'],
  ['tableau', 'tableau desktop'],
  ['power bi', 'powerbi', 'power-bi'],
  ['html', 'html5'],
  ['css', 'css3', 'scss', 'sass', 'less'],
  ['tailwind', 'tailwind css', 'tailwindcss'],
  ['webpack', 'webpack 5', 'bundler'],
  ['vite', 'vitejs'],
  ['agile', 'scrum', 'kanban', 'agile methodology'],
  ['jira', 'atlassian jira'],
  ['figma', 'figma design'],
  ['linux', 'unix', 'ubuntu', 'centos', 'debian'],
  ['oauth', 'oauth2', 'openid connect', 'oidc'],
  ['jwt', 'json web token'],
  ['websocket', 'websockets', 'socket.io', 'ws'],
];

// ═════════════════════════════════════════════════════════════════════════════
// SEMANTIC IMPLICATIONS (broader concept → constituent skills)
// ═════════════════════════════════════════════════════════════════════════════

export const SKILL_IMPLICATIONS: Record<string, string[]> = {
  'distributed systems':  ['microservices', 'kafka', 'redis', 'load balancing', 'scalability', 'message queue'],
  'cloud architecture':   ['aws', 'gcp', 'azure', 'terraform', 'kubernetes', 'docker', 'iac'],
  'cloud infrastructure': ['aws', 'gcp', 'azure', 'terraform', 'kubernetes', 'docker'],
  'full stack':           ['javascript', 'react', 'node', 'sql', 'rest', 'html', 'css'],
  'frontend development': ['javascript', 'react', 'html', 'css', 'typescript'],
  'backend development':  ['node', 'python', 'java', 'sql', 'rest', 'microservices'],
  'data pipeline':        ['spark', 'airflow', 'kafka', 'sql', 'python', 'etl'],
  'data warehouse':       ['sql', 'snowflake', 'dbt', 'etl', 'data modeling'],
  'machine learning':     ['python', 'tensorflow', 'pytorch', 'scikit-learn', 'numpy', 'pandas'],
  'deep learning':        ['python', 'tensorflow', 'pytorch', 'gpu', 'neural networks'],
  'devops':               ['docker', 'kubernetes', 'ci/cd', 'terraform', 'jenkins', 'linux'],
  'site reliability':     ['linux', 'docker', 'kubernetes', 'monitoring', 'alerting', 'incident management'],
  'mobile development':   ['swift', 'kotlin', 'react native', 'flutter'],
  'api development':      ['rest', 'graphql', 'grpc', 'authentication', 'rate limiting'],
  'database design':      ['sql', 'postgresql', 'mongodb', 'redis', 'data modeling', 'indexing'],
  'event-driven':         ['kafka', 'rabbitmq', 'event sourcing', 'cqrs', 'microservices'],
  'containerization':     ['docker', 'kubernetes', 'container orchestration'],
  'infrastructure as code': ['terraform', 'ansible', 'cloudformation', 'pulumi'],
  'real-time systems':    ['websocket', 'kafka', 'redis', 'streaming', 'low latency'],
  'search systems':       ['elasticsearch', 'solr', 'search engine', 'indexing', 'ranking'],
  'security engineering': ['oauth', 'encryption', 'penetration testing', 'vulnerability', 'compliance'],
  'ci/cd pipeline':       ['jenkins', 'github actions', 'gitlab ci', 'docker', 'automated testing'],
  'test automation':      ['selenium', 'cypress', 'jest', 'junit', 'pytest', 'testing'],
  'agile development':    ['scrum', 'kanban', 'sprint', 'jira', 'retrospective'],
};

/** Canonical skill names for autocomplete (synonym group canonicals + implication keys). */
export const SKILL_SUGGESTIONS: string[] = [
  ...SYNONYM_GROUPS.map((g) => g[0]),
  ...Object.keys(SKILL_IMPLICATIONS).filter((k) => !SYNONYM_GROUPS.some((g) => g[0].toLowerCase() === k.toLowerCase())),
].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

// ── Lookup maps (built once) ─────────────────────────────────────────────────

const synonymMap = new Map<string, string>();
const aliasesByCanonical = new Map<string, string[]>();

for (const group of SYNONYM_GROUPS) {
  const canonical = group[0];
  const aliases = group.slice(1);
  for (const term of group) {
    synonymMap.set(term.toLowerCase(), canonical);
  }
  aliasesByCanonical.set(canonical, aliases);
}

/**
 * Normalize a skill string to its canonical form.
 * E.g. "ReactJS" → "react", "PostgreSQL" → "postgresql"
 */
export function canonicalize(skill: string): string {
  const lower = skill.toLowerCase().trim();
  return synonymMap.get(lower) || lower;
}

/**
 * Get all aliases for a canonical skill.
 * E.g. getAliases("react") → ["react.js", "reactjs", "react js"]
 */
export function getAliases(canonical: string): string[] {
  return aliasesByCanonical.get(canonical) ?? [];
}

/**
 * Get related (implied) skills for a broader concept.
 * E.g. getRelated("distributed systems") → ["microservices", "kafka", "redis", ...]
 */
export function getRelated(canonical: string): string[] {
  const key = canonical.toLowerCase();
  return SKILL_IMPLICATIONS[key] ?? [];
}

/**
 * Expand a set of skills with implied skills from the ontology.
 * Returns a new set including the originals plus implied skills (canonicalized).
 */
export function expandWithImplications(skills: string[] | Set<string>): Set<string> {
  const result = new Set<string>();
  const arr = Array.isArray(skills) ? skills : Array.from(skills);
  for (const s of arr) {
    const c = canonicalize(s);
    result.add(c);
    for (const implied of getRelated(c)) {
      result.add(canonicalize(implied));
    }
  }
  return result;
}
