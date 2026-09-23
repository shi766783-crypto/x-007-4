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
import { toDateKey } from '@/utils/date'

const LOG_KEY = 'achievement-unlocks'

export const useAchievementsStore = defineStore('achievements', {
  state: () => ({
    defs: ACHIEVEMENTS,
    // 首次解锁记录 [{ id, achievementId, name, icon, date }]（升序，按解锁先后）
    unlockLog: read(LOG_KEY, []),
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

    unlocked() {
      return this.defs.filter((a) => {
        try {
          return a.check(this.snapshot)
        } catch {
          return false
        }
      })
    },

    locked() {
      const unlockedIds = new Set(this.unlocked.map((a) => a.id))
      return this.defs.filter((a) => !unlockedIds.has(a.id))
    },

    progress() {
      const total = this.defs.length
      const unlocked = this.unlocked.length
      return { total, unlocked, percent: total ? Math.round((unlocked / total) * 100) : 0 }
    },

    // 已解锁成就的解锁日期映射 { achievementId: dateKey }
    unlockDates() {
      const map = {}
      this.unlockLog.forEach((log) => {
        if (!map[log.achievementId]) map[log.achievementId] = log.date
      })
      return map
    },
  },

  actions: {
    persistLog() {
      write(LOG_KEY, this.unlockLog)
    },

    // 同步当前已满足条件但尚未记录的成就（应用启动/进入页面时调用）
    syncUnlocks() {
      const logged = new Set(this.unlockLog.map((l) => l.achievementId))
      let changed = false
      this.unlocked.forEach((a) => {
        if (!logged.has(a.id)) {
          this.unlockLog.push({
            id: uid('ach'),
            achievementId: a.id,
            name: a.name,
            icon: a.icon,
            date: toDateKey(),
          })
          changed = true
        }
      })
      if (changed) this.persistLog()
    },
  },
})
