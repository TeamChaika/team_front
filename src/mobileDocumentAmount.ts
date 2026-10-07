// Expand JavaScript's shortest number representation without rounding the value.
export function formatMobileDocumentAmount(value: number | string): string {
  const raw = String(value);
  const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i.exec(raw);
  if (
    !match ||
    !Number.isFinite(Number(raw)) ||
    Math.abs(Number(match[4])) > 324
  )
    return raw.replace(".", ",");
  const [, sign, whole, fraction = "", exponent] = match;
  const digits = whole + fraction;
  const point = whole.length + Number(exponent);
  const plain =
    point <= 0
      ? `0.${"0".repeat(-point)}${digits}`
      : point >= digits.length
        ? digits + "0".repeat(point - digits.length)
        : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return (sign + plain).replace(".", ",");
}

export function parseMobileDocumentAmount(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  const amount = Number(normalized);
  return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized) &&
    Number.isFinite(amount) &&
    amount > 0 &&
    amount <= 1e9
    ? amount
    : null;
}
