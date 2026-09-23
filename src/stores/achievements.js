import { defineStore } from 'pinia'
import { read, write } from '@/utils/storage'
import { uid } from '@/utils/id'
import { ACHIEVEMENTS } from '@/utils/achievements'
import { useInventoryStore } from './inventory'
import { useMealPlanStore } from './mealPlan'
import { useDietRecordStore } from './dietRecord'
import { useShoppingListStore } from './shoppingList'
import { useChallengeStore } from './challenge'
import { useUserStore } from './user'
import { dateKeyFromISO, toDateKey, toWeekKey } from '@/utils/date'

const KEY = 'achievement-events'

function firstDateISO(values, fallback = new Date().toISOString()) {
  const valid = values.filter(Boolean).sort()
  return valid[0] || fallback
}

// 首次升级时，为历史上已经满足条件的成就补一个保守的解锁时间
function backfillUnlock(id) {
  const inventory = useInventoryStore()
  const mealPlan = useMealPlanStore()
  const diet = useDietRecordStore()
  const shopping = useShoppingListStore()
  const challenge = useChallengeStore()
  const now = new Date().toISOString()

  const firstInventory = inventory.items.map((i) => i.purchaseDate).filter(Boolean).sort()[0]
  const firstDish = firstDateISO(mealPlan.dishes.map((d) => d.publishedAt))
  const firstDiet = firstDateISO(diet.records.map((r) => `${r.date}T12:00:00.000Z`))
  const firstChallenge = firstDateISO(challenge.completed.map((c) => c.date))
  const firstPurchase = firstDateISO(shopping.history.map((h) => h.date))

  const candidates = {
    'first-stock': firstInventory ? `${firstInventory}T12:00:00.000Z` : now,
    'recipe-master': firstDish,
    'purchase-actuary': firstPurchase,
    'nutrition-balanced': firstDiet,
    'inventory-manager': firstInventory ? `${firstInventory}T12:00:00.000Z` : now,
    'fridge-cleaner': firstChallenge,
    'seven-day-planner': now,
    'clean-plate': firstDiet,
    'points-master': firstChallenge || firstPurchase || now,
    'shopping-pro': firstPurchase,
    'persistence-star': firstDiet,
  }

  const date = candidates[id] || now
  return {
    id: uid('ach'),
    achievementId: id,
    date,
    dateKey: date.length === 10 ? date : dateKeyFromISO(date),
    weekKey: date.length === 10 ? toWeekKey(new Date(`${date}T12:00:00`)) : toWeekKey(new Date(date)),
  }
}

export const useAchievementsStore = defineStore('achievements', {
  state: () => ({
    defs: ACHIEVEMENTS,
    unlockEvents: read(KEY, []),
  }),

  getters: {
    // 汇聚各 store 的统计快照
    snapshot() {
      const inventory = useInventoryStore()
      const mealPlan = useMealPlanStore()
      const diet = useDietRecordStore()
      const shopping = useShoppingListStore()
      const challenge = useChallengeStore()
      const user = useUserStore()

      return {
        inventoryCount: inventory.items.length,
        weekExpiredCount: inventory.expiredItems.length,
        weekTrackedCount: inventory.items.length,
        totalDishes: mealPlan.totalDishes,
        actuaryPurchases: shopping.purchaseRounds,
        avgNutritionScore: diet.avgNutritionThisWeek,
        challengeCount: challenge.challengeCount,
        plannedMeals: mealPlan.plannedMeals,
        recordedMeals: diet.recordedMeals,
        totalPoints: user.points,
        purchaseRounds: shopping.purchaseRounds,
        maxStreak: diet.maxStreak,
      }
    },

    unlockedIds(state) {
      return new Set(state.unlockEvents.map((e) => e.achievementId))
    },

    unlocked() {
      const ids = this.unlockedIds
      return this.defs.filter((a) => ids.has(a.id))
    },

    locked() {
      const ids = this.unlockedIds
      return this.defs.filter((a) => !ids.has(a.id))
    },

    progress() {
      const total = this.defs.length
      const unlocked = this.unlocked.length
      return { total, unlocked, percent: total ? Math.round((unlocked / total) * 100) : 0 }
    },
  },

  actions: {
    persist() {
      write(KEY, this.unlockEvents)
    },

    // 根据当前状态同步解锁记录；历史上已解锁的成就不会因条件波动再次锁定
    syncUnlocks() {
      const snapshot = this.snapshot
      let changed = false

      this.defs.forEach((achievement) => {
        if (this.unlockedIds.has(achievement.id)) return
        let isUnlocked = false
        try {
          isUnlocked = achievement.check(snapshot)
        } catch {
          isUnlocked = false
        }
        if (!isUnlocked) return

        const date = new Date()
        this.unlockEvents.push({
          id: uid('ach'),
          achievementId: achievement.id,
          date: date.toISOString(),
          dateKey: toDateKey(date),
          weekKey: toWeekKey(date),
        })
        changed = true
      })

      // 兼容旧版本：首次进入时给此前已经满足条件的成就补记一次解锁
      if (!this.unlockEvents.length) {
        this.defs.forEach((achievement) => {
          let isUnlocked = false
          try {
            isUnlocked = achievement.check(snapshot)
          } catch {
            isUnlocked = false
          }
          if (isUnlocked) {
            this.unlockEvents.push(backfillUnlock(achievement.id))
            changed = true
          }
        })
      }

      if (changed) {
        this.unlockEvents.sort((a, b) => new Date(a.date) - new Date(b.date))
        this.persist()
      }
      return changed
    },
  },
})
