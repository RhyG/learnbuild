export interface Style {
  bold(text: string): string;
  dim(text: string): string;
  cyan(text: string): string;
  green(text: string): string;
  yellow(text: string): string;
  magenta(text: string): string;
}

/** ANSI styling that turns into plain text when colour is off. */
export function makeStyle(enabled: boolean): Style {
  const wrap = (code: string) => (text: string) => (enabled ? `\x1b[${code}m${text}\x1b[0m` : text);
  return { bold: wrap('1'), dim: wrap('2'), cyan: wrap('36'), green: wrap('32'), yellow: wrap('33'), magenta: wrap('35') };
}

export function colourWanted(stream: { isTTY?: boolean }): boolean {
  return stream.isTTY === true && process.env['NO_COLOR'] === undefined && process.env['TERM'] !== 'dumb';
}
