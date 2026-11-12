export type ErrorCode =
  | 'INVALID_INPUT'
  | 'UNKNOWN_TASK'
  | 'UNKNOWN_DECISION'
  | 'UNKNOWN_CHECKPOINT'
  | 'UNKNOWN_THREAD'
  | 'DUPLICATE_ID'
  | 'DECISION_NOT_PENDING'
  | 'DECISION_MISMATCH'
  | 'INVALID_SELECTION'
  | 'CONFIRMATION_REQUIRED'
  | 'GATE_UNSATISFIED'
  | 'INVALID_TRANSITION'
  | 'VERIFICATION_REJECTED'
  | 'NO_ACTIVE_THREAD'
  | 'REVISION_CONFLICT'
  | 'LOCK_TIMEOUT'
  | 'STATE_NOT_FOUND'
  | 'STATE_EXISTS'
  | 'STATE_CORRUPT'
  | 'SCHEMA_INVALID'
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'UNSAFE_ROOT'
  | 'PATH_OUTSIDE_ROOT'
  | 'PATH_EXCLUDED'
  | 'PATH_NOT_FOUND'
  | 'INSTALL_CONFLICT';

export class LearnBuildError extends Error {
  readonly code: ErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: ErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'LearnBuildError';
    this.code = code;
    this.details = details;
  }
}

export function fail(code: ErrorCode, message: string, details: Record<string, unknown> = {}): never {
  throw new LearnBuildError(code, message, details);
}
