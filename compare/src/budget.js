// Decimal units are powers of 1000 and binary units powers of 1024, as in IEC
// 80000-13: "50KB" and "50KiB" are different budgets, 50,000 and 51,200 bytes.
const UNITS = {
  b: { factor: 1, label: "B" },
  kb: { factor: 1000, label: "KB" },
  mb: { factor: 1000 ** 2, label: "MB" },
  kib: { factor: 1024, label: "KiB" },
  mib: { factor: 1024 ** 2, label: "MiB" },
};

/**
 * Parse a --target-bytes value such as "50KB", "48 KiB", "1.5MB" or "48000" (a
 * bare number is bytes). A fractional byte count is rounded down, so a file that
 * meets the parsed budget also meets the one asked for.
 * @returns {{ bytes: number, label: string }}
 */
export function parseByteSize(value) {
  const match = /^\s*(\d+(?:\.\d+)?)\s*([a-z]*)\s*$/i.exec(value);
  const unit = match ? UNITS[(match[2] || "b").toLowerCase()] : undefined;
  const bytes = unit ? Math.floor(Number(match[1]) * unit.factor) : NaN;
  if (!(bytes >= 1)) {
    throw new Error(`--target-bytes must be a size such as 50KB, 48KiB or 48000 (bytes), at least one byte; got "${value}".`);
  }
  return { bytes, label: `${match[1]} ${unit.label}` };
}
