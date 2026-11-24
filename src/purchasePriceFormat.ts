const prices = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const changes = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

export function price(value: string | number | null) {
  if (value === null) return "—";
  const n = Number(value);
  if (n > 0 && n < 0.01) return "< 0,01";
  return prices.format(n);
}

export function signed(value: string | null) {
  if (value === null) return "—";
  const n = Number(value);
  if (n !== 0 && Math.abs(n) < 0.01)
    return n > 0 ? "рост < 0,01" : "снижение < 0,01";
  return changes.format(n);
}

export function csvPrice(value: string | null) {
  return value?.replace(".", ",") ?? null;
}
