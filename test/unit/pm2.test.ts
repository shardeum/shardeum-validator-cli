import { ProcessDescription } from 'pm2';
import { statusFromPM2, Pm2ProcessStatus } from '../../src/pm2';

describe('PM2 Module', () => {
  describe('statusFromPM2', () => {
    it('should convert PM2 process description to Pm2ProcessStatus', () => {
      // Setup
      const now = Date.now();
      const uptime = now - 60000; // 1 minute ago
      
      const mockProcessDescription: Partial<ProcessDescription> = {
        name: 'test-process',
        pm2_env: {
          pm_uptime: uptime,
          restart_time: 5,
          status: 'online',
        },
        monit: {
          cpu: 10.5,
          memory: 1024 * 1024 * 50, // 50MB
        },
      };
      
      // Execute
      const result = statusFromPM2(mockProcessDescription as ProcessDescription);
      
      // Verify
      expect(result).toEqual({
        name: 'test-process',
        uptimeInSeconds: expect.closeTo(60, 1), // Approximately 60 seconds
        restarts: 5,
        status: 'online',
        cpuUsagePercent: 10.5,
        memUsedInBytes: 1024 * 1024 * 50,
      });
    });
    
    it('should handle missing or undefined values', () => {
      // Setup
      const mockProcessDescription: Partial<ProcessDescription> = {
        name: undefined,
        pm2_env: {
          pm_uptime: undefined,
          restart_time: undefined,
          status: undefined,
        },
        monit: {
          cpu: undefined,
          memory: undefined,
        },
      };
      
      // Execute
      const result = statusFromPM2(mockProcessDescription as ProcessDescription);
      
      // Verify
      expect(result).toEqual({
        name: undefined,
        uptimeInSeconds: 0,
        restarts: undefined,
        status: undefined,
        cpuUsagePercent: undefined,
        memUsedInBytes: undefined,
      });
    });
    
    it('should handle completely empty process description', () => {
      // Setup
      const mockProcessDescription: Partial<ProcessDescription> = {};
      
      // Execute
      const result = statusFromPM2(mockProcessDescription as ProcessDescription);
      
      // Verify
      expect(result).toEqual({
        name: undefined,
        uptimeInSeconds: 0,
        restarts: undefined,
        status: undefined,
        cpuUsagePercent: undefined,
        memUsedInBytes: undefined,
      });
    });
  });
}); 