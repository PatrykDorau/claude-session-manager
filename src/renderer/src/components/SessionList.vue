<script setup lang="ts">
import type { Session } from '../types'
import SessionRow from './SessionRow.vue'
import { groupByProject } from '../sort'

defineProps<{ sessions: Session[]; groupBy: boolean; emptyText: string }>()
</script>

<template>
  <ul>
    <template v-if="!groupBy">
      <SessionRow v-for="sess in sessions" :key="sess.id" :session="sess" />
    </template>
    <template v-else>
      <template v-for="g in groupByProject(sessions)" :key="g.project">
        <li class="ghead">{{ g.project }} <span class="gcount">{{ g.sessions.length }}</span></li>
        <SessionRow v-for="sess in g.sessions" :key="sess.id" :session="sess" />
      </template>
    </template>
    <li v-if="!sessions.length" class="empty">{{ emptyText }}</li>
  </ul>
</template>

<style scoped>
ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.ghead {
  padding: 4px 11px;
  font-size: 10px;
  font-weight: 600;
  color: #6e7681;
  background: #0d1117;
  border-bottom: 1px solid #161b22;
}
.gcount {
  color: #484f58;
  font-weight: 400;
}
.empty {
  color: #8b949e;
  padding: 7px 10px;
  text-align: center;
}
</style>
