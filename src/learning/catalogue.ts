export interface Competency {
  id: string;
  title: string;
  prerequisites: string[];
}

export const STARTER_COMPETENCIES: readonly Competency[] = [
  { id: 'problem-framing', title: 'Problem framing', prerequisites: [] },
  { id: 'requirements-vs-implementation', title: 'Requirements versus implementation', prerequisites: ['problem-framing'] },
  { id: 'mvp-prioritisation', title: 'MVP prioritisation', prerequisites: ['problem-framing'] },
  { id: 'acceptance-criteria', title: 'Acceptance criteria', prerequisites: ['requirements-vs-implementation'] },
  { id: 'git-workflow', title: 'Git workflow', prerequisites: [] },
  { id: 'debugging-methodology', title: 'Debugging methodology', prerequisites: [] },
  { id: 'client-server-boundary', title: 'Client-server boundary', prerequisites: [] },
  { id: 'http-request-lifecycle', title: 'HTTP request lifecycle', prerequisites: ['client-server-boundary'] },
  { id: 'api-contracts', title: 'API contracts', prerequisites: ['http-request-lifecycle'] },
  { id: 'validation-and-trust-boundaries', title: 'Validation and trust boundaries', prerequisites: ['api-contracts'] },
  { id: 'authentication-vs-authorisation', title: 'Authentication versus authorisation', prerequisites: ['http-request-lifecycle'] },
  { id: 'state-management', title: 'State management', prerequisites: ['client-server-boundary'] },
  { id: 'relational-data-modelling', title: 'Relational data modelling', prerequisites: [] },
  { id: 'database-queries-and-transactions', title: 'Database queries and transactions', prerequisites: ['relational-data-modelling'] },
  { id: 'error-handling', title: 'Error handling', prerequisites: [] },
  { id: 'automated-testing', title: 'Automated testing', prerequisites: ['acceptance-criteria'] },
  { id: 'test-pyramid-tradeoffs', title: 'Test pyramid trade-offs', prerequisites: ['automated-testing'] },
  { id: 'secrets-and-environments', title: 'Secrets and environments', prerequisites: [] },
  { id: 'deployment-lifecycle', title: 'Deployment lifecycle', prerequisites: ['secrets-and-environments'] },
  { id: 'logs-and-observability', title: 'Logs and observability', prerequisites: ['error-handling'] },
  { id: 'architecture-tradeoffs', title: 'Architecture trade-offs', prerequisites: ['client-server-boundary'] },
  { id: 'dependency-management', title: 'Dependency management', prerequisites: [] },
  { id: 'source-control-review', title: 'Source control review', prerequisites: ['git-workflow'] },
  { id: 'ai-generated-code-verification', title: 'Verifying AI-generated code', prerequisites: ['automated-testing'] },
  { id: 'maintenance-and-technical-debt', title: 'Maintenance and technical debt', prerequisites: ['architecture-tradeoffs'] },
  { id: 'development-toolchain', title: 'Development toolchain', prerequisites: [] },
  { id: 'command-line-programs', title: 'Command-line programs', prerequisites: [] },
  { id: 'data-types-and-structures', title: 'Data types and structures', prerequisites: [] },
  { id: 'files-and-data-formats', title: 'Files and data formats', prerequisites: [] },
];

export const COMPETENCY_IDS: ReadonlySet<string> = new Set(STARTER_COMPETENCIES.map((c) => c.id));
