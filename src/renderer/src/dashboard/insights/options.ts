import type { EChartsCoreOption } from 'echarts/core'
import { formatCompact } from '../charts'
import {
  CHART_FONT,
  CHART_SPLIT,
  CHART_TEXT,
  CHART_TEXT_STRONG,
  MARKER_COLOR,
  withAlpha,
  type ChartSeries
} from './palette'

export type DayColumn = { label: string; day: string; values: Record<string, number> }
export type DayMarker = { index: number; title: string }
export type Slice = { label: string; color: string; value: number }
export type BarItem = { label: string; value: number; color: string; text: string; tip: string }
export type LineItem = ChartSeries & { values: number[] }

type TipParam = { seriesName?: string; value: unknown; marker?: unknown; dataIndex: number }

const TOOLTIP = {
  backgroundColor: '#111111',
  borderColor: '#333333',
  borderWidth: 1,
  padding: [8, 10],
  textStyle: { color: CHART_TEXT_STRONG, fontSize: 12, fontFamily: CHART_FONT },
  extraCssText: 'border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.45);'
}
const LEGEND = {
  bottom: 0,
  icon: 'circle',
  itemWidth: 8,
  itemHeight: 8,
  itemGap: 16,
  textStyle: { color: CHART_TEXT, fontSize: 11, fontFamily: CHART_FONT }
}
const AXIS_LABEL = { color: CHART_TEXT, fontSize: 11, fontFamily: CHART_FONT }
const SPLIT_LINE = { lineStyle: { color: CHART_SPLIT, type: 'dashed' } }

const baseOption = (): EChartsCoreOption => ({
  backgroundColor: 'transparent',
  textStyle: { color: CHART_TEXT, fontSize: 11, fontFamily: CHART_FONT },
  animationDuration: 400,
  animationDurationUpdate: 400
})

const verticalGradient = (color: string, bottomAlpha: number): object => ({
  type: 'linear',
  x: 0,
  y: 0,
  x2: 0,
  y2: 1,
  colorStops: [
    { offset: 0, color },
    { offset: 1, color: withAlpha(color, bottomAlpha) }
  ]
})

const areaGradient = (color: string, topAlpha: number): object => ({
  type: 'linear',
  x: 0,
  y: 0,
  x2: 0,
  y2: 1,
  colorStops: [
    { offset: 0, color: withAlpha(color, topAlpha) },
    { offset: 1, color: withAlpha(color, 0) }
  ]
})

const horizontalGradient = (color: string): object => ({
  type: 'linear',
  x: 0,
  y: 0,
  x2: 1,
  y2: 0,
  colorStops: [
    { offset: 0, color: withAlpha(color, 0.55) },
    { offset: 1, color }
  ]
})

const escapeHtml = (text: string): string =>
  text.replace(
    /[&<>"]/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch
  )

const tipRow = (marker: unknown, name: string, value: string): string =>
  `<div style="display:flex;gap:14px;justify-content:space-between"><span>${String(marker ?? '')}${escapeHtml(name)}</span><b>${value}</b></div>`

const tipHeader = (text: string): string =>
  `<div style="margin-bottom:4px;color:${CHART_TEXT}">${escapeHtml(text)}</div>`

const numberValue = (value: unknown): number => (typeof value === 'number' ? value : 0)

const categoryAxis = (labels: string[], isBoundaryGap: boolean): object => ({
  type: 'category',
  data: labels,
  boundaryGap: isBoundaryGap,
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { ...AXIS_LABEL, margin: 10 }
})

const valueAxis = (): object => ({
  type: 'value',
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { ...AXIS_LABEL, formatter: formatCompact },
  splitLine: SPLIT_LINE,
  splitNumber: 4
})

const markLineOf = (markers: DayMarker[], labels: string[]): object => ({
  symbol: ['none', 'none'],
  lineStyle: { color: MARKER_COLOR, type: 'dashed', width: 1, opacity: 0.8 },
  label: { show: false },
  emphasis: {
    label: {
      show: true,
      formatter: '{b}',
      color: MARKER_COLOR,
      fontSize: 11,
      position: 'insideEndTop'
    },
    lineStyle: { width: 1.5 }
  },
  data: markers.map((m) => ({ xAxis: labels[m.index], name: m.title }))
})

const markerLines = (markers: DayMarker[], index: number): string =>
  markers
    .filter((m) => m.index === index)
    .map((m) => `<div style="margin-top:4px;color:${MARKER_COLOR}">${escapeHtml(m.title)}</div>`)
    .join('')

export const costPerDayOption = (
  columns: DayColumn[],
  series: ChartSeries[],
  markers: DayMarker[]
): EChartsCoreOption => {
  const labels = columns.map((c) => c.label)
  const topSeries = columns.map((c) =>
    series.reduce((top, s, i) => ((c.values[s.key] ?? 0) > 0 ? i : top), -1)
  )
  const formatTip = (raw: unknown): string => {
    const params = (raw as TipParam[]).filter((p) => numberValue(p.value) > 0)
    const index = (raw as TipParam[])[0]?.dataIndex ?? 0
    const total = params.reduce((sum, p) => sum + numberValue(p.value), 0)
    return [
      tipHeader(`${columns[index]?.day ?? ''} · ${formatCompact(total)}`),
      ...params.map((p) =>
        tipRow(p.marker, p.seriesName ?? '', formatCompact(numberValue(p.value)))
      ),
      markerLines(markers, index)
    ].join('')
  }
  return {
    ...baseOption(),
    grid: { left: 4, right: 12, top: 20, bottom: 30, containLabel: true },
    tooltip: {
      ...TOOLTIP,
      trigger: 'axis',
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(255,255,255,0.04)' } },
      formatter: formatTip
    },
    legend: { ...LEGEND, data: series.map((s) => s.label) },
    xAxis: categoryAxis(labels, true),
    yAxis: valueAxis(),
    series: series.map((s, seriesIndex) => ({
      type: 'bar',
      name: s.label,
      stack: 'cost',
      barMaxWidth: 28,
      emphasis: { focus: 'series' },
      itemStyle: { color: verticalGradient(s.color, 0.72) },
      data: columns.map((c, dayIndex) => ({
        value: c.values[s.key] ?? 0,
        itemStyle: { borderRadius: topSeries[dayIndex] === seriesIndex ? [4, 4, 0, 0] : 0 }
      })),
      ...(seriesIndex === 0 && markers.length ? { markLine: markLineOf(markers, labels) } : {})
    }))
  }
}

export const donutOption = (
  slices: Slice[],
  centerText: string,
  centerSub: string
): EChartsCoreOption => {
  const total = slices.reduce((sum, s) => sum + s.value, 0)
  const shareOf = (value: number): number => (total === 0 ? 0 : Math.round((value / total) * 100))
  const shareByLabel = new Map(slices.map((s) => [s.label, shareOf(s.value)]))
  const formatLegend = (name: string): string => `{n|${name}}{v|${shareByLabel.get(name) ?? 0}%}`
  const formatTip = (raw: unknown): string => {
    const p = raw as TipParam & { name: string }
    return tipRow(
      p.marker,
      p.name,
      `${formatCompact(numberValue(p.value))} · ${shareOf(numberValue(p.value))}%`
    )
  }
  return {
    ...baseOption(),
    title: {
      text: centerText,
      subtext: centerSub,
      left: '27%',
      top: 'middle',
      textAlign: 'center',
      itemGap: 2,
      textStyle: {
        color: CHART_TEXT_STRONG,
        fontSize: 22,
        fontWeight: 600,
        fontFamily: CHART_FONT
      },
      subtextStyle: { color: CHART_TEXT, fontSize: 11, fontFamily: CHART_FONT }
    },
    tooltip: { ...TOOLTIP, trigger: 'item', formatter: formatTip },
    legend: {
      ...LEGEND,
      bottom: undefined,
      orient: 'vertical',
      right: 8,
      top: 'middle',
      itemGap: 12,
      formatter: formatLegend,
      textStyle: {
        ...LEGEND.textStyle,
        rich: {
          n: { color: CHART_TEXT, fontSize: 11, width: 72 },
          v: { color: CHART_TEXT_STRONG, fontSize: 12, fontWeight: 600, width: 34, align: 'right' }
        }
      }
    },
    series: [
      {
        type: 'pie',
        center: ['27%', '50%'],
        radius: ['58%', '80%'],
        padAngle: 2,
        avoidLabelOverlap: true,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderRadius: 4 },
        emphasis: { scale: true, scaleSize: 4 },
        data: slices.map((s) => ({ name: s.label, value: s.value, itemStyle: { color: s.color } }))
      }
    ]
  }
}

export const hbarOption = (items: BarItem[]): EChartsCoreOption => {
  const formatTip = (raw: unknown): string => items[(raw as TipParam).dataIndex]?.tip ?? ''
  const formatLabel = (raw: unknown): string => items[(raw as TipParam).dataIndex]?.text ?? ''
  return {
    ...baseOption(),
    grid: { left: 4, right: 104, top: 4, bottom: 4, containLabel: true },
    tooltip: { ...TOOLTIP, trigger: 'item', formatter: formatTip },
    xAxis: { type: 'value', show: false, splitLine: { show: false } },
    yAxis: {
      type: 'category',
      inverse: true,
      data: items.map((i) => i.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: CHART_TEXT_STRONG, fontSize: 12, fontFamily: CHART_FONT, margin: 12 }
    },
    series: [
      {
        type: 'bar',
        barWidth: 12,
        showBackground: true,
        backgroundStyle: { color: 'rgba(255,255,255,0.035)', borderRadius: 6 },
        label: {
          show: true,
          position: 'right',
          distance: 8,
          color: CHART_TEXT_STRONG,
          fontSize: 11,
          fontFamily: CHART_FONT,
          formatter: formatLabel
        },
        data: items.map((i) => ({
          value: i.value,
          itemStyle: { color: horizontalGradient(i.color), borderRadius: 6 }
        }))
      }
    ]
  }
}

export const linesOption = (
  labels: string[],
  series: LineItem[],
  markers: DayMarker[]
): EChartsCoreOption => {
  const formatTip = (raw: unknown): string => {
    const params = raw as TipParam[]
    const index = params[0]?.dataIndex ?? 0
    return [
      tipHeader(labels[index] ?? ''),
      ...params.map((p) =>
        tipRow(p.marker, p.seriesName ?? '', formatCompact(numberValue(p.value)))
      ),
      markerLines(markers, index)
    ].join('')
  }
  return {
    ...baseOption(),
    grid: { left: 4, right: 16, top: 20, bottom: 30, containLabel: true },
    tooltip: {
      ...TOOLTIP,
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: 'rgba(255,255,255,0.18)', type: 'dashed' } },
      formatter: formatTip
    },
    legend: { ...LEGEND, data: series.map((s) => s.label) },
    xAxis: categoryAxis(labels, false),
    yAxis: { ...valueAxis(), minInterval: 1 },
    series: series.map((s, seriesIndex) => ({
      type: 'line',
      name: s.label,
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      showSymbol: true,
      lineStyle: { width: 2, color: s.color },
      itemStyle: { color: s.color, borderColor: '#202020', borderWidth: 1.5 },
      areaStyle: { color: areaGradient(s.color, 0.08) },
      emphasis: { focus: 'series' },
      data: s.values,
      ...(seriesIndex === 0 && markers.length ? { markLine: markLineOf(markers, labels) } : {})
    }))
  }
}

export const sparkOption = (
  values: number[],
  markIndex: number | null,
  color: string
): EChartsCoreOption => ({
  backgroundColor: 'transparent',
  animation: false,
  grid: { left: 2, right: 2, top: 4, bottom: 4 },
  xAxis: { type: 'category', show: false, boundaryGap: false, data: values.map((_v, i) => i) },
  yAxis: { type: 'value', show: false, min: 0 },
  series: [
    {
      type: 'line',
      silent: true,
      smooth: true,
      symbol: 'circle',
      symbolSize: 4,
      showSymbol: values.length === 1,
      lineStyle: { width: 1.5, color },
      itemStyle: { color },
      areaStyle: { color: areaGradient(color, 0.22) },
      data: values,
      ...(markIndex === null
        ? {}
        : {
            markLine: {
              silent: true,
              symbol: ['none', 'none'],
              label: { show: false },
              lineStyle: { color: MARKER_COLOR, type: 'dashed', width: 1 },
              data: [{ xAxis: markIndex }]
            }
          })
    }
  ]
})
