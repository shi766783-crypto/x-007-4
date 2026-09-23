<script setup>
import { ref, computed, watch } from 'vue'
import { useWeeklyReportStore } from '@/stores/weeklyReport'
import { useAchievementsStore } from '@/stores/achievements'
import StatCard from '@/components/common/StatCard.vue'
import SimpleChart from '@/components/common/SimpleChart.vue'
import BaseButton from '@/components/common/BaseButton.vue'
import BaseEmpty from '@/components/common/BaseEmpty.vue'
import {
  currentWeekKey,
  shiftWeekKey,
  weekStartFromKey,
  weekDateKeysByKey,
  formatWeekRange,
  formatWeekKey,
  parseDateKey,
} from '@/utils/date'

const weekly = useWeeklyReportStore()
const achievements = useAchievementsStore()

const selectedWeek = ref(currentWeekKey())

const isCurrentWeek = computed(() => selectedWeek.value === currentWeekKey())

// 进入页面或切换周时：先同步成就解锁，再生成/刷新并按期保存该周快照
function ensureWeek() {
  achievements.syncUnlocks()
  weekly.saveWeek(selectedWeek.value)
}
ensureWeek()
watch(selectedWeek, ensureWeek)

const report = computed(() => weekly.getReport(selectedWeek.value))

function prevWeek() {
  selectedWeek.value = shiftWeekKey(selectedWeek.value, -1)
}
function nextWeek() {
  if (!isCurrentWeek.value) selectedWeek.value = shiftWeekKey(selectedWeek.value, 1)
}

// 周区间标题
const rangeText = computed(() => {
  if (!report.value) return ''
  return formatWeekRange(report.value.startKey, report.value.endKey)
})

// 营养评分走势图
const trendLabels = computed(() =>
  (report.value?.nutrition.daily || []).map((d) => {
    const date = parseDateKey(d.date)
    return `${date.getMonth() + 1}/${date.getDate()}`
  }),
)
const trendData = computed(() => (report.value?.nutrition.daily || []).map((d) => d.score ?? 0))

// 每日采购柱状图
const spendLabels = computed(() => trendLabels.value)
const spendData = computed(() => (report.value?.spend.perDay || []).map((d) => Number(d.total.toFixed(1))))

// 浪费类别分布
const wasteCatLabels = computed(() => Object.keys(report.value?.waste.byCategory || {}))
const wasteCatData = computed(() => Object.values(report.value?.waste.byCategory || {}))

// 可切换的周按月份分组
const weekGroups = computed(() => {
  const groups = {}
  weekly.availableWeekKeys.forEach((key) => {
    const start = parseDateKey(weekStartFromKey(key))
    const label = `${start.getFullYear()}年${start.getMonth() + 1}月`
    if (!groups[label]) groups[label] = []
    groups[label].push(key)
  })
  return Object.entries(groups)
})

const challengePoints = computed(() =>
  (report.value?.challenges || []).reduce((s, c) => s + Number(c.points || 0), 0),
)

function fmtShort(dateKey) {
  const d = parseDateKey(dateKey)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
function fmtDateTime(iso) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function weekOptionLabel(key) {
  const days = weekDateKeysByKey(key)
  return formatWeekRange(days[0], days[6])
}
</script>

<template>
  <div>
    <div class="page-head">
      <h2>📰 饮食周报</h2>
      <div class="week-picker">
        <BaseButton size="sm" variant="ghost" @click="prevWeek">← 上一周</BaseButton>
        <select v-model="selectedWeek" class="week-select">
          <optgroup v-for="[label, keys] in weekGroups" :key="label" :label="label">
            <option v-for="key in keys" :key="key" :value="key">
              {{ formatWeekKey(key) }} · {{ weekOptionLabel(key) }}
            </option>
          </optgroup>
        </select>
        <BaseButton size="sm" variant="ghost" :disabled="isCurrentWeek" @click="nextWeek">下一周 →</BaseButton>
      </div>
    </div>

    <div v-if="report" class="week-meta">
      <span class="range">📅 {{ rangeText }}</span>
      <span v-if="isCurrentWeek" class="tag-now">本周（持续更新）</span>
      <span v-else class="tag-archived">历史周报</span>
      <span class="muted small">最近保存：{{ fmtDateTime(report.generatedAt) }}</span>
    </div>

    <template v-if="report">
      <div class="grid grid-4">
        <StatCard label="本周采购花费" :value="report.spend.total.toFixed(1)" suffix="元" icon="💰" color="#ff9800" />
        <StatCard
          label="食材浪费"
          :value="report.waste.count"
          suffix="件"
          icon="🗑️"
          color="#ef5350"
        />
        <StatCard label="平均营养评分" :value="report.nutrition.avgScore" suffix="分" icon="⚖️" color="#4caf50" />
        <StatCard
          label="完成清理挑战"
          :value="report.challenges.length"
          suffix="次"
          icon="🧹"
          color="#2196f3"
        />
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="section-title">
            营养评分走势
            <span class="muted small">记录 {{ report.nutrition.recordedMeals }} 餐 · 最高 {{ report.nutrition.bestDay?.score ?? 0 }} 分</span>
          </div>
          <SimpleChart type="line" :labels="trendLabels" :data="trendData" color="#2196f3" :height="210" />
          <div class="muted small tip">未记录的日期按 0 分显示</div>
        </div>
        <div class="card">
          <div class="section-title">
            每日采购花费
            <span class="muted small">{{ report.spend.rounds }} 次采购</span>
          </div>
          <SimpleChart type="bar" :labels="spendLabels" :data="spendData" color="#ff9800" :height="210" />
          <div class="muted small tip">单位：元</div>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="section-title">采购明细</div>
          <BaseEmpty v-if="!report.spend.rounds" emoji="🛒" text="本周还没有完成采购" />
          <template v-else>
            <div class="kv-row summary">
              <span>总花费</span>
              <b class="money">¥{{ report.spend.total.toFixed(1) }}</b>
            </div>
            <div class="mini-list">
              <div v-for="it in report.spend.topItems.slice(0, 8)" :key="it.name" class="kv-row">
                <span>{{ it.name }} <em class="muted">{{ it.quantity }}{{ it.unit }}</em></span>
                <span class="money">¥{{ it.amount.toFixed(1) }}</span>
              </div>
            </div>
          </template>
        </div>

        <div class="card">
          <div class="section-title">
            食材浪费
            <span v-if="report.waste.count" class="muted small">浪费率 {{ (report.waste.rate * 100).toFixed(1) }}%</span>
          </div>
          <BaseEmpty v-if="!report.waste.count" emoji="♻️" text="本周零浪费，保持得很好！" />
          <template v-else>
            <div v-if="wasteCatLabels.length" class="waste-chart">
              <SimpleChart type="bar" :labels="wasteCatLabels" :data="wasteCatData" color="#ef5350" :height="140" />
            </div>
            <div class="mini-list">
              <div v-for="w in report.waste.items" :key="w.id" class="kv-row">
                <span>{{ fmtShort(w.dateKey) }} {{ w.name }} <em class="muted">{{ w.quantity }}{{ w.unit }}</em></span>
                <span class="reason">{{ w.reason }}</span>
              </div>
            </div>
          </template>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="section-title">
            🏆 完成的清理挑战
            <span class="muted small">+{{ challengePoints }} 积分</span>
          </div>
          <BaseEmpty v-if="!report.challenges.length" emoji="🧊" text="本周没有完成清理挑战" />
          <div v-else class="mini-list">
            <div v-for="c in report.challenges" :key="c.id" class="kv-row">
              <span>{{ fmtShort(c.dateKey) }} {{ c.ingredientName }} → 「{{ c.dishName }}」</span>
              <span class="points">+{{ c.points }}</span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="section-title">🎖️ 本周新解锁成就</div>
          <BaseEmpty v-if="!report.achievements.length" emoji="🔒" text="本周没有新解锁的成就，继续加油" />
          <div v-else class="achv-list">
            <div v-for="a in report.achievements" :key="a.eventId" class="achv">
              <span class="achv-icon">{{ a.icon }}</span>
              <div class="achv-info">
                <div class="achv-name">{{ a.name }}</div>
                <div class="muted small">{{ a.desc }}</div>
              </div>
              <span class="muted small">{{ fmtShort(a.dateKey) }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  gap: 12px;
  flex-wrap: wrap;
}
.page-head h2 {
  margin: 0;
}
.week-picker {
  display: flex;
  align-items: center;
  gap: 8px;
}
.week-select {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
  max-width: 200px;
}
.week-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.range {
  font-weight: 600;
}
.tag-now,
.tag-archived {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 12px;
  font-weight: 600;
}
.tag-now {
  background: var(--primary-light);
  color: var(--primary-dark);
}
.tag-archived {
  background: var(--surface-2);
  color: var(--text-2);
}
.small {
  font-size: 12px;
}
.grid {
  margin-bottom: 16px;
}
.tip {
  margin-top: 6px;
  text-align: right;
}
.kv-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 0;
  border-bottom: 1px dashed var(--border);
  font-size: 13px;
}
.kv-row:last-child {
  border-bottom: none;
}
.kv-row.summary {
  font-size: 14px;
  border-bottom: 1px solid var(--border);
}
.kv-row em {
  font-style: normal;
  margin-left: 4px;
}
.money {
  color: var(--primary-dark);
  font-weight: 600;
}
.points {
  color: var(--warn);
  font-weight: 600;
}
.reason {
  color: var(--text-2);
  font-size: 12px;
  flex-shrink: 0;
}
.waste-chart {
  margin-bottom: 8px;
}
.achv-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.achv {
  display: flex;
  align-items: center;
  gap: 12px;
}
.achv-icon {
  font-size: 28px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--warn-light);
  border-radius: 10px;
  flex-shrink: 0;
}
.achv-info {
  flex: 1;
  min-width: 0;
}
.achv-name {
  font-weight: 600;
  font-size: 14px;
}
</style>
