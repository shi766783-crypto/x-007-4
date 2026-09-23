// 日期工具：本地日期解析、格式化、保质期计算、星期定位

const MS_PER_DAY = 24 * 60 * 60 * 1000

// 将 Date 转为本地 YYYY-MM-DD（避免 toISOString 时区偏移）
export function toDateKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// 解析 YYYY-MM-DD 为本地 Date（当天 0 点）
export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// 两个日期相差天数（end - start，按自然日）
export function diffDays(startKey, endKey = toDateKey()) {
  return Math.round((parseDateKey(endKey) - parseDateKey(startKey)) / MS_PER_DAY)
}

// 计算剩余保质期天数（负数表示已过期天数）
export function remainingDays(purchaseDate, shelfLifeDays, today = new Date()) {
  const start = parseDateKey(purchaseDate)
  return shelfLifeDays - Math.floor((today.getTime() - start.getTime()) / MS_PER_DAY)
}

// 计算过期日期 key
export function expiryDateKey(purchaseDate, shelfLifeDays) {
  const d = parseDateKey(purchaseDate)
  d.setDate(d.getDate() + shelfLifeDays)
  return toDateKey(d)
}

// 格式化日期为中文
export function formatDate(key) {
  const d = parseDateKey(key)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

// 获取本周周一对应的日期 key
export function currentWeekStart(today = new Date()) {
  const day = today.getDay() // 0=周日
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(today)
  monday.setDate(today.getDate() + diff)
  return toDateKey(monday)
}

// 生成本周 weekKey（如 2026-W37）
export function currentWeekKey(today = new Date()) {
  const monday = parseDateKey(currentWeekStart(today))
  return toWeekKey(monday)
}

// 由周一日期生成 ISO weekKey（如 2026-W37）
export function toWeekKey(mondayDate) {
  const date = new Date(mondayDate)
  date.setHours(12, 0, 0, 0) // 避开夏令时/时区边界
  const dayNum = date.getDay() || 7 // 周一=1 … 周日=7
  date.setDate(date.getDate() + 4 - dayNum) // 调整到该 ISO 周的周四
  const yearStart = new Date(date.getFullYear(), 0, 1)
  const week = Math.ceil(((date - yearStart) / MS_PER_DAY + 1) / 7)
  return `${date.getFullYear()}-W${String(week).padStart(2, '0')}`
}

// 由 ISO weekKey 反推周一日期 key
export function weekStartFromKey(weekKey) {
  const [year, w] = weekKey.split('-W')
  // 1 月 4 日恒处于第 1 个 ISO 周
  const jan4 = new Date(Number(year), 0, 4)
  const day = jan4.getDay() || 7
  const week1Monday = new Date(jan4)
  week1Monday.setDate(jan4.getDate() - (day - 1))
  const monday = new Date(week1Monday)
  monday.setDate(week1Monday.getDate() + (Number(w) - 1) * 7)
  return toDateKey(monday)
}

// 本周 7 天的日期 key 数组（周一起）
export function weekDateKeys(today = new Date()) {
  return weekDateKeysFrom(currentWeekStart(today))
}

// 由周一日期 key 生成该周 7 天的日期 key 数组（周一起）
export function weekDateKeysFrom(mondayKey) {
  const start = parseDateKey(mondayKey)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return toDateKey(d)
  })
}

// 生成一段日期范围内覆盖到的周 key（升序，含起止日期所在周）
export function weekKeysBetween(startKey, endKey) {
  const keys = []
  let cursor = parseDateKey(currentWeekStart(parseDateKey(startKey)))
  const end = parseDateKey(endKey)
  // 防御异常范围，最多回溯 520 周
  let guard = 0
  while (cursor <= end && guard < 520) {
    keys.push(toWeekKey(cursor))
    cursor.setDate(cursor.getDate() + 7)
    guard++
  }
  return keys
}

// 周 key 加减 n 周（n 可为负）
export function shiftWeekKey(weekKey, n) {
  const monday = parseDateKey(weekStartFromKey(weekKey))
  monday.setDate(monday.getDate() + n * 7)
  return toWeekKey(monday)
}

// 周区间的起止日期 key（周一、周日）
export function weekRange(weekKey) {
  const days = weekDateKeysFrom(weekStartFromKey(weekKey))
  return { start: days[0], end: days[6] }
}

// 周区间的中文标签，如「2月3日 - 2月9日」
export function weekRangeLabel(weekKey) {
  const { start, end } = weekRange(weekKey)
  const s = parseDateKey(start)
  const e = parseDateKey(end)
  return `${s.getMonth() + 1}月${s.getDate()}日 - ${e.getMonth() + 1}月${e.getDate()}日`
}

// 判断日期 key 是否落在某一周内
export function isDateInWeek(dateKey, weekKey) {
  const { start, end } = weekRange(weekKey)
  return dateKey >= start && dateKey <= end
}

// 判断是否为连续日期（用于坚持之星）
export function isConsecutive(dateKey, prevDateKey) {
  return diffDays(prevDateKey, dateKey) === 1
}
