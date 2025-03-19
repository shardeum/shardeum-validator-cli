import path from 'path'
import fs from 'fs'
import { File } from '../utils'
import { nodeProgressType } from '../config/default-network-config'

export function fetchExitSummary() {
  return fetchFromLog(`${File.EXIT_SUMMARY}`)
}

export function fetchStartSummary() {
  return fetchFromLog(`${File.START_SUMMARY}`)
}

export async function fetchNodeProgress(): Promise<nodeProgressType | null> {
  return fetchFromLog(`${File.NODE_PROGRESS}`)
}

export async function getExitInformation() {
  const exitSummary = fetchExitSummary()
  const startSummary = fetchStartSummary()

  const interceptExitMessage = (message: string) => {
    if (message.includes('Fatal: submitJoin: our node')) {
      return 'Unable to access external or internal ports. Please provide proper port access to the external and internal ports of shardeum  (9001 / 10001 are the defaults)'
    }
    return message
  }
  // don't show exit reason if the validator is running or was never started
  const showExitReason =
    exitSummary?.exitTime > startSummary?.startTime ||
    (startSummary?.startTime == null && exitSummary?.exitTime != null)
  const exitMessage = showExitReason ? interceptExitMessage(exitSummary?.message) : undefined
  const exitStatus = showExitReason ? exitSummary?.status : undefined
  return { exitMessage, exitStatus }
}

export function getProgressData(nodeProgress: nodeProgressType | null) {
  if (!nodeProgress) {
    return {
      state: 'standby',
      totalTimeValidating: '00:00:00',
      lastActive: '',
      lastRotationIndex: '',
      nodeInfo: '',
    }
  }

  const lastRotationIndexSafe = nodeProgress.lastRotationIndex ?? {
    idx: 0,
    total: 0,
  }
  const lastActiveTimeSafe = nodeProgress.lastActiveTime ?? 0

  const startData = fetchFromLog(`${File.START_SUMMARY}`)

  if (
    startData.startTime >
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.statSync(path.join(__dirname, `../../logs/${File.NODE_PROGRESS}`)).mtimeMs
  ) {
    nodeProgress.totalActiveTime = 0
    nodeProgress.nodeInfo.status = 'standby'
  }

  const LastActiveDate = new Date(lastActiveTimeSafe)

  return {
    state: nodeProgress.nodeInfo.status,
    totalTimeValidating: convertMsToDHM(nodeProgress.totalActiveTime),
    lastActive: lastActiveTimeSafe ? `${LastActiveDate.toDateString()} ${LastActiveDate.toTimeString()}` : '',
    lastRotationIndex: `${lastRotationIndexSafe.idx}/${lastRotationIndexSafe.total}`,
    nodeInfo: nodeProgress.nodeInfo,
  }
}

export function getNodeSettings() {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  if (!fs.existsSync(path.join(__dirname, `../../${File.NODE_CONFIG}`))) {
    return null
  }

  const settingsData = path.join(__dirname, `../../${File.NODE_CONFIG}`)
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return JSON.parse(fs.readFileSync(settingsData).toString())
}

function validatorLogExists(logName: string) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return fs.existsSync(path.join(__dirname, `../../logs/${logName}`))
}

function fetchFromLog(logName: string) {
  if (!validatorLogExists(logName)) {
    return null
  }
  const logData = path.join(__dirname, `../../logs/${logName}`)
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  return JSON.parse(fs.readFileSync(logData).toString())
}

function convertMsToDHM(ms: number): string {
  if (ms === 0) return '00:00:00'

  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  const remainingMinutes = minutes % 60

  const daysString = days > 0 ? `${days} Days ` : ''
  const hoursString = remainingHours > 0 ? `${remainingHours} Hours ` : ''
  const minutesString = remainingMinutes > 0 ? `${remainingMinutes} Minutes` : ''

  return `${daysString}${hoursString}${minutesString}`
}
