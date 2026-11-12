import { lstat, open, readdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fail } from '../domain/errors.js';

// This module is the read-only capability for explain mode. It imports only
// read operations from node:fs and never spawns a process; a test enforces both.

export interface InspectorLimits {
  /** Bytes read from any single file; larger files are truncated or skipped. */
  maxFileBytes: number;
  /** Files visited in one walk. */
  maxFiles: number;
  /** Directory levels below the starting directory. */
  maxDepth: number;
  /** Total bytes read during one search. */
  maxTotalBytes: number;
  maxSnippetLines: number;
  maxSearchResults: number;
}

export const DEFAULT_LIMITS: InspectorLimits = {
  maxFileBytes: 256 * 1024,
  maxFiles: 2000,
  maxDepth: 8,
  maxTotalBytes: 16 * 1024 * 1024,
  maxSnippetLines: 200,
  maxSearchResults: 50,
};

const EXCLUDED_DIRECTORIES: ReadonlySet<string> = new Set([
  '.git', '.hg', '.svn', 'node_modules', 'vendor', 'bower_components',
  'dist', 'build', 'out', 'target', 'coverage', '.next', '.nuxt', '.turbo', '.cache',
  '.venv', 'venv', '__pycache__', '.ssh', '.aws', '.gnupg',
]);

const SECRET_NAMES: ReadonlySet<string> = new Set([
  '.npmrc', '.netrc', '.pypirc', '.htpasswd', '.git-credentials',
  'credentials', 'credentials.json', 'secrets.json', 'secrets.yaml', 'secrets.yml',
]);
const SECRET_EXTENSIONS = ['.pem', '.key', '.p12', '.pfx', '.keystore', '.jks'];
const SECRET_PREFIXES = ['id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519'];
const ENV_TEMPLATE_SUFFIXES = ['.example', '.sample', '.template'];

export function isSecretName(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower === '.env' || lower.startsWith('.env.')) return !ENV_TEMPLATE_SUFFIXES.some((s) => lower.endsWith(s));
  if (SECRET_NAMES.has(lower)) return true;
  if (SECRET_EXTENSIONS.some((ext) => lower.endsWith(ext))) return true;
  return SECRET_PREFIXES.some((p) => lower.startsWith(p));
}

export type SkipReason =
  | 'excluded_directory'
  | 'secret_file'
  | 'symlink_outside_root'
  | 'symlink_not_followed'
  | 'broken_symlink'
  | 'too_large'
  | 'binary'
  | 'unreadable';

export interface Coverage {
  filesVisited: number;
  skippedCount: number;
  /** First skipped paths, for reporting; `skippedCount` is the full number. */
  skipped: { path: string; reason: SkipReason }[];
  /** True when a limit stopped the inspection before it covered everything. */
  truncated: boolean;
  truncatedBy: string[];
}

export interface Entry {
  path: string;
  type: 'file' | 'directory';
  size: number;
}

export interface SnippetLine {
  line: number;
  text: string;
}

export interface Snippet {
  path: string;
  startLine: number;
  endLine: number;
  /** Lines in the portion read; equals the file's line count unless `fileTruncated`. */
  totalLines: number;
  fileTruncated: boolean;
  citation: string;
  lines: SnippetLine[];
}

export interface Match {
  path: string;
  line: number;
  text: string;
  citation: string;
}

export interface SearchResult {
  query: string;
  found: boolean;
  matches: Match[];
  coverage: Coverage;
}

export interface Overview {
  root: string;
  manifests: string[];
  docs: string[];
  topLevel: Entry[];
  entrypointCandidates: string[];
  /** Fields copied from package.json as data. Scripts are listed, never run. */
  packageJson: { name?: string; main?: string; bin?: string[]; scripts?: Record<string, string>; dependencies?: string[] } | null;
  filesByExtension: Record<string, number>;
  coverage: Coverage;
}

const MANIFEST_NAMES: ReadonlySet<string> = new Set([
  'package.json', 'tsconfig.json', 'pyproject.toml', 'requirements.txt', 'setup.py', 'Cargo.toml', 'go.mod',
  'pom.xml', 'build.gradle', 'build.gradle.kts', 'Gemfile', 'composer.json', 'Dockerfile', 'docker-compose.yml',
  'Makefile',
]);
const ENTRYPOINT_PATTERN = /^(src\/)?(index|main|app|server|cli)\.[a-z]+$/;
const MAX_SKIPPED_LISTED = 50;
const MAX_LINE_LENGTH = 240;
const SYMBOL_NAME = /^[A-Za-z_$][\w$]*$/;
const DECLARATION_KEYWORDS = 'function\\*?|class|interface|type|enum|const|let|var|def|fn|func|struct|trait|module|namespace';

function toPosix(path: string): string {
  return sep === '/' ? path : path.split(sep).join('/');
}

function newCoverage(): Coverage {
  return { filesVisited: 0, skippedCount: 0, skipped: [], truncated: false, truncatedBy: [] };
}

function skip(coverage: Coverage, path: string, reason: SkipReason): void {
  coverage.skippedCount += 1;
  if (coverage.skipped.length < MAX_SKIPPED_LISTED) coverage.skipped.push({ path, reason });
}

function truncate(coverage: Coverage, by: string): void {
  coverage.truncated = true;
  if (!coverage.truncatedBy.includes(by)) coverage.truncatedBy.push(by);
}

interface ResolvedPath {
  absolute: string;
  /** Path relative to the root as the caller wrote it, with forward slashes. */
  relative: string;
  isDirectory: boolean;
  size: number;
}

interface WalkedFile {
  path: string;
  absolute: string;
  size: number;
}

/**
 * Read-only view of one repository. Every path is confined to the root after
 * symlink resolution, and secret, vendor and build paths are refused.
 */
export class RepoInspector {
  private constructor(
    readonly root: string,
    readonly limits: InspectorLimits,
  ) {}

  static async open(root: string, limits: Partial<InspectorLimits> = {}): Promise<RepoInspector> {
    let real: string;
    try {
      real = await realpath(resolve(root));
    } catch {
      fail('PATH_NOT_FOUND', `Repository root ${root} does not exist.`, { root });
    }
    if (!(await stat(real)).isDirectory()) fail('INVALID_INPUT', `Repository root ${root} is not a directory.`);
    return new RepoInspector(real, { ...DEFAULT_LIMITS, ...limits });
  }

  private relativeInside(absolute: string): string | null {
    const rel = relative(this.root, absolute);
    if (rel === '') return '';
    if (rel.startsWith('..') || isAbsolute(rel)) return null;
    return toPosix(rel);
  }

  private exclusion(rel: string, isDirectory: boolean): SkipReason | null {
    if (rel === '') return null;
    const segments = rel.split('/');
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;
      const isDir = i < segments.length - 1 || isDirectory;
      if (isDir && EXCLUDED_DIRECTORIES.has(segment)) return 'excluded_directory';
      if (isSecretName(segment)) return 'secret_file';
    }
    return null;
  }

  private async resolvePath(input: string): Promise<ResolvedPath> {
    if (input.includes('\0')) fail('INVALID_INPUT', 'Path contains a null byte.');
    const lexical = resolve(this.root, input);
    const rel = this.relativeInside(lexical);
    if (rel === null) {
      fail('PATH_OUTSIDE_ROOT', `"${input}" is outside the repository root.`, { path: input });
    }
    let real: string;
    try {
      real = await realpath(lexical);
    } catch {
      fail('PATH_NOT_FOUND', `"${rel}" does not exist in this repository.`, { path: rel });
    }
    const realRel = this.relativeInside(real);
    if (realRel === null) {
      fail('PATH_OUTSIDE_ROOT', `"${rel}" is a symlink that resolves outside the repository root.`, { path: rel });
    }
    const info = await stat(real);
    const reason = this.exclusion(rel, info.isDirectory()) ?? this.exclusion(realRel, info.isDirectory());
    if (reason !== null) {
      fail('PATH_EXCLUDED', `"${rel}" is not available in explain mode (${reason.replaceAll('_', ' ')}).`, {
        path: rel,
        reason,
      });
    }
    return { absolute: real, relative: rel, isDirectory: info.isDirectory(), size: info.size };
  }

  private async *walk(
    start: ResolvedPath,
    coverage: Coverage,
    maxDepth: number,
    includeDirectories: boolean,
  ): AsyncGenerator<Entry & { absolute: string }> {
    const queue: { absolute: string; rel: string; depth: number }[] = [
      { absolute: start.absolute, rel: start.relative, depth: 0 },
    ];
    while (queue.length > 0) {
      const dir = queue.shift()!;
      let dirents;
      try {
        dirents = await readdir(dir.absolute, { withFileTypes: true });
      } catch {
        skip(coverage, dir.rel, 'unreadable');
        continue;
      }
      dirents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      for (const dirent of dirents) {
        const rel = dir.rel === '' ? dirent.name : `${dir.rel}/${dirent.name}`;
        const absolute = join(dir.absolute, dirent.name);
        const isDirectory = dirent.isDirectory();
        const isFile = dirent.isFile();

        if (dirent.isSymbolicLink()) {
          let target: string;
          try {
            target = await realpath(absolute);
          } catch {
            skip(coverage, rel, 'broken_symlink');
            continue;
          }
          const targetRel = this.relativeInside(target);
          if (targetRel === null) {
            skip(coverage, rel, 'symlink_outside_root');
            continue;
          }
          const info = await stat(target);
          const reason = this.exclusion(targetRel, info.isDirectory());
          // The target is walked at its real location, so following the link would
          // report it twice and directory links could form cycles.
          skip(coverage, rel, reason ?? 'symlink_not_followed');
          continue;
        }

        if (isDirectory) {
          if (this.exclusion(rel, true) !== null) {
            skip(coverage, rel, this.exclusion(rel, true)!);
            continue;
          }
          if (includeDirectories) yield { path: rel, type: 'directory', size: 0, absolute };
          if (dir.depth + 1 > maxDepth) truncate(coverage, `max_depth:${maxDepth}`);
          else queue.push({ absolute, rel, depth: dir.depth + 1 });
          continue;
        }
        if (!isFile) continue;
        if (isSecretName(dirent.name)) {
          skip(coverage, rel, 'secret_file');
          continue;
        }
        if (coverage.filesVisited >= this.limits.maxFiles) {
          truncate(coverage, `max_files:${this.limits.maxFiles}`);
          return;
        }
        coverage.filesVisited += 1;
        let size = 0;
        try {
          size = (await lstat(absolute)).size;
        } catch {
          skip(coverage, rel, 'unreadable');
          continue;
        }
        yield { path: rel, type: 'file', size, absolute };
      }
    }
  }

  /** Reads at most `maxFileBytes` of a file through a read-only handle. */
  private async readText(absolute: string): Promise<{ text: string; truncated: boolean; binary: boolean; bytes: number }> {
    const handle = await open(absolute, 'r');
    try {
      const buffer = Buffer.alloc(this.limits.maxFileBytes + 1);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const truncated = bytesRead > this.limits.maxFileBytes;
      const data = buffer.subarray(0, Math.min(bytesRead, this.limits.maxFileBytes));
      const binary = data.subarray(0, 8192).includes(0);
      return { text: binary ? '' : data.toString('utf8'), truncated, binary, bytes: data.length };
    } finally {
      await handle.close();
    }
  }

  async list(path = '.', depth = 1): Promise<{ path: string; entries: Entry[]; coverage: Coverage }> {
    const start = await this.resolvePath(path);
    if (!start.isDirectory) fail('INVALID_INPUT', `"${start.relative}" is a file; use read for files.`);
    const coverage = newCoverage();
    const entries: Entry[] = [];
    const maxDepth = Math.min(Math.max(depth, 1), this.limits.maxDepth) - 1;
    for await (const entry of this.walk(start, coverage, maxDepth, true)) {
      entries.push({ path: entry.path, type: entry.type, size: entry.size });
    }
    // A depth the caller chose is expected, so only the configured ceiling counts as truncation.
    if (depth <= this.limits.maxDepth) {
      coverage.truncatedBy = coverage.truncatedBy.filter((t) => !t.startsWith('max_depth'));
      coverage.truncated = coverage.truncatedBy.length > 0;
    }
    return { path: start.relative || '.', entries, coverage };
  }

  async read(path: string, startLine = 1, endLine?: number): Promise<Snippet> {
    const target = await this.resolvePath(path);
    if (target.isDirectory) fail('INVALID_INPUT', `"${target.relative}" is a directory; use list for directories.`);
    const { text, truncated, binary } = await this.readText(target.absolute);
    if (binary) fail('PATH_EXCLUDED', `"${target.relative}" looks like a binary file.`, { reason: 'binary' });
    const all = text.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
    if (all.length > 1 && all[all.length - 1] === '') all.pop();
    if (!Number.isInteger(startLine) || startLine < 1) fail('INVALID_INPUT', 'Start line must be 1 or greater.');
    if (startLine > all.length) {
      fail('INVALID_INPUT', `"${target.relative}" has ${all.length} lines; line ${startLine} does not exist.`, {
        totalLines: all.length,
      });
    }
    const requestedEnd = endLine ?? startLine + this.limits.maxSnippetLines - 1;
    if (requestedEnd < startLine) fail('INVALID_INPUT', 'End line must not be before start line.');
    const last = Math.min(requestedEnd, all.length, startLine + this.limits.maxSnippetLines - 1);
    const lines = all.slice(startLine - 1, last).map((textLine, i) => ({ line: startLine + i, text: textLine }));
    return {
      path: target.relative,
      startLine,
      endLine: last,
      totalLines: all.length,
      fileTruncated: truncated,
      citation: `${target.relative}:${startLine}-${last}`,
      lines,
    };
  }

  private async scan(query: string, path: string, matches: (line: string) => boolean): Promise<SearchResult> {
    const start = await this.resolvePath(path);
    const coverage = newCoverage();
    const found: Match[] = [];
    let totalBytes = 0;

    const files: AsyncIterable<WalkedFile> = start.isDirectory
      ? this.walk(start, coverage, this.limits.maxDepth, false)
      : (async function* () {
          coverage.filesVisited = 1;
          yield { path: start.relative, absolute: start.absolute, size: start.size };
        })();

    outer: for await (const file of files) {
      if (file.size > this.limits.maxFileBytes) {
        skip(coverage, file.path, 'too_large');
        continue;
      }
      if (totalBytes + file.size > this.limits.maxTotalBytes) {
        truncate(coverage, `max_total_bytes:${this.limits.maxTotalBytes}`);
        break;
      }
      let content;
      try {
        content = await this.readText(file.absolute);
      } catch {
        skip(coverage, file.path, 'unreadable');
        continue;
      }
      totalBytes += content.bytes;
      if (content.binary) {
        skip(coverage, file.path, 'binary');
        continue;
      }
      const lines = content.text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (!matches(line)) continue;
        if (found.length >= this.limits.maxSearchResults) {
          truncate(coverage, `max_results:${this.limits.maxSearchResults}`);
          break outer;
        }
        found.push({
          path: file.path,
          line: i + 1,
          text: line.trim().slice(0, MAX_LINE_LENGTH),
          citation: `${file.path}:${i + 1}`,
        });
      }
    }
    return { query, found: found.length > 0, matches: found, coverage };
  }

  /** Case-insensitive literal text search. */
  async search(query: string, path = '.'): Promise<SearchResult> {
    if (query.trim() === '') fail('INVALID_INPUT', 'Search text must not be empty.');
    const needle = query.toLowerCase();
    return this.scan(query, path, (line) => line.toLowerCase().includes(needle));
  }

  /**
   * Finds lines that declare `name`. `found: false` means no declaration was
   * seen in the files covered; check `coverage.truncated` before saying the
   * symbol does not exist.
   */
  async findSymbol(name: string, path = '.'): Promise<SearchResult> {
    if (!SYMBOL_NAME.test(name)) fail('INVALID_INPUT', `"${name}" is not a valid symbol name.`);
    const escaped = name.replaceAll('$', '\\$');
    const declaration = new RegExp(
      `(?:^|[^\\w$])(?:${DECLARATION_KEYWORDS})\\s+${escaped}(?![\\w$])|(?:^|[\\s,{(])${escaped}\\s*[:=]\\s*(?:async\\s*)?(?:function\\b|\\([^)]*\\)\\s*(?::[^=]+)?=>)|^\\s*(?:(?:public|private|protected|static|async|export|override)\\s+)*${escaped}\\s*\\([^)]*\\)\\s*(?::[^{]+)?\\{`,
    );
    return this.scan(name, path, (line) => declaration.test(line));
  }

  async overview(): Promise<Overview> {
    const start = await this.resolvePath('.');
    const coverage = newCoverage();
    const topLevel: Entry[] = [];
    const manifests: string[] = [];
    const docs: string[] = [];
    const entrypointCandidates: string[] = [];
    const filesByExtension: Record<string, number> = {};
    let packageJsonPath: string | null = null;

    for await (const entry of this.walk(start, coverage, this.limits.maxDepth, true)) {
      const name = entry.path.slice(entry.path.lastIndexOf('/') + 1);
      const isTop = !entry.path.includes('/');
      if (isTop) topLevel.push({ path: entry.path, type: entry.type, size: entry.size });
      if (entry.type === 'directory') {
        if (isTop && name.toLowerCase() === 'docs') docs.push(entry.path);
        continue;
      }
      if (MANIFEST_NAMES.has(name) && entry.path.split('/').length <= 2) manifests.push(entry.path);
      if (isTop && /^readme(\.|$)/i.test(name)) docs.push(entry.path);
      if (ENTRYPOINT_PATTERN.test(entry.path)) entrypointCandidates.push(entry.path);
      if (entry.path === 'package.json') packageJsonPath = entry.absolute;
      const dot = name.lastIndexOf('.');
      const ext = dot > 0 ? name.slice(dot) : '(none)';
      filesByExtension[ext] = (filesByExtension[ext] ?? 0) + 1;
    }

    let packageJson: Overview['packageJson'] = null;
    if (packageJsonPath !== null) {
      packageJson = await this.readPackageJson(packageJsonPath);
      for (const candidate of [packageJson?.main, ...(packageJson?.bin ?? [])]) {
        const normalised = candidate?.replace(/^\.\//, '');
        if (normalised && !entrypointCandidates.includes(normalised)) entrypointCandidates.push(normalised);
      }
    }
    return { root: this.root, manifests, docs, topLevel, entrypointCandidates, packageJson, filesByExtension, coverage };
  }

  private async readPackageJson(absolute: string): Promise<Overview['packageJson']> {
    try {
      const { text, truncated } = await this.readText(absolute);
      if (truncated) return null;
      const raw: unknown = JSON.parse(text);
      if (typeof raw !== 'object' || raw === null) return null;
      const pkg = raw as Record<string, unknown>;
      const result: NonNullable<Overview['packageJson']> = {};
      if (typeof pkg['name'] === 'string') result.name = pkg['name'];
      if (typeof pkg['main'] === 'string') result.main = pkg['main'];
      if (typeof pkg['bin'] === 'string') result.bin = [pkg['bin']];
      else if (typeof pkg['bin'] === 'object' && pkg['bin'] !== null) {
        result.bin = Object.values(pkg['bin']).filter((v): v is string => typeof v === 'string');
      }
      if (typeof pkg['scripts'] === 'object' && pkg['scripts'] !== null) {
        result.scripts = Object.fromEntries(
          Object.entries(pkg['scripts']).filter((e): e is [string, string] => typeof e[1] === 'string'),
        );
      }
      const deps = { ...(pkg['dependencies'] as object | undefined), ...(pkg['devDependencies'] as object | undefined) };
      if (Object.keys(deps).length > 0) result.dependencies = Object.keys(deps).sort();
      return result;
    } catch {
      return null;
    }
  }
}
