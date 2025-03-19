import { check } from 'diskspace'
import { cpuUsage, freememPercentage } from 'os-utils'

function getUsedDiskPercentage() {
  return new Promise<number>((resolve, reject) =>
    check('/', (err, result) => {
      if (err != null) {
        reject(err)
      } else {
        resolve((result.used / +result.total) * 100)
      }
    })
  )
}

function getCpuUsage() {
  return new Promise<number>((resolve) => cpuUsage((v) => resolve(v * 100)))
}

export async function getPerformanceStatus() {
  const memPercentage = 100 - freememPercentage() * 100
  const cpuPercentage = await getCpuUsage()
  const diskPercentage = await getUsedDiskPercentage()
  return {
    memPercentage,
    diskPercentage,
    cpuPercentage,
  }
}
