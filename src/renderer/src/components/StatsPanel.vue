<script setup lang="ts">
import { computed } from 'vue'
import type { Session } from '../types'
import { computeStats } from '../stats'

const props = defineProps<{ sessions: Session[] }>()
const stats = computed(() => computeStats(props.sessions, Date.now()))
const maxDay = computed(() => Math.max(1, ...stats.value.perDay.map((d) => d.count)))

function tokens(n: number): string {
  return n >= 1000 ? Math.round(n / 1000) + 'k' : String(n)
}
</script>

<template>
  <div class="stats">
    <div class="cards">
      <div class="card">
        <div class="big">{{ stats.total }}</div>
        <div class="lbl">sessions</div>
      </div>
      <div class="card">
        <div class="big">{{ stats.open }}</div>
        <div class="lbl">open</div>
      </div>
      <div class="card">
        <div class="big">{{ stats.needsYou }}</div>
        <div class="lbl">need you</div>
      </div>
      <div class="card">
        <div class="big">{{ tokens(stats.totalContextTokens) }}</div>
        <div class="lbl">context</div>
      </div>
    </div>

    <h3>Activity · 7 days</h3>
    <div class="chart">
      <div v-for="d in stats.perDay" :key="d.label" class="bar" :title="`${d.count}`">
        <div class="track">
          <div class="fill" :style="{ height: (d.count / maxDay) * 100 + '%' }" />
        </div>
        <div class="barlbl">{{ d.label }}</div>
      </div>
    </div>

    <h3>By status</h3>
    <div class="rows">
      <div v-for="r in stats.byStatus" :key="r.status" class="srow">
        <span>{{ r.label }}</span><span class="num">{{ r.count }}</span>
      </div>
    </div>

    <h3>Top projects</h3>
    <div class="rows">
      <div v-for="p in stats.topProjects" :key="p.project" class="srow">
        <span class="proj">{{ p.project }}</span><span class="num">{{ p.count }}</span>
      </div>
    </div>

    <template v-if="stats.byModel.length">
      <h3>Models</h3>
      <div class="rows">
        <div v-for="m in stats.byModel" :key="m.model" class="srow">
          <span>{{ m.model }}</span><span class="num">{{ m.count }}</span>
        </div>
      </div>
    </template>

    <template v-if="stats.bySession.length">
      <h3>Top sessions by context · avg {{ tokens(stats.avgContextTokens) }}</h3>
      <div class="rows">
        <div v-for="r in stats.bySession" :key="r.id" class="srow">
          <span class="proj">{{ r.label }}</span>
          <span class="sright">
            <span v-if="r.model" class="model">{{ r.model }}</span>
            <span class="num">{{ tokens(r.tokens) }}</span>
          </span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.stats {
  padding: 12px;
  color: #e6edf3;
  font-size: 12px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.card {
  background: #161b22;
  border: 1px solid #21262d;
  border-radius: 8px;
  padding: 10px;
  text-align: center;
}
.big {
  font-size: 22px;
  font-weight: 700;
  color: #58a6ff;
}
.lbl {
  font-size: 10px;
  color: #8b949e;
  margin-top: 2px;
}
h3 {
  font-size: 11px;
  font-weight: 600;
  color: #8b949e;
  margin: 16px 0 6px;
}
.chart {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 80px;
}
.bar {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}
.track {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
}
.fill {
  width: 100%;
  min-height: 2px;
  background: #58a6ff;
  border-radius: 3px 3px 0 0;
}
.barlbl {
  font-size: 9px;
  color: #6e7681;
  margin-top: 3px;
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.srow {
  display: flex;
  justify-content: space-between;
  padding: 4px 6px;
  border-bottom: 1px solid #161b22;
}
.proj {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.num {
  color: #8b949e;
  font-weight: 600;
}
.sright {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
.model {
  color: #6e7681;
  font-size: 10px;
}
</style>
