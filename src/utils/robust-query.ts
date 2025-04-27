import axios, { AxiosError } from 'axios'
import { networkConfigType } from '../config/default-network-config'
import { isIP } from 'net'

/**
 * Simple sleep utility
 */
export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A class for tallying responses and determining consensus
 */
class Tally<T> {
  private winCount: number
  private equalFn: (a: T, b: T) => boolean
  private items: Array<{
    value: T
    count: number
    nodes: Array<{ ip: string; port: number | string }>
  }>

  constructor(winCount: number, equalFn: (a: T, b: T) => boolean) {
    this.winCount = winCount
    this.equalFn = equalFn
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
      // If the value of the new item is not equal to the current item, we continue searching
      if (!this.equalFn(newItem, item.value)) continue

      // If the new item is equal to the current item in the list,
      // we increment the current item's counter and add the current node to the list
      item.count++
      item.nodes.push(node)

      // Check if we've reached consensus
      if (item.count >= this.winCount) {
        return item
      }

      // No winner yet
      return null
    }

    // If we made it through the entire items list without finding a match,
    // We create a new item and set the count to 1
    const newTallyItem = { value: newItem, count: 1, nodes: [node] }
    this.items.push(newTallyItem)

    // If the winCount is 1, return the item we just created
    if (this.winCount === 1) return newTallyItem
    else return null
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
    let highestIndex = 0
    let i = 0
    for (const item of this.items) {
      if (item.count > highestCount) {
        highestCount = item.count
        highestIndex = i
      }
      i += 1
    }
    return this.items[highestIndex]
  }
}

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
 * Function to retry an operation with backoff
 */
export async function attempt<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries: number
    logPrefix: string
  }
): Promise<T> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      console.error(
        `${options.logPrefix}: attempt ${attempt + 1}/${options.maxRetries + 1} failed: ${lastError.message}`
      )

      if (attempt < options.maxRetries) {
        // Exponential backoff with jitter
        const delay = Math.min(100 * Math.pow(2, attempt), 1000) + Math.random() * 100
        await sleep(delay)
      }
    }
  }

  throw lastError || new Error(`${options.logPrefix}: all attempts failed`)
}

/**
 * Makes a robust query to multiple nodes and ensures consensus on the response
 * @param nodes Array of nodes to query
 * @param queryFn Function that takes a node and returns a promise of the query result
 * @param redundancy Number of matching responses required for consensus
 * @param equalityFn Function to compare responses (defaults to deep equality)
 * @returns The consensus result or best available result
 */
export async function robustQuery<T>(
  nodes: Array<{ ip: string; port: number | string }>,
  queryFn: (node: { ip: string; port: number | string }) => Promise<T>,
  redundancy = 3,
  equalityFn = (a: T, b: T): boolean => {
    try {
      return JSON.stringify(a) === JSON.stringify(b)
    } catch (e) {
      return a === b
    }
  },
  shuffleNodes = true,
  delayTimeInMS = 0
): Promise<{ value: T; count: number; nodes: Array<{ ip: string; port: number | string }> } | null> {
  if (nodes.length === 0) {
    throw new Error('No nodes provided for robust query')
  }

  // Adjust redundancy if needed
  if (redundancy < 1) redundancy = 3
  if (redundancy > nodes.length) redundancy = nodes.length

  const responses = new Tally<T>(redundancy, equalityFn)
  let errors = 0

  // Shuffle nodes if requested
  const availableNodes = [...nodes]
  if (shuffleNodes) {
    availableNodes.sort(() => 0.5 - Math.random())
  }

  const queryNodes = async (
    nodeBatch: Array<{ ip: string; port: number | string }>
  ): Promise<{ value: T; count: number; nodes: Array<{ ip: string; port: number | string }> } | null> => {
    // Wrap the query so that we know which node it's coming from
    const wrappedQuery = async (node: { ip: string; port: number | string }) => {
      const response = await queryFn(node)
      return { response, node }
    }

    // Create a promise for each node in the batch
    const queries = nodeBatch.map((node) => wrappedQuery(node))
    const [results, errs] = await robustPromiseAll(queries)

    let finalResult = null
    for (const result of results) {
      finalResult = responses.add(result.response, result.node)
      if (finalResult) break
    }

    errors += errs.length
    return finalResult
  }

  let finalResult = null
  let tries = 0
  while (!finalResult) {
    tries += 1
    const toQuery = redundancy - responses.getHighestCount()
    if (availableNodes.length < toQuery) {
      console.error('Robust query: stopping since we ran out of nodes to query.')
      break
    }

    if (delayTimeInMS > 0 && Math.ceil(nodes.length / 2) >= availableNodes.length) {
      await sleep(delayTimeInMS)
    }

    const nodesToQuery = availableNodes.splice(0, toQuery)
    finalResult = await queryNodes(nodesToQuery)

    if (tries >= 20) {
      console.error('Robust query: stopping after 20 tries.')
      break
    }
  }

  if (finalResult) {
    return finalResult
  } else {
    console.error(
      `Robust query: Could not get ${redundancy} redundant responses from ${nodes.length} nodes. Encountered ${errors} query errors.`
    )
    return responses.getHighestCountItem()
  }
}

/**
 * Get active nodes from multiple archivers
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

  // Try to fetch nodes from each archiver
  for (const archiver of validArchivers) {
    try {
      const response = await axios.get(`http://${archiver.ip}:${archiver.port}/nodelist?activeOnly=true`, {
        timeout: 2000,
      })

      if (response.data?.nodeList && Array.isArray(response.data.nodeList) && response.data.nodeList.length > 0) {
        return response.data.nodeList
      }
    } catch (error) {
      // Continue to the next archiver if this one fails
      console.error(`Failed to fetch nodes from archiver ${archiver.ip}:${archiver.port}`)
    }
  }

  // If we couldn't get a list from any archiver
  console.error('Could not fetch active nodes from any archiver')
  return []
}

/**
 * Makes a robust query call to multiple nodes for a specific endpoint
 * @param nodes Array of nodes to query
 * @param endpointName API endpoint to call
 * @param queryParams Optional query parameters
 * @returns Object containing the consensus result and winning nodes
 */
export async function makeRobustQueryCall<T>(
  nodes: Array<{ ip: string; port: number | string }>,
  endpointName: string,
  queryParams: Record<string, string> = {}
): Promise<{ winningNodes: Array<{ ip: string; port: number | string }>; value: T }> {
  if (nodes.length === 0) {
    throw new Error('No nodes provided for robust query')
  }

  // Create the query function that will be passed to robustQuery
  const queryFn = async (node: { ip: string; port: number | string }): Promise<T> => {
    try {
      // Build query string
      const queryStr = Object.entries(queryParams)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&')

      const queryPart = queryStr ? `?${queryStr}` : ''
      const url = `http://${node.ip}:${node.port}${endpointName}${queryPart}`

      const response = await axios.get(url, { timeout: 3000 })
      return response.data
    } catch (error) {
      if (error instanceof AxiosError && error.response) {
        // If the API returns a valid response with an error status code, we still return the data
        return error.response.data as T
      }
      throw error
    }
  }

  const logPrefix = `robust-query-${endpointName}`

  try {
    const redundancy = Math.min(Math.max(2, Math.floor(nodes.length / 2)), nodes.length)

    const robustResult = await attempt(() => robustQuery(nodes, queryFn, redundancy), { maxRetries: 3, logPrefix })

    if (!robustResult || robustResult.count < Math.min(redundancy, nodes.length)) {
      throw new Error(
        `Result of ${endpointName} wasn't robust enough (count: ${robustResult?.count}, needed: ${Math.min(
          redundancy,
          nodes.length
        )})`
      )
    }

    return {
      winningNodes: robustResult.nodes,
      value: robustResult.value,
    }
  } catch (error) {
    throw new Error(
      `Robust query failed for ${endpointName}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
