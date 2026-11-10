import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
import DashboardApp from './dashboard/DashboardApp.vue'
import LauncherApp from './LauncherApp.vue'

const ROOTS = { '#dashboard': DashboardApp, '#launcher': LauncherApp }

createApp(ROOTS[location.hash as keyof typeof ROOTS] ?? App).mount('#app')
