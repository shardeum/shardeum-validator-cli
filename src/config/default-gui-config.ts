export const defaultGuiConfig = {
  gui: {
    port: 8080,
    pass: '',
  },
}

export type guiConfigType = typeof defaultGuiConfig

export const guiConfigSchema = {
  type: 'object',
  properties: {
    gui: {
      type: 'object',
      properties: {
        port: {
          type: 'integer',
          minimum: 1024,
          maximum: 65535,
        },
        pass: {
          type: 'string',
        },
      },
      required: ['port', 'pass'],
      additionalProperties: false,
    },
  },
  required: ['gui'],
  additionalProperties: false,
}
