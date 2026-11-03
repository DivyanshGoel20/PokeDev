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

/** Scroll a form field into view and focus it (used to point people at a missing field). */
export function focusField(id: string) {
  window.requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const input = el.querySelector<HTMLElement>("input, textarea, button");
    input?.focus({ preventScroll: true });
  });
}

export type FieldErrors = Partial<Record<"username" | "password" | "displayName" | "type", string>>;
