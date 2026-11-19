/**
 * 表格行显隐：把「是否禁用」的判断留给调用方，这里只做纯计算，
 * 便于在 DataTable 之外单测。
 */
export function splitRowsByDisabled<T>(
  rows: T[],
  isDisabledRow: ((row: T) => boolean) | undefined,
  hideDisabled: boolean,
): { visible: T[]; hiddenCount: number } {
  if (!isDisabledRow) return { visible: rows, hiddenCount: 0 };
  const hidden = rows.filter((r) => isDisabledRow(r));
  if (!hideDisabled || hidden.length === 0) return { visible: rows, hiddenCount: hidden.length };
  return { visible: rows.filter((r) => !isDisabledRow(r)), hiddenCount: hidden.length };
}
