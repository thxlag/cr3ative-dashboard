export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type FetchOptions = {
  method?: HttpMethod;
  body?: Record<string, unknown> | FormData;
  signal?: AbortSignal;
  headers?: Record<string, string>;
};

const defaultHeaders = {
  "Content-Type": "application/json",
};

export async function fetchJson<T>(input: string, options: FetchOptions = {}): Promise<T> {
  const { method = "GET", body, signal, headers } = options;
  const init: RequestInit = {
    method,
    credentials: "include",
    signal,
    headers: body instanceof FormData ? headers : { ...defaultHeaders, ...headers },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  };

  const response = await fetch(input, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return response.json() as Promise<T>;
}
