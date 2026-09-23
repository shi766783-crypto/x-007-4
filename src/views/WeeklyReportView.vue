<script setup>
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useWeeklyReportStore } from '@/stores/weeklyReport'
import StatCard from '@/components/common/StatCard.vue'
import SimpleChart from '@/components/common/SimpleChart.vue'
import BaseButton from '@/components/common/BaseButton.vue'
import BaseEmpty from '@/components/common/BaseEmpty.vue'
import { formatDate, weekRangeLabel, currentWeekKey } from '@/utils/date'
import { WEEK_DAYS, CATEGORY_ICONS } from '@/constants'

const reportStore = useWeeklyReportStore()

const { availableWeekKeys } = storeToRefs(reportStore)

const selectedWeek = ref(reportStore.latestWeekKey)
const showWeekPicker = ref(false)

const report = computed(() => reportStore.getReport(selectedWeek.value))
const currentKey = currentWeekKey()

const canPrev = computed(() => true) // 过去任意周都可看（无数据时展示空态）
const canNext = computed(() => selectedWeek.value < currentKey)

const trendLabels = computed(() =>
  report.value.dayScores.map((d, i) => WEEK_DAYS[i].label),
)
const trendData = computed(() => report.value.dayScores.map((d) => d.score ?? 0))

const hasAnyData = computed(
  () =>
    report.value.spend > 0 ||
    report.value.wasteCount > 0 ||
    report.value.recordDays > 0 ||
    report.value.challengeCount > 0 ||
    report.value.unlockedAchievements.length > 0,
)

function prevWeek() {
  selectedWeek.value = reportStore.prevWeekKey(selectedWeek.value)
}
function nextWeek() {
  if (canNext.value) selectedWeek.value = reportStore.nextWeekKey(selectedWeek.value)
}
function pickWeek(key) {
  selectedWeek.value = key
  showWeekPicker.value = false
}

watch(
  () => reportStore.availableWeekKeys,
  (keys) => {
    if (keys.length && !keys.includes(selectedWeek.value)) {
      selectedWeek.value = reportStore.latestWeekKey
    }
  },
)
</script>

<template>
  <div class="weekly-report" @click.self="showWeekPicker = false">
    <div class="page-head">
      <h2>📓 饮食周报</h2>
      <span v-if="report.frozen" class="frozen-tag">已归档 · 自动保存于 {{ formatDate(report.savedAt.slice(0, 10)) }}</span>
      <span v-else class="live-tag">本周进行中 · 实时更新</span>
    </div>

    <!-- 周切换器 -->
    <div class="card week-switcher">
      <BaseButton size="sm" variant="ghost" :disabled="!canPrev" @click="prevWeek">← 上一周</BaseButton>
      <button class="week-center" @click="showWeekPicker = !showWeekPicker">
        <span class="week-key">{{ selectedWeek }}</span>
        <span class="week-range muted">{{ weekRangeLabel(selectedWeek) }}</span>
        <span class="caret muted">▾</span>
      </button>
      <BaseButton size="sm" variant="ghost" :disabled="!canNext" @click="nextWeek">下一周 →</BaseButton>

      <div v-if="showWeekPicker" class="week-picker card">
        <div class="picker-title muted">选择周（有数据的周已标记）</div>
        <div class="picker-list">
          <button
            v-for="key in [...availableWeekKeys].reverse()"
            :key="key"
            class="picker-item"
            :class="{ on: key === selectedWeek, current: key === currentKey }"
            @click="pickWeek(key)"
          >
            <span class="pk-key">{{ key }}<em v-if="key === currentKey">（本周）</em></span>
            <span class="pk-range muted">{{ weekRangeLabel(key) }}</span>
          </button>
        </div>
      </div>
    </div>

    <BaseEmpty
      v-if="!hasAnyData"
      emoji="🗒️"
      :text="`${selectedWeek} 这一周还没有任何记录，完成采购、记录饮食或丢弃过期食材后会自动汇总`"
    />

    <template v-else>
      <!-- 核心数字 -->
      <div class="grid grid-4">
        <StatCard label="本周采购花费" :value="report.spend.toFixed(1)" suffix="元" icon="💰" color="#ff9800" />
        <StatCard label="过期浪费" :value="report.wasteCount" suffix="种" icon="🗑️" color="#ef5350" />
        <StatCard label="平均营养评分" :value="report.avgScore" suffix="分" icon="⚖️" color="#4caf50" />
        <StatCard label="完成挑战" :value="report.challengeCount" suffix="次" icon="🧹" color="#2196f3" />
      </div>

      <!-- 营养评分走势 -->
      <div class="card">
        <div class="section-title">
          营养评分走势
          <span class="muted small">记录 {{ report.recordDays }} / 7 天 · 周均 {{ report.avgScore }} 分</span>
        </div>
        <SimpleChart type="line" :labels="trendLabels" :data="trendData" color="#4caf50" :height="220" />
      </div>

      <div class="grid grid-2">
        <!-- 采购花费明细 -->
        <div class="card">
          <div class="section-title">
            采购花费
            <span class="muted small">{{ report.purchaseCount }} 次采购 · ¥{{ report.spend.toFixed(1) }}</span>
          </div>
          <BaseEmpty v-if="!report.spendByIngredient.length" emoji="🛒" text="本周没有采购记录" />
          <ul v-else class="rank-list">
            <li v-for="it in report.spendByIngredient" :key="it.name" class="rank-item">
              <span class="rank-name">{{ it.name }}</span>
              <span class="muted small">{{ it.quantity }}{{ it.unit }}</span>
              <span class="rank-val">¥{{ it.price.toFixed(1) }}</span>
            </li>
          </ul>
        </div>

        <!-- 食材浪费明细 -->
        <div class="card">
          <div class="section-title">
            食材浪费
            <span class="muted small">{{ report.wasteCount }} 种 · 浪费率 {{ (report.wasteRate * 100).toFixed(0) }}%</span>
          </div>
          <BaseEmpty v-if="!report.wasteItems.length" emoji="♻️" text="本周零浪费，太棒了！" />
          <ul v-else class="rank-list">
            <li v-for="(w, i) in report.wasteItems" :key="i" class="rank-item">
              <span class="rank-name">{{ CATEGORY_ICONS[w.category] || '📦' }} {{ w.name }}</span>
              <span class="muted small">{{ w.quantity }}{{ w.unit }} · {{ formatDate(w.date) }}</span>
              <span class="rank-val waste">过期</span>
            </li>
          </ul>
        </div>
      </div>

      <div class="grid grid-2">
        <!-- 完成挑战 -->
        <div class="card">
          <div class="section-title">
            完成挑战
            <span class="muted small">{{ report.challengeCount }} 次 · +{{ report.challengePoints }} 积分</span>
          </div>
          <BaseEmpty v-if="!report.challenges.length" emoji="🧹" text="本周还没有完成冰箱清理挑战" />
          <ul v-else class="timeline">
            <li v-for="(c, i) in report.challenges" :key="i">
              <span class="t-dot">🧹</span>
              <div class="t-body">
                <div class="t-title">{{ c.ingredientName }} → {{ c.dishName }}</div>
                <div class="muted small">{{ formatDate(c.date) }} · +{{ c.points }} 积分</div>
              </div>
            </li>
          </ul>
        </div>

        <!-- 新解锁成就 -->
        <div class="card">
          <div class="section-title">
            新解锁成就
            <span class="muted small">{{ report.unlockedAchievements.length }} 枚</span>
          </div>
          <BaseEmpty v-if="!report.unlockedAchievements.length" emoji="🏅" text="本周没有解锁新成就" />
          <ul v-else class="timeline">
            <li v-for="a in report.unlockedAchievements" :key="a.achievementId">
              <span class="t-dot">{{ a.icon }}</span>
              <div class="t-body">
                <div class="t-title">{{ a.name }}</div>
                <div class="muted small">{{ formatDate(a.date) }} 解锁</div>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <!-- 历史周重新统计入口（源数据修正后可手动刷新快照） -->
      <div v-if="report.frozen" class="card snapshot-foot muted small">
        本周报已按期归档保存，可随时切换周次回看。若该周数据被手动修正过，
        <button class="link-btn" @click="reportStore.refreshSnapshot(selectedWeek)">
          点此重新统计
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.page-head h2 {
  margin: 0;
}
.frozen-tag,
.live-tag {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 12px;
}
.frozen-tag {
  background: var(--surface-2);
  color: var(--text-2);
}
.live-tag {
  background: var(--primary-light);
  color: var(--primary-dark);
}
.week-switcher {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  position: relative;
}
.week-center {
  flex: 1;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 10px;
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  padding: 4px 8px;
  border-radius: 8px;
}
.week-center:hover {
  background: var(--surface-2);
}
.week-key {
  font-size: 17px;
  font-weight: 700;
  color: var(--primary-dark);
}
.week-range {
  font-size: 13px;
}
.caret {
  font-size: 12px;
}
.week-picker {
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  width: 320px;
  max-height: 300px;
  overflow-y: auto;
  z-index: 20;
  padding: 10px;
}
.picker-title {
  font-size: 12px;
  padding: 2px 6px 8px;
}
.picker-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  gap: 2px;
  background: none;
  border: none;
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
}
.picker-item:hover {
  background: var(--surface-2);
}
.picker-item.on {
  background: var(--primary-light);
}
.picker-item.current .pk-key {
  color: var(--primary-dark);
}
.pk-key {
  font-weight: 600;
  font-size: 14px;
}
.pk-key em {
  font-style: normal;
  font-size: 12px;
  color: var(--text-2);
  margin-left: 4px;
}
.pk-range {
  font-size: 12px;
}
.grid {
  margin-bottom: 16px;
}
.small {
  font-size: 12px;
}
.rank-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.rank-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.rank-item:last-child {
  border-bottom: none;
}
.rank-name {
  flex: 1;
  font-weight: 500;
}
.rank-val {
  font-weight: 700;
  color: var(--warn);
}
.rank-val.waste {
  color: var(--danger);
  font-weight: 500;
  font-size: 12px;
}
.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
}
.timeline li {
  display: flex;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.timeline li:last-child {
  border-bottom: none;
}
.t-dot {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--surface-2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 15px;
}
.t-body {
  min-width: 0;
}
.t-title {
  font-weight: 500;
}
.snapshot-foot {
  text-align: center;
}
.link-btn {
  background: none;
  border: none;
  color: var(--primary-dark);
  cursor: pointer;
  font: inherit;
  text-decoration: underline;
  padding: 0;
}
</style>
