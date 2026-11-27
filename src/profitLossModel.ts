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

// Older audit snapshots only carry one of the original category codes.
const originalCategoryNames: Record<string, string> = {
  rent: "Аренда",
  payroll: "Оплата труда",
  utilities: "Коммунальные услуги",
  repairs: "Ремонт",
  marketing: "Маркетинг",
  services: "Услуги",
  other: "Прочее",
};
export type ExpenseCategory = { code: string; name: string };
type Categorized = { category: string; category_name?: string | null };

export function expenseCategoryName(row: Categorized) {
  return (
    row.category_name || originalCategoryNames[row.category] || row.category
  );
}

export function expenseCategoryChoices(
  active: ExpenseCategory[],
  saved?: Categorized,
) {
  const options = active.map(({ code, name }) => ({
    value: code,
    label: saved?.category === code ? expenseCategoryName(saved) : name,
  }));
  if (saved && !options.some(({ value }) => value === saved.category))
    options.push({ value: saved.category, label: expenseCategoryName(saved) });
  return options;
}
export const paymentMethods = { cash: "Наличные", bank: "Безналичные" };
export type ExpenseApprover = {
  department_id: string;
  id: string;
  name: string;
  available_to_all: boolean;
};
export type Expense = {
  id: string;
  department_id: string;
  department: string;
  author: string;
  approver_id?: string | null;
  approver_name?: string | null;
  category: string;
  category_name?: string | null;
  payment_method: keyof typeof paymentMethods;
  amount: string;
  expense_date: string;
  paid_date: string | null;
  comment: string | null;
  revision: number;
  cancelled: boolean;
  can_edit: boolean;
  can_allocate?: boolean;
  allocation_id?: string | null;
  can_view_allocation?: boolean;
  converted_allocation_id?: string | null;
  status?: "active" | "cancelled" | "converted";
};
export type AllocationMethod =
  | "pending"
  | "equal"
  | "percent"
  | "amount"
  | "weights"
  | "revenue";
export type AllocationPart = {
  department_id: string;
  weight?: string;
  amount?: string;
  approver_id?: string | null;
};
export type AllocationInput = {
  amount: string;
  expense_date: string;
  method: AllocationMethod;
  parts: AllocationPart[];
};
export type AllocationPreview = {
  method: Exclude<AllocationMethod, "pending">;
  parts: { department_id: string; weight: string | null; amount: string }[];
};
export type AllocationGroup = {
  id: string;
  revision: number;
  cancelled: boolean;
  can_edit: boolean;
  amount: string;
  expense_date: string;
  paid_date: string | null;
  category: string;
  category_name?: string | null;
  payment_method: keyof typeof paymentMethods;
  comment: string | null;
  method: AllocationMethod;
  parts: {
    department_id: string;
    department?: string;
    approver_id?: string | null;
    approver_name?: string | null;
    weight?: string | null;
    amount?: string | null;
  }[];
};
export type ProfitReport = {
  revenue: string | null;
  cost: string | null;
  gross_profit: string | null;
  expenses: string | null;
  direct_expenses?: string | null;
  allocated_expenses?: string | null;
  pending_expenses?: string | null;
  operating_profit_before_allocation?: string | null;
  cash: string | null;
  bank: string | null;
  operating_profit: string | null;
  by_category: (Categorized & { amount: string })[];
  complete: boolean;
  provisional: boolean;
};

export function canManageAllocation(
  access: FinanceAccess,
  row: Pick<Expense, "can_edit" | "cancelled">,
) {
  return access !== "manager" && row.can_edit && !row.cancelled;
}

type ManualMethod = "percent" | "amount";

export function manualPartValue(method: ManualMethod, text: string) {
  if (method === "amount") return amountForApi(text);
  const value = text.trim().replace(",", ".");
  if (!/^\d{1,3}(?:\.\d{1,12})?$/.test(value)) return null;
  const [integer, fractional = ""] = value.split(".");
  const fraction = fractional.replace(/0+$/, "");
  if (
    Number(integer) > 100 ||
    (Number(integer) === 100 && fraction) ||
    (!Number(integer) && !fraction)
  )
    return null;
  return Number(integer).toString() + (fraction ? "." + fraction : "");
}

function decimalUnits(value: string, scale: number) {
  const [integer, fraction = ""] = value.split(".");
  return BigInt(integer + fraction.padEnd(scale, "0"));
}

function displayUnits(units: bigint, method: ManualMethod) {
  const scale = method === "percent" ? 12 : 2;
  const digits = units.toString().padStart(scale + 1, "0");
  const integer = BigInt(digits.slice(0, -scale)).toLocaleString("ru-RU");
  const fraction = digits.slice(-scale);
  if (method === "amount") return integer + "," + fraction + " ₽";
  const significant = fraction.replace(/0+$/, "");
  return integer + (significant ? "," + significant : "") + " %";
}

export function allocationBalance(
  method: ManualMethod,
  parts: AllocationPart[],
  expenseAmount: string,
) {
  const expected = method === "percent" ? "100" : amountForApi(expenseAmount);
  if (!expected) return null;
  const scale = method === "percent" ? 12 : 2;
  let total = BigInt(0);
  let allEntered = true;
  let invalid = false;
  for (const part of parts) {
    const text = (method === "percent" ? part.weight : part.amount) ?? "";
    const value = manualPartValue(method, text);
    if (value) total += decimalUnits(value, scale);
    else {
      allEntered = false;
      if (text.trim()) invalid = true;
    }
  }
  const remaining = decimalUnits(expected, scale) - total;
  return {
    complete: allEntered && remaining === BigInt(0),
    total: displayUnits(total, method),
    invalid,
    balanced: remaining === BigInt(0),
    excess: remaining < BigInt(0),
    remainder: displayUnits(
      remaining < BigInt(0) ? -remaining : remaining,
      method,
    ),
  };
}

export function allocationInput(
  amountText: string,
  expenseDate: string,
  method: AllocationMethod,
  parts: AllocationPart[],
): AllocationInput | null {
  const amount = amountForApi(amountText);
  if (!amount || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate) || parts.length < 2)
    return null;
  const ids = parts.map((part) => part.department_id);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) return null;
  if (
    (method === "percent" || method === "amount") &&
    !allocationBalance(method, parts, amount)?.complete
  )
    return null;
  if (
    method === "weights" &&
    parts.some(
      (part) =>
        !part.weight ||
        !/^\d+(?:[.,]\d+)?$/.test(part.weight.trim()) ||
        Number(part.weight.replace(",", ".")) <= 0,
    )
  )
    return null;
  return {
    amount,
    expense_date: expenseDate,
    method,
    parts: parts.map((part) => ({
      department_id: part.department_id,
      ...(method === "percent"
        ? { weight: manualPartValue("percent", part.weight!)! }
        : method === "amount"
          ? { amount: amountForApi(part.amount!)! }
          : method === "weights"
            ? { weight: part.weight!.trim().replace(",", ".") }
            : {}),
    })),
  };
}

export function previewMatches(
  input: AllocationInput,
  preview: AllocationPreview,
) {
  if (input.method === "pending") return false;
  if (
    preview.method !== input.method ||
    preview.parts.length !== input.parts.length
  )
    return false;
  const expected = new Map(
    input.parts.map((part) => [part.department_id, part]),
  );
  const seen = new Set<string>();
  let cents = 0;
  for (const part of preview.parts) {
    const selected = expected.get(part.department_id);
    if (
      !selected ||
      seen.has(part.department_id) ||
      !/^\d+\.\d{2}$/.test(part.amount) ||
      (input.method !== "revenue" && Number(part.amount) === 0)
    )
      return false;
    if (
      (input.method === "weights" || input.method === "percent") &&
      Number(part.weight) !== Number(selected.weight)
    )
      return false;
    if (input.method === "amount" && part.amount !== selected.amount)
      return false;
    seen.add(part.department_id);
    cents += Number(part.amount.replace(".", ""));
  }
  return cents === Number(input.amount.replace(".", ""));
}

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
