import winston from 'winston';
import logger from '../../../src/utils/logger';
import path from 'path';

// Mock winston
jest.mock('winston', () => {
  const mockFormat = {
    json: jest.fn().mockReturnValue('json-format'),
  };
  
  const mockTransport = jest.fn();
  
  const mockLogger = {
    level: '',
    format: '',
    defaultMeta: {},
    transports: [],
  };
  
  return {
    format: mockFormat,
    createLogger: jest.fn().mockImplementation(config => {
      mockLogger.level = config.level;
      mockLogger.format = config.format;
      mockLogger.defaultMeta = config.defaultMeta;
      mockLogger.transports = config.transports || [];
      return mockLogger;
    }),
    transports: {
      File: mockTransport.mockReturnValue({ filename: 'mocked-file' }),
    },
  };
});

// Mock path
jest.mock('path', () => ({
  join: jest.fn().mockImplementation((...args) => args.join('/')),
}));

describe('logger', () => {
  it('should be configured correctly', () => {
    // Verify logger configuration
    expect(winston.createLogger).toHaveBeenCalledWith({
      level: 'info',
      format: 'json-format',
      defaultMeta: { service: 'node' },
      transports: expect.any(Array),
    });
    
    // Verify winston format
    expect(winston.format.json).toHaveBeenCalled();
    
    // Verify File transports were created
    expect(winston.transports.File).toHaveBeenCalledTimes(2);
    
    // Verify File transports were created with correct paths
    expect(winston.transports.File).toHaveBeenCalledWith({
      filename: expect.stringContaining('logs/error.log'),
      level: 'error',
    });
    
    expect(winston.transports.File).toHaveBeenCalledWith({
      filename: expect.stringContaining('logs/combined.log'),
    });
  });
  
  it('should export a winston logger instance', () => {
    expect(logger).toBeDefined();
  });
}); 