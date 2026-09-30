const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  detail?: string;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export function getApiUrl(): string {
  return API_URL;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    let detail: string | undefined;
    try {
      const body: unknown = JSON.parse(await response.text());
      if (body && typeof body === "object" && "detail" in body && typeof body.detail === "string") {
        detail = body.detail;
      }
    } catch {
      detail = undefined;
    }
    throw new ApiError(`Request failed: ${response.status}`, response.status, detail);
  }
  return response.json() as Promise<T>;
}

export const api = {
  get<T>(path: string, init?: RequestInit): Promise<T> {
    return request<T>(path, { ...init, method: "GET" });
  },
  post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return request<T>(path, {
      ...init,
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  },
};

export async function fetchHealth(): Promise<{ status: string }> {
  return api.get("/health");
}
