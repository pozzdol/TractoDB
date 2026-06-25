/** Map a connection type to a Monaco SQL dialect language id.
 *  Kept monaco-free so the static graph (QueryView) doesn't pull in Monaco. */
export function dialectFor(type: string): string {
  if (type === 'postgresql') return 'pgsql'
  if (type === 'mysql') return 'mysql'
  return 'sql'
}
