import { Command } from 'commander'
import * as nodeCommands from '../../../src/node-commands'
import * as guiCommands from '../../../src/gui-commands'
import dotenv from 'dotenv'

// Mock the commander package
jest.mock('commander', () => {
  const mockCommand = {
    name: jest.fn().mockReturnThis(),
    description: jest.fn().mockReturnThis(),
    version: jest.fn().mockReturnThis(),
    parse: jest.fn(),
  }

  return {
    Command: jest.fn().mockImplementation(() => mockCommand),
  }
})

// Mock the command modules
jest.mock('../../../src/node-commands', () => ({
  registerNodeCommands: jest.fn(),
}))

jest.mock('../../../src/gui-commands', () => ({
  registerGuiCommands: jest.fn(),
}))

// Mock dotenv
jest.mock('dotenv', () => ({
  config: jest.fn(),
}))

// Mock path
jest.mock('path', () => ({
  join: jest.fn().mockImplementation((...args) => args.join('/')),
}))

// Mock process.chdir
const originalChdir = process.chdir
beforeAll(() => {
  process.chdir = jest.fn()
})

afterAll(() => {
  process.chdir = originalChdir
})

describe('CLI Entry Point', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    // Mock package.json
    jest.mock(
      '../../../package.json',
      () => ({
        version: '1.2.1',
      }),
      { virtual: true }
    )
  })

  afterEach(() => {
    jest.resetModules()
  })

  it('should initialize the CLI correctly', () => {
    // Import the index file
    jest.isolateModules(() => {
      // This will execute the index.ts code
      require('../../../src/index')
    })

    // Verify dotenv config was called
    expect(dotenv.config).toHaveBeenCalled()

    // Verify process.chdir was called
    expect(process.chdir).toHaveBeenCalled()

    // Verify Command was instantiated
    expect(Command).toHaveBeenCalled()

    const program = new Command()

    // Verify program configuration
    expect(program.name).toHaveBeenCalledWith('operator-cli')
    expect(program.description).toHaveBeenCalledWith('CLI part of the operator dashboard')
    expect(program.version).toHaveBeenCalledWith('1.2.1')

    // Verify command registration
    expect(nodeCommands.registerNodeCommands).toHaveBeenCalledWith(program)
    expect(guiCommands.registerGuiCommands).toHaveBeenCalledWith(program)

    // Verify program.parse was called
    expect(program.parse).toHaveBeenCalled()
  })
})
