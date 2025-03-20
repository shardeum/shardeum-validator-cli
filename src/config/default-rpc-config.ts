const exampleRpcConfig = {
  url: 'http://localhost:8545',
}

export type rpcConfigType = typeof exampleRpcConfig

export const rpcConfigSchema = {
  type: 'object',
  properties: {
    url: {
      type: 'string',
    },
  },
  required: ['url'],
}
