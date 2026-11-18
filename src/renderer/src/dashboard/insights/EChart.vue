<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { init, use, type EChartsCoreOption, type EChartsType } from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer
])

const props = defineProps<{ option: EChartsCoreOption; height: number }>()

const host = ref<HTMLDivElement | null>(null)
let chart: EChartsType | null = null
let observer: ResizeObserver | null = null

const resizeChart = (): void => chart?.resize()

onMounted(() => {
  if (!host.value) return
  chart = init(host.value, null, { renderer: 'canvas' })
  chart.setOption(props.option, true)
  observer = new ResizeObserver(resizeChart)
  observer.observe(host.value)
})

watch(
  () => props.option,
  (option) => chart?.setOption(option, true)
)

watch(
  () => props.height,
  () => requestAnimationFrame(resizeChart)
)

onBeforeUnmount(() => {
  observer?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div ref="host" class="echart" :style="{ height: `${height}px` }" />
</template>

<style scoped>
.echart {
  width: 100%;
  min-width: 0;
}
</style>
