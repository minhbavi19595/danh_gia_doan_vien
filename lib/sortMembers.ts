export function getTitlePriority(title: string | null | undefined): number {
  const t = String(title || '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

  if (!t) return 6;

  const isChiDoan =
    t.includes('chi đoàn') ||
    t.includes('chi doan') ||
    /\bcđ\b/.test(t) ||
    t.includes('btcđ') ||
    t.includes('pbtcđ') ||
    t.includes('uvcđ');

  const isPho = t.includes('phó') || t.includes('pho') || /\bpbt\b/.test(t) || t.includes('pbtcđ');
  const isBiThu = t.includes('bí thư') || t.includes('bi thu') || /\bbt\b/.test(t) || t.includes('btcđ') || /\bpbt\b/.test(t);
  const isUyVien =
    t.includes('ủy viên') ||
    t.includes('uỷ viên') ||
    t.includes('uy vien') ||
    /\buv\b/.test(t) ||
    t.includes('uvcđ');

  // 1. Bí thư (Bí thư Đoàn Thanh Niên / Bí thư)
  if (isBiThu && !isPho && !isChiDoan) return 0;

  // 2. Phó bí thư đoàn thanh niên
  if (isPho && isBiThu && !isChiDoan) return 1;

  // 3. Ủy viên BCH Đoàn thanh niên trung tâm
  if (isUyVien && !isChiDoan) return 2;

  // 4. Bí thư chi đoàn
  if (isBiThu && !isPho && isChiDoan) return 3;

  // 5. Phó bí thư chi đoàn
  if (isPho && isBiThu && isChiDoan) return 4;

  // 6. Ủy viên BCH chi đoàn
  if (isUyVien && isChiDoan) return 5;

  // 7. Đoàn viên và các chức danh khác
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
