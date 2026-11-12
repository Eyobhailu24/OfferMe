export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "include",
    headers:
      body !== undefined && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : undefined,
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      data.message || "Could not connect. Please try again.",
      response.status,
    );
  return data as T;
}
export const money = (minor: number) =>
  new Intl.NumberFormat("en-ET", { maximumFractionDigits: 2 }).format(
    minor / 100,
  ) + " Br";
export function phoneNumber(raw: string) {
  const value = raw.replace(/[\s()-]/g, "");
  const phone = value.startsWith("0")
    ? "+251" + value.slice(1)
    : value.startsWith("251")
      ? "+" + value
      : value;
  if (!/^\+251[79]\d{8}$/.test(phone))
    throw new Error(
      "Enter a valid Ethiopian mobile number, such as 0912345678.",
    );
  return phone;
}
