import { defineStore } from 'pinia'
import { read, write } from '@/utils/storage'
import { useShoppingListStore } from './shoppingList'
import { useInventoryStore } from './inventory'
import { useDietRecordStore } from './dietRecord'
import { useMealPlanStore } from './mealPlan'
import { useChallengeStore } from './challenge'
import { useAchievementsStore } from './achievements'
import { nutritionScore } from '@/utils/nutrition'
import { ACHIEVEMENTS } from '@/utils/achievements'
import { WEEK_DAYS, MEALS } from '@/constants'
import {
  weekStartFromKey,
  weekDateKeysByKey,
  dateKeyFromISO,
  toWeekKey,
  currentWeekKey,
  parseDateKey,
} from '@/utils/date'

const KEY = 'weekly-reports'

const achievementMap = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]))

function mealSlotKey(meal) {
  return { 早餐: 'breakfast', 午餐: 'lunch', 晚餐: 'dinner' }[meal] || meal
}

// 统计指定周计划中已安排菜品的餐次数
function countPlannedMeals(plan, weekKey) {
  const week = plan[weekKey]
  if (!week) return 0
  let count = 0
  WEEK_DAYS.forEach((d) => {
    MEALS.forEach((m) => {
      if (week[d.key]?.[mealSlotKey(m)]?.length > 0) count++
    })
  })
  return count
}

export const useWeeklyReportStore = defineStore('weeklyReport', {
  state: () => ({
    // { [weekKey]: reportSnapshot }
    reports: read(KEY, {}),
    // 仅用于当前会话展示、尚未达到归档条件的周报（不落盘）
    drafts: {},
  }),

  getters: {
    currentKey() {
      return currentWeekKey()
    },

    // 汇总各业务记录中出现过的周，加上当前周与已保存的周，按期倒序
    availableWeekKeys() {
      const shopping = useShoppingListStore()
      const inventory = useInventoryStore()
      const diet = useDietRecordStore()
      const challenge = useChallengeStore()
      const achievements = useAchievementsStore()

      const keys = new Set(Object.keys(this.reports))
      keys.add(currentWeekKey())
      shopping.history.forEach((h) => keys.add(toWeekKey(new Date(h.date))))
      inventory.wasteRecords.forEach((w) => w.dateKey && keys.add(toWeekKey(parseDateKey(w.dateKey))))
      diet.records.forEach((r) => keys.add(toWeekKey(parseDateKey(r.date))))
      challenge.completed.forEach((c) => keys.add(toWeekKey(new Date(c.date))))
      achievements.unlockEvents.forEach((e) => e.weekKey && keys.add(e.weekKey))

      return [...keys].sort((a, b) => (a < b ? 1 : -1))
    },
  },

  actions: {
    persist() {
      write(KEY, this.reports)
    },

    // 按周汇总各模块数据，生成可回看的快照
    buildReport(weekKey) {
      const shopping = useShoppingListStore()
      const inventory = useInventoryStore()
      const diet = useDietRecordStore()
      const mealPlan = useMealPlanStore()
      const challenge = useChallengeStore()
      const achievements = useAchievementsStore()

      const startKey = weekStartFromKey(weekKey)
      const dates = weekDateKeysByKey(weekKey)
      const endKey = dates[6]

      // 采购：本周完成的采购批次
      const purchases = shopping.history.filter((h) => {
        const key = dateKeyFromISO(h.date)
        return key >= startKey && key <= endKey
      })
      const spendPerDay = dates.map((date) => ({
        date,
        total: purchases
          .filter((h) => dateKeyFromISO(h.date) === date)
          .reduce((s, h) => s + Number(h.total || 0), 0),
      }))
      const itemSpendMap = {}
      purchases.forEach((h) => {
        ;(h.items || []).forEach((it) => {
          const k = it.name
          if (!itemSpendMap[k]) itemSpendMap[k] = { name: it.name, unit: it.unit, quantity: 0, amount: 0 }
          itemSpendMap[k].quantity += Number(it.quantity || 0)
          itemSpendMap[k].amount += Number(it.price || 0)
        })
      })
      const spendTotal = purchases.reduce((s, h) => s + Number(h.total || 0), 0)

      // 浪费：本周登记的浪费记录
      const wasteItems = inventory.wasteRecords.filter((w) => w.dateKey >= startKey && w.dateKey <= endKey)
      const wasteByCategory = {}
      wasteItems.forEach((w) => {
        wasteByCategory[w.category] = (wasteByCategory[w.category] || 0) + 1
      })
      const purchasedItemCount = purchases.reduce((s, h) => s + (h.items?.length || 0), 0)

      // 营养：按天汇总菜品后评分
      const daily = dates.map((date) => {
        const dayRecords = diet.records.filter((r) => r.date === date)
        const dishes = dayRecords.flatMap((r) => r.dishes)
        return {
          date,
          meals: dayRecords.length,
          score: dishes.length ? nutritionScore(dishes) : null,
        }
      })
      const scoredDays = daily.filter((d) => d.score !== null)
      const avgScore = scoredDays.length
        ? Math.round(scoredDays.reduce((s, d) => s + d.score, 0) / scoredDays.length)
        : 0
      const bestDay = scoredDays.length
        ? scoredDays.reduce((best, d) => (d.score > best.score ? d : best), scoredDays[0])
        : null

      // 计划完成情况
      const plannedMeals = countPlannedMeals(mealPlan.plan, weekKey)
      const recordedMeals = diet.records.filter((r) => r.date >= startKey && r.date <= endKey).length
      const completionRate = plannedMeals ? Math.min(100, Math.round((recordedMeals / plannedMeals) * 100)) : 0

      // 本周完成的挑战
      const challenges = challenge.completed
        .filter((c) => toWeekKey(new Date(c.date)) === weekKey)
        .map((c) => ({
          id: c.id,
          ingredientName: c.ingredientName,
          dishName: c.dishName,
          points: c.points,
          date: c.date,
          dateKey: dateKeyFromISO(c.date),
        }))

      // 本周新解锁成就
      const unlocked = achievements.unlockEvents
        .filter((e) => e.weekKey === weekKey)
        .map((e) => ({ eventId: e.id, date: e.date, dateKey: e.dateKey, ...achievementMap[e.achievementId] }))
        .filter((a) => a.id)

      const prev = this.reports[weekKey]
      const hasData =
        spendTotal > 0 ||
        wasteItems.length > 0 ||
        recordedMeals > 0 ||
        plannedMeals > 0 ||
        challenges.length > 0 ||
        unlocked.length > 0

      return {
        weekKey,
        startKey,
        endKey,
        generatedAt: new Date().toISOString(),
        hasData,
        note: prev?.note || '',
        spend: {
          total: spendTotal,
          rounds: purchases.length,
          perDay: spendPerDay,
          topItems: Object.values(itemSpendMap).sort((a, b) => b.amount - a.amount),
          purchases: purchases.map((h) => ({
            id: h.id,
            date: h.date,
            dateKey: dateKeyFromISO(h.date),
            total: Number(h.total || 0),
            items: h.items || [],
          })),
        },
        waste: {
          count: wasteItems.length,
          items: wasteItems.map((w) => ({ ...w })),
          byCategory: wasteByCategory,
          rate: purchasedItemCount ? wasteItems.length / purchasedItemCount : 0,
        },
        nutrition: {
          daily,
          avgScore,
          recordedMeals,
          bestDay,
        },
        plan: {
          plannedMeals,
          recordedMeals,
          completionRate,
        },
        challenges,
        achievements: unlocked,
      }
    },

    // 生成并按期保存：当前周/已有数据的周落盘；空白的历史周仅在会话内展示
    saveWeek(weekKey) {
      const report = this.buildReport(weekKey)
      const shouldArchive =
        weekKey === currentWeekKey() || Boolean(this.reports[weekKey]) || report.hasData

      if (shouldArchive) {
        this.reports[weekKey] = report
        delete this.drafts[weekKey]
        this.persist()
      } else {
        this.drafts[weekKey] = report
      }
      return report
    },

    getReport(weekKey) {
      return this.reports[weekKey] || this.drafts[weekKey] || null
    },

    setNote(weekKey, note) {
      if (!this.reports[weekKey]) return
      this.reports[weekKey].note = note
      this.persist()
    },

    // 重新生成所有已保存的周报（数据结构升级时使用）
    refreshAll() {
      Object.keys(this.reports).forEach((weekKey) => {
        this.reports[weekKey] = this.buildReport(weekKey)
      })
      this.persist()
    },
  },
})
