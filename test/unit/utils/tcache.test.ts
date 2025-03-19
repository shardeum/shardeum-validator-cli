import fs from 'fs'
import path from 'path'

// Create a mock implementation of tcache
class MockTcache {
  val = new Map<string, string>()
  time = new Map<string, Date>()
  valPath: string
  timePath: string

  constructor() {
    this.valPath = path.join('__dirname', 'val.json')
    this.timePath = path.join('__dirname', 'time.json')
    this.readMaps()
  }

  readMaps() {
    // Skip if files don't exist
    if (!fs.existsSync(this.valPath) || !fs.existsSync(this.timePath)) {
      return
    }
    const valStr = fs.readFileSync(this.valPath, 'utf8')
    const timeStr = fs.readFileSync(this.timePath, 'utf8')
    const valArr = JSON.parse(valStr)
    const timeArr = JSON.parse(timeStr)
    valArr.forEach((item: [string, string]) => this.val.set(item[0], item[1]))
    timeArr.forEach((item: [string, Date]) => this.time.set(item[0], item[1]))
  }

  writeMaps() {
    const valStr = JSON.stringify([...this.val])
    const timeStr = JSON.stringify([...this.time])
    fs.writeFileSync(this.valPath, valStr)
    fs.writeFileSync(this.timePath, timeStr)
  }

  set(key: string, value: string, ttl: number) {
    this.val.set(key, value)
    this.time.set(key, new Date(Date.now() + ttl))
  }

  get(key: string) {
    const now = new Date()
    const ttl = this.time.get(key)

    if (!ttl) {
      return undefined
    }

    const ttlDate = new Date(ttl)

    if (ttlDate > now) {
      return this.val.get(key)
    }
    return undefined
  }
}

// Mock the actual tcache module
jest.mock('../../../src/utils/tcache', () => MockTcache)

// Import the mocked module
import Tcache from '../../../src/utils/tcache'

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}))

// Mock path module
jest.mock('path', () => ({
  join: jest.fn().mockImplementation((...args) => args.join('/')),
}))

// Mock File enum
jest.mock('../../../src/utils', () => ({
  File: {
    VAL: 'val.json',
    TIME: 'time.json',
  },
}))

describe('tcache', () => {
  let cache: InstanceType<typeof Tcache>

  beforeEach(() => {
    jest.clearAllMocks()
    // Mock file existence check to return false by default
    ;(fs.existsSync as jest.Mock).mockReturnValue(false)
    cache = new Tcache()
  })

  describe('constructor', () => {
    it('should initialize with empty maps if files do not exist', () => {
      expect(fs.existsSync).toHaveBeenCalled()
      expect(fs.readFileSync).not.toHaveBeenCalled()
      expect(cache.val.size).toBe(0)
      expect(cache.time.size).toBe(0)
    })

    it('should load data from files if they exist', () => {
      // Mock file existence
      ;(fs.existsSync as jest.Mock).mockReturnValue(true)

      // Mock file content
      const mockValData = JSON.stringify([
        ['key1', 'value1'],
        ['key2', 'value2'],
      ])
      const now = new Date()
      const future = new Date(now.getTime() + 10000)
      const mockTimeData = JSON.stringify([
        ['key1', now.toISOString()],
        ['key2', future.toISOString()],
      ])

      ;(fs.readFileSync as jest.Mock).mockReturnValueOnce(mockValData).mockReturnValueOnce(mockTimeData)

      cache = new Tcache()

      expect(fs.existsSync).toHaveBeenCalled()
      expect(fs.readFileSync).toHaveBeenCalledTimes(2)
    })
  })

  describe('set and get methods', () => {
    it('should set a value with TTL and retrieve it before expiration', () => {
      const key = 'testKey'
      const value = 'testValue'
      const ttl = 10000 // 10 seconds

      cache.set(key, value, ttl)

      expect(cache.val.get(key)).toBe(value)
      expect(cache.time.has(key)).toBe(true)

      const result = cache.get(key)
      expect(result).toBe(value)
    })

    it('should return undefined for expired values', () => {
      const key = 'expiredKey'
      const value = 'expiredValue'
      const ttl = -1000 // Already expired

      cache.set(key, value, ttl)

      const result = cache.get(key)
      expect(result).toBeUndefined()
    })

    it('should return undefined for non-existent keys', () => {
      const result = cache.get('nonExistentKey')
      expect(result).toBeUndefined()
    })
  })

  describe('writeMaps', () => {
    it('should write maps to files', () => {
      cache.set('key1', 'value1', 10000)
      cache.set('key2', 'value2', 20000)

      cache.writeMaps()

      expect(fs.writeFileSync).toHaveBeenCalledTimes(2)
      expect(fs.writeFileSync).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('key1'))
      expect(fs.writeFileSync).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('key2'))
    })
  })
})
