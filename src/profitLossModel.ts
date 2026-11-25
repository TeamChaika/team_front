export type FinanceAccess = "manager" | "accountant" | "owner";
export type Period = { start: string; end: string };

export function hasProfitLossAccess(
  value: unknown,
  tenant: boolean,
): value is FinanceAccess {
  return (
    !tenant &&
    (value === "manager" || value === "accountant" || value === "owner")
  );
}

export const categories = {
  rent: "Аренда",
  payroll: "Оплата труда",
  utilities: "Коммунальные услуги",
  repairs: "Ремонт",
  marketing: "Маркетинг",
  services: "Услуги",
  other: "Прочее",
};
export const paymentMethods = { cash: "Наличные", bank: "Безналичные" };
export type Expense = {
  id: string;
  department_id: string;
  department: string;
  author: string;
  category: keyof typeof categories;
  payment_method: keyof typeof paymentMethods;
  amount: string;
  expense_date: string;
  paid_date: string | null;
  comment: string | null;
  revision: number;
  cancelled: boolean;
  can_edit: boolean;
};
export type ProfitReport = {
  revenue: string | null;
  cost: string | null;
  gross_profit: string | null;
  expenses: string | null;
  cash: string | null;
  bank: string | null;
  operating_profit: string | null;
  by_category: { category: keyof typeof categories; amount: string }[];
  complete: boolean;
  provisional: boolean;
};

export function canChangeExpense(
  access: FinanceAccess,
  row: Pick<Expense, "can_edit" | "cancelled" | "paid_date">,
) {
  return (
    row.can_edit && !row.cancelled && (access !== "manager" || !row.paid_date)
  );
}

export function financeDepartments<T extends { type?: string }>(venues: T[]) {
  return venues.filter((venue) => venue.type === "DEPARTMENT");
}

const moscowDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Moscow",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function moscowToday(now = new Date()) {
  return moscowDate.format(now);
}

export function periodForMonth(month: string, today: string): Period {
  const [year, number] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
  return {
    start: month + "-01",
    end: today.startsWith(month + "-") ? today : last,
  };
}

export function expenseQuery(range: Period, departments: string[]) {
  if (
    !range.start ||
    !range.end ||
    range.start > range.end ||
    !departments.length
  )
    return null;
  const duration = Date.parse(range.end) - Date.parse(range.start);
  if (!Number.isFinite(duration) || duration > 365 * 86_400_000) return null;
  const params = new URLSearchParams({ start: range.start, end: range.end });
  for (const id of departments) params.append("department_id", id);
  return params.toString();
}

export function amountForApi(text: string) {
  const value = text
    .trim()
    .replace(/[\u0020\u00a0\u202f]/g, "")
    .replace(",", ".");
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(value) || Number(value) <= 0) return null;
  const [rubles, kopecks = ""] = value.split(".");
  return Number(rubles).toString() + "." + kopecks.padEnd(2, "0");
}
