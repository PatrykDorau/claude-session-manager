import type { ServerChoice } from '../types'

export const runningChoice = (label: string, current: ServerChoice): ServerChoice => {
  if (label === 'custom') return current
  const [tenant, environment, platform, resolution] = label.split(' · ')
  return {
    tenant: tenant || current.tenant,
    environment: environment || current.environment,
    platform: platform || current.platform,
    resolution: resolution || current.resolution
  }
}
