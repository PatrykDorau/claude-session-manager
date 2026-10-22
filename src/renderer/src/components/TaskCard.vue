<script setup lang="ts">
import { ref, computed, inject } from 'vue'
import type { Ref } from 'vue'
import type { Card } from '../cards'
import { primarySession, plainSession } from '../cards'
import { colorForProject } from '../filter'
import { statusColor, statusLabel, cleanPrompt, ago } from '../display'
import SessionRow from './SessionRow.vue'
import StageBar from './StageBar.vue'

const props = defineProps<{ card: Card }>()
const colorblind = inject<Ref<boolean>>('colorblind', ref(false))
const isExpanded = ref(false)

const color = computed(() => statusColor(props.card.status, colorblind.value))
const isWatched = computed(() => !!props.card.meta?.isWatched)
const isFinished = computed(() => !!props.card.meta?.isFinished)
const title = computed(() => {
  if (props.card.meta?.title) return props.card.meta.title
  const oldest = [...props.card.sessions].sort((a, b) => a.lastActive - b.lastActive)[0]
  return cleanPrompt(oldest?.name ?? oldest?.firstPrompt ?? '')
})

const openPrimary = (): void => window.api.openSession(plainSession(primarySession(props.card)))
const openMenu = (): void => window.api.sessionMenu(plainSession(primarySession(props.card)))
const openTicket = (): void => window.api.openTicket(props.card.ticket)
const openFolder = (): void => window.api.openTaskFolder(props.card.ticket)
const openMr = (): void => window.api.openMr(props.card.ticket)
const toggleWatch = (): void => window.api.setTaskWatched(props.card.ticket, !isWatched.value)
const toggleFinished = (): void => window.api.setTaskFinished(props.card.ticket, !isFinished.value)
const toggleExpand = (): void => {
  isExpanded.value = !isExpanded.value
}
const hexToRgba = (hex: string, a: number): string => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}
const background = computed(() => {
  if (props.card.status === 'working') return hexToRgba(color.value, 0.1)
  if (props.card.status === 'checkout') return hexToRgba(color.value, 0.14)
  return ''
})
</script>

<template>
  <li class="card" :class="{ rejected: card.meta?.isRejected }">
    <div
      class="head"
      :class="{ waiting: card.status === 'waiting' }"
      :style="{
        background,
        '--blink-bg': hexToRgba(color, 0.28),
        borderLeft: '3px solid ' + colorForProject(card.projects[0])
      }"
      :title="title"
      @click="openPrimary"
      @contextmenu.prevent.stop="openMenu"
    >
      <span class="dot" :style="{ background: color, boxShadow: '0 0 6px ' + color }" />
      <div class="body">
        <div class="line">
          <span class="ticket" @click.stop="openTicket">{{ card.ticket }}</span>
          <span v-if="card.meta?.jiraStatus" class="jira">{{ card.meta.jiraStatus }}</span>
          <span class="projects">{{ card.projects.join(', ') }}</span>
          <span class="status" :style="{ color }">{{ statusLabel(card.status) }}</span>
          <span class="time">{{ ago(card.lastActive) }}</span>
        </div>
        <div class="line">
          <span class="ttl">{{ title }}</span>
        </div>
        <StageBar
          :stage="card.meta?.stage ?? null"
          :reached="card.meta?.reached ?? []"
          :is-rejected="card.meta?.isRejected"
        />
      </div>
      <button
        class="exp"
        :title="isExpanded ? 'Hide sessions' : 'Show sessions'"
        @click.stop="toggleExpand"
      >
        {{ isExpanded ? '▾' : '▸' }} {{ card.sessions.length }}
      </button>
      <div class="actions">
        <button
          class="ic"
          title="Open task folder"
          :disabled="!card.meta?.folder"
          @click.stop="openFolder"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </button>
        <button
          class="ic"
          title="Merge requests in GitLab"
          :disabled="!card.meta?.mrUrl"
          @click.stop="openMr"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="18" cy="18" r="3" />
            <circle cx="6" cy="6" r="3" />
            <path d="M13 6h3a2 2 0 0 1 2 2v7" />
            <line x1="6" y1="9" x2="6" y2="21" />
          </svg>
        </button>
        <button class="ic" title="Open in Jira" @click.stop="openTicket">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </button>
        <button
          class="ic star"
          :class="{ on: isWatched }"
          title="Pin to top"
          @click.stop="toggleWatch"
        >
          <svg
            viewBox="0 0 24 24"
            :fill="isWatched ? 'currentColor' : 'none'"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polygon
              points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
            />
          </svg>
        </button>
        <button
          class="ic"
          :class="{ on: isFinished }"
          :title="isFinished ? 'Mark not finished' : 'Mark finished'"
          @click.stop="toggleFinished"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
        <button class="ic" title="More actions" @click.stop="openMenu">
          <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>
      </div>
    </div>
    <ul v-if="isExpanded" class="sessions">
      <SessionRow v-for="sess in card.sessions" :key="sess.id" :session="sess" :is-compact="true" />
    </ul>
  </li>
</template>

<style scoped>
.card {
  border-bottom: 1px solid #161b22;
}
.card.rejected .head {
  background: rgba(248, 81, 73, 0.12) !important;
  border-left-color: #f85149 !important;
}
.card.rejected .ttl {
  color: #ffa198;
  text-decoration: line-through;
  text-decoration-color: rgba(248, 81, 73, 0.6);
}
.card.rejected .jira {
  color: #fff;
  background: #da3633;
}
.head {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 9px 11px;
  cursor: pointer;
}
.head.waiting {
  animation: rowblink 1.1s ease-in-out infinite;
}
@keyframes rowblink {
  0%,
  100% {
    background: transparent;
  }
  50% {
    background: var(--blink-bg, rgba(240, 136, 62, 0.28));
  }
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: none;
  margin-top: 3px;
}
.body {
  flex: 1;
  min-width: 0;
}
.line {
  display: flex;
  align-items: baseline;
  gap: 7px;
}
.line + .line {
  margin-top: 3px;
}
.ticket {
  flex: none;
  color: #a371f7;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.ticket:hover {
  text-decoration: underline;
}
.jira {
  flex: none;
  font-size: 9px;
  font-weight: 600;
  color: #c9d1d9;
  background: #30363d;
  border-radius: 9px;
  padding: 1px 7px;
  line-height: 1.5;
  white-space: nowrap;
}
.projects {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #6e7681;
  font-size: 10px;
}
.status {
  flex: none;
  font-size: 10px;
  font-weight: 600;
}
.time {
  flex: none;
  color: #6e7681;
  font-size: 10px;
}
.ttl {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #e6edf3;
  font-size: 11px;
}
.exp {
  position: absolute;
  right: 8px;
  bottom: 6px;
  background: none;
  border: none;
  color: #6e7681;
  font: 10px system-ui;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
}
.exp:hover {
  color: #e6edf3;
  background: #21262d;
}
.actions {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 22px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px 0 26px;
  background: linear-gradient(to left, rgba(13, 17, 23, 0.96) 70%, rgba(13, 17, 23, 0));
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s;
}
.head:hover .actions {
  opacity: 1;
  pointer-events: auto;
}
.ic {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 5px;
  color: #b1bac4;
  display: inline-flex;
}
.ic svg {
  width: 15px;
  height: 15px;
  display: block;
}
.ic:hover:not(:disabled) {
  color: #fff;
  background: #21262d;
}
.ic:disabled {
  opacity: 0.3;
  cursor: default;
}
.ic.star.on {
  color: #e3b341;
}
.ic.on {
  color: #3fb950;
}
.sessions {
  list-style: none;
  margin: 0;
  padding: 0 0 0 14px;
  background: #0b0f14;
}
</style>
