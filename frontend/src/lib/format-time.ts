const SOURCE_LABELS: Record<string, string> = {
  USER_REQUEST: "USER",
  USER: "USER",
  DOCUMENT: "DOCUMENT",
  PDF: "DOCUMENT",
  EMAIL: "EMAIL",
  WEB_PAGE: "WEB",
  WEBPAGE: "WEB",
  SYSTEM: "SYSTEM",
  TOOL_OUTPUT: "TOOL",
};

function parseTimestamp(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return Number.NaN;
  }
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return Date.parse(trimmed);
  }
  const iso = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  return Date.parse(`${iso}Z`);
}

export function formatRelativeTime(value: string, now = Date.now()): string {
  const then = parseTimestamp(value);
  if (Number.isNaN(then)) {
    return "";
  }
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 1) {
    return "just now";
  }
  if (seconds < 60) {
    return `${seconds} sec ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }
  return formatClockTime(value);
}

export function formatClockTime(value: string): string {
  const then = parseTimestamp(value);
  if (Number.isNaN(then)) {
    return "";
  }
  return new Date(then).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function formatSourceLabel(sourceType: string | null | undefined): string {
  if (!sourceType) {
    return "UNKNOWN";
  }
  return SOURCE_LABELS[sourceType] ?? sourceType.replace(/_/g, " ");
}

export function formatToolLabel(toolName: string): string {
  const normalized = toolName.toLowerCase();
  if (normalized.includes("browse") || normalized === "browser") {
    return "Browser";
  }
  if (
    normalized.includes("file") ||
    normalized.includes("filesystem") ||
    normalized === "read_file" ||
    normalized === "write_file" ||
    normalized === "list_files"
  ) {
    return "Files";
  }
  if (normalized.includes("email") || normalized === "send_email") {
    return "Email";
  }
  if (normalized === "shield") {
    return "Shield";
  }
  return toolName.replace(/_/g, " ");
}
