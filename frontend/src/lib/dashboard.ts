export const DASHBOARD_EVENT_LIMIT = 20;
export const DASHBOARD_POLL_INTERVAL_MS = 5000;

export type ActivityFilter = "ALL" | "ALLOW" | "APPROVAL_REQUIRED" | "BLOCK";

export const ACTIVITY_FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "ALLOW", label: "Allowed" },
  { id: "APPROVAL_REQUIRED", label: "Approval" },
  { id: "BLOCK", label: "Blocked" },
];
