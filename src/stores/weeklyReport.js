import { defineStore } from 'pinia'
import { read, write } from '@/utils/storage'
import { useShoppingListStore } from './shoppingList'
import { useInventoryStore } from './inventory'
import { useDietRecordStore } from './dietRecord'
import { useChallengeStore } from './challenge'
import { useAchievementsStore } from './achievements'
import { nutritionScore } from '@/utils/nutrition'
import {
  currentWeekKey,
  shiftWeekKey,
  weekRange,
  weekDateKeysFrom,
  weekStartFromKey,
  weekKeysBetween,
} from '@/utils/date'

const SNAPSHOT_KEY = 'weekly-reports'

// 依据各业务数据实时计算某一周的汇总（用于当前周与历史回填）
function buildReport(weekKey) {
  const shopping = useShoppingListStore()
  const inventory = useInventoryStore()
  const diet = useDietRecordStore()
  const challenge = useChallengeStore()
  const achievements = useAchievementsStore()

  const { start, end } = weekRange(weekKey)
  const days = weekDateKeysFrom(weekStartFromKey(weekKey))

  // 1. 采购花费：采购历史按自然日落入本周
  const purchases = shopping.history.filter((h) => {
    const key = h.date.slice(0, 10)
    return key >= start && key <= end
  })
  const spend = purchases.reduce((s, h) => s + Number(h.total || 0), 0)
  const purchaseItems = purchases.flatMap((h) =>
    (h.items || []).map((it) => ({ ...it, date: h.date.slice(0, 10) })),
  )
  // 按食材名聚合花费/数量
  const spendByIngredient = {}
  purchaseItems.forEach((it) => {
    const k = it.name
    if (!spendByIngredient[k]) {
      spendByIngredient[k] = { name: it.name, unit: it.unit, quantity: 0, price: 0 }
    }
    spendByIngredient[k].quantity += Number(it.quantity || 0)
    spendByIngredient[k].price += Number(it.price || 0)
  })

  // 2. 食材浪费：浪费日志按丢弃日落入本周
  const wasteItems = inventory.wasteLog.filter((w) => w.date >= start && w.date <= end)
  const wasteQuantity = wasteItems.reduce((s, w) => s + Number(w.quantity || 0), 0)
  // 本周入库食材种次（按购买日落入本周的现存食材近似）+ 本周已丢弃
  const stockedThisWeek = inventory.items.filter(
    (i) => i.purchaseDate && i.purchaseDate >= start && i.purchaseDate <= end,
  ).length
  const wasteDenominator = stockedThisWeek + wasteItems.length
  const wasteRate = wasteDenominator ? wasteItems.length / wasteDenominator : 0

  // 3. 营养评分走势：本周 7 天逐日评分
  const dayScores = days.map((date) => {
    const dishes = diet.records.filter((r) => r.date === date).flatMap((r) => r.dishes)
    return {
      date,
      score: dishes.length ? nutritionScore(dishes) : null,
      recorded: dishes.length > 0,
    }
  })
  const scored = dayScores.filter((d) => d.score !== null)
  const avgScore = scored.length
    ? Math.round(scored.reduce((s, d) => s + d.score, 0) / scored.length)
    : 0
  const recordDays = scored.length

  // 4. 完成挑战：挑战完成日落入本周
  const challenges = challenge.completed.filter((c) => {
    const key = c.date.slice(0, 10)
    return key >= start && key <= end
  })
  const challengePoints = challenges.reduce((s, c) => s + Number(c.points || 0), 0)

  // 5. 新解锁成就：解锁日志日期落入本周
  const unlockedAchievements = achievements.unlockLog
    .filter((u) => u.date >= start && u.date <= end)
    .map((u) => ({ achievementId: u.achievementId, name: u.name, icon: u.icon, date: u.date }))

  return {
    weekKey,
    start,
    end,
    spend: Number(spend.toFixed(1)),
    purchaseCount: purchases.length,
    spendByIngredient: Object.values(spendByIngredient)
      .map((v) => ({ ...v, price: Number(v.price.toFixed(1)) }))
      .sort((a, b) => b.price - a.price),
    wasteCount: wasteItems.length,
    wasteQuantity,
    wasteRate: Number(wasteRate.toFixed(3)),
    wasteItems: wasteItems
      .map((w) => ({ name: w.name, category: w.category, quantity: w.quantity, unit: w.unit, date: w.date }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    avgScore,
    recordDays,
    dayScores,
    challengeCount: challenges.length,
    challengePoints,
    challenges: challenges
      .map((c) => ({
        ingredientName: c.ingredientName,
        dishName: c.dishName,
        points: c.points,
        date: c.date.slice(0, 10),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    unlockedAchievements: unlockedAchievements.sort((a, b) => a.date.localeCompare(b.date)),
  }
}

export const useWeeklyReportStore = defineStore('weeklyReport', {
  state: () => ({
    // 已冻结的历史周快照 { [weekKey]: report }
    snapshots: read(SNAPSHOT_KEY, {}),
  }),

  getters: {
    currentWeekKey: () => currentWeekKey(),

    // 有数据可看的全部周：冻结周 + 各数据源中出现过的最早日期所在周 ~ 当前周
    availableWeekKeys() {
      const shopping = useShoppingListStore()
      const inventory = useInventoryStore()
      const diet = useDietRecordStore()
      const challenge = useChallengeStore()
      const achievements = useAchievementsStore()

      const dates = []
      shopping.history.forEach((h) => dates.push(h.date.slice(0, 10)))
      inventory.wasteLog.forEach((w) => dates.push(w.date))
      diet.records.forEach((r) => dates.push(r.date))
      challenge.completed.forEach((c) => dates.push(c.date.slice(0, 10)))
      achievements.unlockLog.forEach((u) => dates.push(u.date))

      const keys = new Set(Object.keys(this.snapshots))
      const cur = currentWeekKey()
      keys.add(cur)
      if (dates.length) {
        weekKeysBetween(dates.sort()[0], cur).forEach((k) => keys.add(k))
      }
      return [...keys].sort() // ISO weekKey 字典序即时间序
    },

    latestWeekKey() {
      const keys = this.availableWeekKeys
      return keys[keys.length - 1] || currentWeekKey()
    },
  },

  actions: {
    persist() {
      write(SNAPSHOT_KEY, this.snapshots)
    },

    // 获取某一周的报告：当前周实时计算；已结束的周取快照，没有则现场回填并冻结
    getReport(weekKey) {
      const cur = currentWeekKey()
      if (weekKey >= cur) {
        // 当前周及未来周不冻结，始终实时汇总
        return { ...buildReport(weekKey), frozen: false, isCurrent: weekKey === cur }
      }
      if (!this.snapshots[weekKey]) {
        this.snapshots[weekKey] = { ...buildReport(weekKey), savedAt: new Date().toISOString() }
        this.persist()
      }
      return { ...this.snapshots[weekKey], frozen: true, isCurrent: false }
    },

    // 手动重新生成某历史周快照（源数据被修正时使用）
    refreshSnapshot(weekKey) {
      if (weekKey >= currentWeekKey()) return
      this.snapshots[weekKey] = { ...buildReport(weekKey), savedAt: new Date().toISOString() }
      this.persist()
    },

    prevWeekKey(weekKey) {
      return shiftWeekKey(weekKey, -1)
    },
    nextWeekKey(weekKey) {
      return shiftWeekKey(weekKey, 1)
    },
  },
})
