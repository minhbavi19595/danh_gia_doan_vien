export function getTitlePriority(title: string | null | undefined): number {
  const t = String(title || '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

  if (!t) return 6;

  // 1. Phó bí thư (kiểm tra trước Bí thư vì có chứa chuỗi "bí thư")
  if (t.includes('phó bí thư') || t.includes('pho bi thu') || t === 'pbt' || t.startsWith('pbt ')) {
    if (t.includes('đoàn thanh niên') || t.includes('đoàn tt') || t.includes('trung tâm')) {
      return 2;
    }
    return 3;
  }

  // 2. Bí thư
  if (t.includes('bí thư') || t.includes('bi thu') || t === 'bt' || t.startsWith('bt ')) {
    if (t.includes('đoàn thanh niên') || t.includes('đoàn tt') || t.includes('trung tâm')) {
      return 0;
    }
    return 1;
  }

  // 3. Ủy viên BCH / UV
  if (
    t.includes('ủy viên') ||
    t.includes('uỷ viên') ||
    t.includes('uy vien') ||
    t === 'uv' ||
    t.startsWith('uv ') ||
    t.includes('uv bch')
  ) {
    if (t.includes('đoàn thanh niên') || t.includes('đoàn tt') || t.includes('trung tâm')) {
      return 4;
    }
    return 5;
  }

  // 4. Đoàn viên và các chức danh khác
  return 6;
}

export function sortMembersByTitle<T extends { title?: string | null; created_at?: string | null }>(
  list: T[]
): T[] {
  return [...list].sort((a, b) => {
    const pa = getTitlePriority(a.title);
    const pb = getTitlePriority(b.title);
    if (pa !== pb) return pa - pb;

    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return ta - tb;
  });
}

