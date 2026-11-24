export function parseReportDate(text: string) {
  let raw = text.replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw) && !/(Z|[+-]\d{2}:?\d{2})$/.test(raw))
    raw += "+03:00";
  return new Date(raw);
}
