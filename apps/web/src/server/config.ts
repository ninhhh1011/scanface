export function config(name: string): string { return process.env[name]?.trim() ?? ''; }
export function required(name: string): string {
  const value = config(name);
  if (!value) throw new Error(`CONFIG_MISSING:${name}`);
  return value;
}
