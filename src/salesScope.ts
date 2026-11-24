import type { Meta } from "./api";

export function salesDefaultDepartments(
  meta: Pick<
    Meta,
    "departments" | "today" | "live_sales_enabled"
  >,
  start: string,
  end: string,
): string[] | null {
  if (
    !meta.live_sales_enabled ||
    !meta.today ||
    !start ||
    !end ||
    start > meta.today ||
    end < meta.today ||
    !meta.departments.length ||
    !meta.departments.every((venue) => typeof venue.sync_enabled === "boolean")
  )
    return null;

  const enabled = meta.departments.filter((venue) => venue.sync_enabled);
  return enabled.length === meta.departments.length
    ? null
    : enabled.map((venue) => venue.id);
}
