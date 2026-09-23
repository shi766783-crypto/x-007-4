<script setup>
import { onMounted } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppNav from '@/components/layout/AppNav.vue'
import { useAchievementsStore } from '@/stores/achievements'

// 启动时同步成就解锁状态（补齐首次解锁日期，供周报统计）
const achievements = useAchievementsStore()
onMounted(() => achievements.syncUnlocks())
</script>

<template>
  <div class="app-shell">
    <AppHeader />
    <div class="app-body">
      <AppNav />
      <main class="app-main">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.app-body {
  flex: 1;
  display: flex;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px;
  gap: 16px;
}
.app-main {
  flex: 1;
  min-width: 0;
}
@media (max-width: 768px) {
  .app-body {
    flex-direction: column;
  }
}
</style>
