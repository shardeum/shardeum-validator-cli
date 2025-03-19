import { ProcessDescription } from 'pm2'
export interface Pm2ProcessStatus {
  name?: string
  uptimeInSeconds?: number
  restarts?: number
  status?: string
  cpuUsagePercent?: number
  memUsedInBytes?: number
  link?: string
}

export function statusFromPM2(pm2Description: ProcessDescription): Pm2ProcessStatus {
  return {
    name: pm2Description.name,
    uptimeInSeconds: pm2Description.pm2_env?.pm_uptime ? (Date.now() - pm2Description.pm2_env?.pm_uptime) / 1000 : 0,
    restarts: pm2Description.pm2_env?.restart_time,
    status: pm2Description.pm2_env?.status,
    cpuUsagePercent: pm2Description.monit?.cpu,
    memUsedInBytes: pm2Description.monit?.memory,
  }
}
