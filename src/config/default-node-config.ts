export const defaultNodeConfig = {
  autoRestart: true,
  lastStopped: undefined,
}

export type nodeConfigType = {
  autoRestart: boolean
  lastStopped?: number
}

export const nodeConfigSchema = {
  type: 'object',
  properties: {
    autoRestart: {
      type: 'boolean',
    },
    lastStopped: {
      type: 'number',
    },
  },
  required: ['autoRestart'],
}
