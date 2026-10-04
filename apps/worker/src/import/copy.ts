// Encodes rows in PostgreSQL COPY text format (tab-separated, \N for null).
import { arrayLiteral, type StagingRow, type StagingValue } from "./staging";

const escapeCopy = (s: string) =>
  s
    .replace(/\0/g, "") // Postgres text can't contain NUL
    .replace(/\\/g, "\\\\")
    .replace(/\t/g, "\\t")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");

function encodeValue(value: StagingValue): string {
  if (value === null) return "\\N";
  if (Array.isArray(value)) return escapeCopy(arrayLiteral(value));
  return escapeCopy(String(value));
}

export function encodeCopyRow(row: StagingRow): string {
  return `${row.map(encodeValue).join("\t")}\n`;
}
