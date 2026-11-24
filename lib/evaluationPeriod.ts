/**
 * Logic mở kỳ đánh giá:
 * Từ ngày 24 của tháng hiện tại trở đi sẽ tự động mở kỳ đánh giá cho tháng tiếp theo.
 * Ví dụ: 24/11 -> mở nhập đến Tháng 12; 24/12 -> mở nhập đến Tháng 1 năm sau.
 */
export function getMaxEvaluationPeriod(now: Date = new Date()): {
  maxYear: number;
  maxMonth: number;
} {
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1..12
  const day = now.getDate();

  if (day >= 24) {
    if (month === 12) {
      return { maxYear: year + 1, maxMonth: 1 };
    }
    return { maxYear: year, maxMonth: month + 1 };
  }

  return { maxYear: year, maxMonth: month };
}

export function getAvailableYears(startYear = 2024, now: Date = new Date()): number[] {
  const { maxYear } = getMaxEvaluationPeriod(now);
  const count = Math.max(1, maxYear - startYear + 1);
  return Array.from({ length: count }, (_, i) => maxYear - i);
}

export function getAvailableMonths(selectedYear: number, now: Date = new Date()): number[] {
  const { maxYear, maxMonth } = getMaxEvaluationPeriod(now);
  if (selectedYear > maxYear) return [];
  const limit = selectedYear === maxYear ? maxMonth : 12;
  return Array.from({ length: limit }, (_, i) => i + 1);
}

