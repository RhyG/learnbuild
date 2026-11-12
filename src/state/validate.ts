import { fail } from '../domain/errors.js';

// Minimal structural validation helpers. Each collects every problem it finds
// so a corrupt file produces one complete report.

export class Validator {
  readonly problems: string[] = [];

  problem(path: string, message: string): void {
    this.problems.push(`${path}: ${message}`);
  }

  isObject(path: string, value: unknown): value is Record<string, unknown> {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) return true;
    this.problem(path, 'expected an object');
    return false;
  }

  string(path: string, value: unknown, { allowEmpty = false } = {}): value is string {
    if (typeof value === 'string' && (allowEmpty || value.trim() !== '')) return true;
    this.problem(path, allowEmpty ? 'expected a string' : 'expected a non-empty string');
    return false;
  }

  nullableString(path: string, value: unknown): void {
    if (value !== null) this.string(path, value);
  }

  optionalString(path: string, value: unknown): void {
    if (value !== undefined) this.string(path, value);
  }

  integer(path: string, value: unknown, min = 0): value is number {
    if (typeof value === 'number' && Number.isInteger(value) && value >= min) return true;
    this.problem(path, `expected an integer >= ${min}`);
    return false;
  }

  boolean(path: string, value: unknown): value is boolean {
    if (typeof value === 'boolean') return true;
    this.problem(path, 'expected a boolean');
    return false;
  }

  oneOf<T extends string>(path: string, value: unknown, allowed: readonly T[]): value is T {
    if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return true;
    this.problem(path, `expected one of ${allowed.join(', ')}`);
    return false;
  }

  stringArray(path: string, value: unknown): value is string[] {
    if (!Array.isArray(value)) {
      this.problem(path, 'expected an array of strings');
      return false;
    }
    value.forEach((item, i) => this.string(`${path}[${i}]`, item));
    return true;
  }

  array(path: string, value: unknown): value is unknown[] {
    if (Array.isArray(value)) return true;
    this.problem(path, 'expected an array');
    return false;
  }

  record(path: string, value: unknown, each: (key: string, item: unknown, itemPath: string) => void): void {
    if (!this.isObject(path, value)) return;
    for (const [key, item] of Object.entries(value)) each(key, item, `${path}.${key}`);
  }

  throwIfInvalid(documentName: string): void {
    if (this.problems.length > 0) {
      fail('SCHEMA_INVALID', `${documentName} failed validation: ${this.problems.slice(0, 10).join('; ')}`, {
        problems: this.problems,
      });
    }
  }
}
