export type ScopeMode = "all" | "selected";
export type DepartmentScope = { mode: ScopeMode; department_ids: string[] };
export type StoreScope = { mode: ScopeMode; store_ids: string[] };
export type OperationSettings = {
  revision: number;
  sync: DepartmentScope;
  writeoff: StoreScope;
  waybill: StoreScope;
  departments: { id: string; name: string }[];
  stores: {
    id: string;
    name: string;
    parent_id: string | null;
    department_id?: string;
    department_name?: string;
  }[];
  updated_at: string | null;
  updated_by: string | null;
};
export function scopeIncludes(mode: ScopeMode, ids: string[], id: string) {
  return mode === "all" || ids.includes(id);
}
// Leaving “all” snapshots the current catalogue; future entries stay excluded.
export function toggleScope(
  mode: ScopeMode,
  ids: string[],
  catalogue: string[],
  id: string,
  checked: boolean,
) {
  const next = new Set(mode === "all" ? catalogue : ids);
  if (checked) next.add(id);
  else next.delete(id);
  return { mode: "selected" as const, ids: [...next] };
}
export function scopeModeIds(
  previousMode: ScopeMode,
  ids: string[],
  catalogue: string[],
  nextMode: ScopeMode,
) {
  if (nextMode === "all") return [];
  return previousMode === "all" ? [...catalogue] : [...ids];
}
export function operationSettingsPayload(value: OperationSettings) {
  return {
    revision: value.revision,
    sync: {
      mode: value.sync.mode,
      department_ids:
        value.sync.mode === "all" ? [] : value.sync.department_ids,
    },
    writeoff: {
      mode: value.writeoff.mode,
      store_ids: value.writeoff.mode === "all" ? [] : value.writeoff.store_ids,
    },
    waybill: {
      mode: value.waybill.mode,
      store_ids: value.waybill.mode === "all" ? [] : value.waybill.store_ids,
    },
  };
}
