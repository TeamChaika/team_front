import { parseReportDate } from "./reportDate.ts";

type InvoiceLine = {
  document_id: string;
  document_number: string | null;
  amount: string | null;
  sum: string | null;
};

export type PurchaseInvoiceRow<L extends InvoiceLine> = {
  date: string;
  document_id: string;
  document_number: string | null;
  lines: L[];
  amount: string | null;
  sum: string | null;
  price: string | null;
};

type Decimal = { units: bigint; scale: number };

// Invoice amounts are PostgreSQL NUMERIC values serialized as decimal strings.
function decimal(value: string | null): Decimal | null {
  const match = value?.match(/^([+-]?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
  if (!match) return null;
  const [, sign, whole, fraction = "", exponent = "0"] = match;
  const scale = fraction.length - Number(exponent);
  // An unconstrained PostgreSQL NUMERIC supports up to 131072 integral digits.
  if (Math.abs(scale) > 131072) return null;
  const units = BigInt(sign + whole + fraction);
  if (units < 0n) return null;
  return scale < 0
    ? { units: units * 10n ** BigInt(-scale), scale: 0 }
    : { units, scale };
}

function decimalText({ units, scale }: Decimal) {
  if (!scale) return units.toString();
  const digits = units.toString().padStart(scale + 1, "0");
  return digits.slice(0, -scale) + "." + digits.slice(-scale);
}

function total(lines: InvoiceLine[], field: "amount" | "sum") {
  let scale = 0;
  let units = 0n;
  let hasZero = false;
  for (const line of lines) {
    const value = decimal(line[field]);
    if (!value) return null;
    if (value.scale > scale) {
      units *= 10n ** BigInt(value.scale - scale);
      scale = value.scale;
    }
    units += value.units * 10n ** BigInt(scale - value.scale);
    if (value.units === 0n) hasZero = true;
  }
  return { units, scale, hasZero };
}

function unitPrice(sum: Decimal, amount: Decimal) {
  const numerator = sum.units * 10n ** BigInt(amount.scale + 4);
  const denominator = amount.units * 10n ** BigInt(sum.scale);
  let units = numerator / denominator;
  // Match purchase_prices.observation: quantize to four places, ties to even.
  const twiceRemainder = (numerator % denominator) * 2n;
  if (
    twiceRemainder > denominator ||
    (twiceRemainder === denominator && units % 2n === 1n)
  )
    units++;
  return decimalText({ units, scale: 4 });
}

const documentNumbers = new Intl.Collator("ru", { numeric: true });

export function purchaseInvoiceRows<L extends InvoiceLine>(
  receipts: readonly { date: string; lines: readonly L[] }[],
): PurchaseInvoiceRow<L>[] {
  const documents = new Map<string, { date: string; lines: L[] }>();
  const timestamps = new Map<string, number>();
  for (const { date, lines } of receipts) {
    const time = parseReportDate(
      date.length === 10 ? date + "T00:00:00" : date,
    ).getTime();
    timestamps.set(date, Number.isFinite(time) ? time : -Infinity);
    for (const line of lines) {
      const existing = documents.get(line.document_id);
      if (existing) existing.lines.push(line);
      else documents.set(line.document_id, { date, lines: [line] });
    }
  }

  return Array.from(documents.values(), ({ date, lines }) => {
    const amount = total(lines, "amount");
    const sum = total(lines, "sum");
    return {
      date,
      document_id: lines[0].document_id,
      document_number: lines[0].document_number,
      lines,
      amount: amount && decimalText(amount),
      sum: sum && decimalText(sum),
      price: sum && amount && !amount.hasZero ? unitPrice(sum, amount) : null,
    };
  }).sort(
    (a, b) =>
      timestamps.get(b.date)! - timestamps.get(a.date)! ||
      Number(!a.document_number) - Number(!b.document_number) ||
      documentNumbers.compare(
        a.document_number ?? "",
        b.document_number ?? "",
      ) ||
      a.document_id.localeCompare(b.document_id),
  );
}
