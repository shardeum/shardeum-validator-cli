import axios, { AxiosError } from 'axios'
import { networkConfigType } from '../config/default-network-config'
import { isIP } from 'net'

/**
 * A simple class for tallying responses and determining consensus
 */
class Tally<T> {
  private winCount: number
  private items: Array<{
    value: T
    count: number
    nodes: Array<{ ip: string; port: number | string }>
  }>

  constructor(winCount: number) {
    this.winCount = winCount
    this.items = []
  }

  /**
   * Add a new item to the tally
   * @param newItem The item to add
   * @param node The node that returned this item
   * @returns The winning item if consensus reached, otherwise null
   */
  add(
    newItem: T,
    node: { ip: string; port: number | string }
  ): { value: T; count: number; nodes: Array<{ ip: string; port: number | string }> } | null {
    if (newItem === null) return null

    // Look for existing items that match
    for (const item of this.items) {
      // Deep equality check for objects or direct comparison for primitives
      const isEqual = this.isDeepEqual(newItem, item.value)

      if (!isEqual) continue

      // If we found a match, increment the counter and add the node
      item.count++
      item.nodes.push(node)

      // Check if we've reached consensus
      if (item.count >= this.winCount) {
        return item
      }

      return null
    }

    // If no match found, add a new item
    const newTallyItem = { value: newItem, count: 1, nodes: [node] }
    this.items.push(newTallyItem)

    // If winCount is 1, return immediately
    if (this.winCount === 1) return newTallyItem

    return null
  }

  /**
   * Get the highest count of any item
   */
  getHighestCount(): number {
    if (!this.items.length) return 0

    let highestCount = 0
    for (const item of this.items) {
      if (item.count > highestCount) {
        highestCount = item.count
      }
    }

    return highestCount
  }

  /**
   * Get the item with the highest count
   */
  getHighestCountItem(): { value: T; count: number; nodes: Array<{ ip: string; port: number | string }> } | null {
    if (!this.items.length) return null

    let highestCount = 0
    let highestItem = null

    for (const item of this.items) {
      if (item.count > highestCount) {
        highestCount = item.count
        highestItem = item
      }
    }

    return highestItem
  }

  /**
   * Deep equality check for objects or direct comparison for primitives
   */
  private isDeepEqual(a: any, b: any): boolean {
    if (a === b) return true

    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
      return false
    }

    const keysA = Object.keys(a)
    const keysB = Object.keys(b)

    if (keysA.length !== keysB.length) return false

    for (const key of keysA) {
      if (!keysB.includes(key)) return false

      const valA = a[key]
      const valB = b[key]

      if (typeof valA === 'object' && typeof valB === 'object') {
        if (!this.isDeepEqual(valA, valB)) return false
      } else if (valA !== valB) {
        return false
      }
    }

    return true
  }
}

/**
 * Sleep for a specified number of milliseconds
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Execute multiple promises and handle errors individually
 */
async function robustPromiseAll<T>(promises: Promise<T>[]): Promise<[T[], Error[]]> {
  const results: T[] = []
  const errors: Error[] = []

  await Promise.all(
    promises.map(async (promise) => {
      try {
        const result = await promise
        results.push(result)
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)))
      }
    })
  )

  return [results, errors]
}

/**
 * Makes a robust query to multiple nodes and ensures consensus on the response
 * @param nodes Array of nodes to query
 * @param queryFn Function that takes a node and returns a promise of the query result
 * @param redundancy Number of matching responses required for consensus
 * @param maxRetries Maximum number of retry attempts
 * @param shuffleNodes Whether to shuffle the nodes before querying
 * @returns The consensus result or best available result
 */
export async function robustQuery<T>(
  nodes: Array<{ ip: string; port: number | string }>,
  queryFn: (node: { ip: string; port: number | string }) => Promise<T>,
  redundancy = 3,
  maxRetries = 3,
  shuffleNodes = true
): Promise<{ value: T; count: number; nodes: Array<{ ip: string; port: number | string }> } | null> {
  if (nodes.length === 0) {
    throw new Error('No nodes provided for robust query')
  }

  // Adjust redundancy if needed
  if (redundancy < 1) redundancy = 1
  if (redundancy > nodes.length) redundancy = nodes.length

  const tally = new Tally<T>(redundancy)
  let errors = 0

  // Shuffle nodes if requested
  const availableNodes = [...nodes]
  if (shuffleNodes) {
    availableNodes.sort(() => 0.5 - Math.random())
  }

  // Query a batch of nodes
  const queryBatch = async (nodeBatch: Array<{ ip: string; port: number | string }>) => {
    const queries = nodeBatch.map((node) => queryFn(node).then((response) => ({ response, node })))

    const [results, errs] = await robustPromiseAll(queries)

    let finalResult = null
    for (const result of results) {
      finalResult = tally.add(result.response, result.node)
      if (finalResult) break
    }

    errors += errs.length

    return finalResult
  }

  // Main query loop
  let finalResult = null
  let retries = 0

  while (!finalResult && retries < maxRetries) {
    retries++

    // Calculate how many more matching responses we need
    const neededResponses = redundancy - tally.getHighestCount()
    if (availableNodes.length < neededResponses) {
      console.error('Robust query: Not enough nodes available to reach consensus')
      break
    }

    // Take the next batch of nodes to query
    const nodeBatch = availableNodes.splice(0, neededResponses)
    finalResult = await queryBatch(nodeBatch)

    // Add small delay between batches
    if (!finalResult && retries < maxRetries) {
      await sleep(500)
    }
  }

  if (finalResult) {
    return finalResult
  } else {
    console.error(`Robust query: Could not get ${redundancy} matching responses. Encountered ${errors} errors.`)
    return tally.getHighestCountItem()
  }
}

/**
 * Get active nodes from multiple archivers and use robust querying
 * @param config Network configuration
 * @returns Array of active nodes
 */
export async function fetchActiveNodes(
  config: networkConfigType
): Promise<Array<{ ip: string; port: number | string; id?: string; publicKey?: string }>> {
  // Filter out archivers with invalid IPs
  const validArchivers = config.server.p2p.existingArchivers.filter((archiver) => isIP(archiver.ip))

  if (validArchivers.length === 0) {
    throw new Error('No valid archivers available')
  }

  // Create query function for fetching active nodes
  const queryFn = async (archiver: { ip: string; port: number | string }) => {
    try {
      const response = await axios.get(`http://${archiver.ip}:${archiver.port}/nodelist?activeOnly=true`, {
        timeout: 2000,
      })
      if (response.data?.nodeList && Array.isArray(response.data.nodeList)) {
        return response.data.nodeList
      }
      return []
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error))
    }
  }

  // Use our robust query
  const redundancy = Math.min(validArchivers.length, 2) // At least 2 archivers should agree, or all if less than 2
  try {
    const result = await robustQuery(validArchivers, queryFn, redundancy)

    if (result && Array.isArray(result.value)) {
      return result.value
    }

    // Fallback to direct query if robust query fails
    for (const archiver of validArchivers) {
      try {
        const nodes = await queryFn(archiver)
        if (nodes.length > 0) {
          return nodes
        }
      } catch (error) {
        continue
      }
    }
  } catch (error) {
    console.error(`Error in fetchActiveNodes: ${error}`)
  }

  return []
}

/**
 * Make a robust API call to multiple nodes
 * @param config Network configuration
 * @param endpoint API endpoint to call
 * @param queryParams Query parameters
 * @returns API response with consensus
 */
export async function robustApiCall<T>(
  config: networkConfigType,
  endpoint: string,
  queryParams = ''
): Promise<T | null> {
  try {
    // Get active nodes
    const activeNodes = await fetchActiveNodes(config)

    if (activeNodes.length === 0) {
      throw new Error('No active nodes available')
    }

    // Create query function
    const queryFn = async (node: { ip: string; port: number | string }) => {
      try {
        const url = `http://${node.ip}:${node.port}${endpoint}${queryParams ? queryParams : ''}`
        const response = await axios.get(url, { timeout: 3000 })
        return response.data
      } catch (error) {
        if (error instanceof AxiosError && error.response) {
          // If the API returns a valid response with an error status code, we still return the data
          // This is important for APIs that return error information in the response body
          return error.response.data
        }
        throw error
      }
    }

    // Calculate required redundancy (minimum 2 nodes or half of available nodes)
    const redundancy = Math.min(Math.max(2, Math.floor(activeNodes.length / 2)), activeNodes.length)

    // Perform robust query
    const result = await robustQuery(activeNodes, queryFn, redundancy)

    if (result) {
      return result.value as T
    }

    // If robust query fails, try each node individually
    for (const node of activeNodes) {
      try {
        const data = await queryFn(node)
        return data as T
      } catch (error) {
        continue
      }
    }
  } catch (error) {
    console.error(`Error in robustApiCall for ${endpoint}: ${error}`)
  }

  return null
}
