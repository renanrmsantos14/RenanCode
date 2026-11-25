/** Joins a typed address ("5173", "localhost:5173" or a full URL) and a route into the page a Frame opens. */
export function buildFrameUrl(address: string, route: string): string | null {
  const trimmed = address.trim();
  if (trimmed === "") return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return null;
  const base = /^\d{1,5}$/.test(trimmed)
    ? `http://localhost:${trimmed}`
    : /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `http://${trimmed}`;
  const path = route.trim();
  try {
    const origin = new URL(base);
    if (origin.protocol !== "http:" && origin.protocol !== "https:") return null;
    const relative = path === "" ? "/" : /^[/?#]/.test(path) ? path : `/${path}`;
    return new URL(relative, origin.origin).href;
  } catch {
    return null;
  }
}
