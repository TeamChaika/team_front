export type Venue = { id: string; name: string; archived?: boolean };
export type VenueArchive = {
  revision: number;
  archived_department_ids: string[];
  departments: Venue[];
  updated_at: string | null;
};

export function venueScope<T extends Venue>(
  venues: T[],
  selected: string[],
  includeArchived: boolean,
) {
  const visible = venues.filter((venue) => includeArchived || !venue.archived);
  const allowed = new Set(visible.map((venue) => venue.id));
  return {
    venues: visible,
    selected: selected.filter((id) => allowed.has(id)),
    empty: visible.length === 0,
  };
}

export function venueArchivePayload(value: VenueArchive) {
  return {
    revision: value.revision,
    archived_department_ids: [...new Set(value.archived_department_ids)].sort(),
  };
}

export function drilldownDepartments(venues: Venue[], selected: string[]) {
  return selected.length ? [...selected] : venues.map((venue) => venue.id);
}
