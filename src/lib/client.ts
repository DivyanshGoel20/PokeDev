export async function postJSON<T = Record<string, unknown>>(
  url: string,
  body: unknown,
  method = "POST",
): Promise<T & { error?: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data.error) data.error = `Something went wrong (${res.status})`;
    return data;
  } catch {
    return { error: "Network error, check your connection" } as T & { error?: string };
  }
}
