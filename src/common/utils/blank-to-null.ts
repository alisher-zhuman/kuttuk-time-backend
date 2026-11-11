// An optional free-text field from a form: trimmed; blank or null clears it (null); undefined
// (not sent) stays undefined, so a PATCH leaves the column alone.
export const blankToNull = (value: string | null | undefined): string | null | undefined =>
  value === undefined ? undefined : value?.trim() ? value.trim() : null;
