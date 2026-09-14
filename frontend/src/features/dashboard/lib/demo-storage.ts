/** Demo records are isolated from other features and from other staff on this browser. */
export function dashboardStorageKey(userId: number | string, key: string) {
  return `nextlink.dashboard.demo.user-${encodeURIComponent(String(userId))}.${key}`;
}
