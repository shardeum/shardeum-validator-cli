export const defaultNetworkConfig = {
  server: {
    baseDir: '.',
    p2p: {
      existingArchivers: [
        {
          ip: '198.58.110.213',
          port: 4000,
          publicKey: 'd34b80a5a6f9638b7c75d6eb6e59d35d9a3e103f1877827eebbe973b8281f794',
        },
        {
          ip: '3.73.66.238',
          port: 4000,
          publicKey: '7af699dd711074eb96a8d1103e32b589e511613ebb0c6a789a9e8791b2b05f34',
        },
        {
          ip: '35.233.225.113',
          port: 4000,
          publicKey: '59c3794461c7f58a0a7f24d70dfd512d4364cd179d2670ac58e9ae533d50c7eb',
        },
      ],
    },
    ip: {
      externalIp: '127.0.0.1',
      externalPort: 9001,
      internalIp: '127.0.0.1',
      internalPort: 10001,
    },
    reporting: {
      report: true,
      recipient: 'http://localhost:3000/api',
      interval: 2,
      console: false,
    },
  },
}

export type networkConfigType = typeof defaultNetworkConfig

export const networkConfigSchema = {
  type: 'object',
  properties: {
    server: {
      type: 'object',
      properties: {
        baseDir: {
          type: 'string',
        },
        p2p: {
          type: 'object',
          properties: {
            existingArchivers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  ip: {
                    type: 'string',
                  },
                  port: {
                    type: 'integer',
                    minimum: 1024,
                    maximum: 65535,
                  },
                  publicKey: {
                    type: 'string',
                  },
                },
                required: ['ip', 'port', 'publicKey'],
              },
            },
          },
          required: ['existingArchivers'],
        },
        ip: {
          type: 'object',
          properties: {
            externalIp: {
              type: 'string',
            },
            externalPort: {
              type: 'integer',
              minimum: 1024,
              maximum: 65535,
            },
            internalIp: {
              type: 'string',
            },
            internalPort: {
              type: 'integer',
              minimum: 1024,
              maximum: 65535,
            },
          },
          required: ['externalIp', 'externalPort', 'internalIp', 'internalPort'],
        },
        reporting: {
          type: 'object',
          properties: {
            report: {
              type: 'boolean',
            },
            recipient: {
              type: 'string',
            },
            interval: {
              type: 'integer',
              minimum: 1,
            },
            console: {
              type: 'boolean',
            },
          },
          required: ['report', 'recipient', 'interval', 'console'],
        },
      },
      required: ['baseDir', 'p2p', 'ip', 'reporting'],
    },
  },
  required: ['server'],
}

export type nodeProgressType = {
  nodeInfo: {
    id: string
    publicKey: string
    curvePublicKay: string
    externalIP: string
    internalIP: string
    externalPort: number
    internalPort: number
    status: string
  }
  lastRotationIndex: {
    idx: number
    total: number
  }
  activeNodes: number
  lastActiveTime: number
  totalActiveTime: number
}
