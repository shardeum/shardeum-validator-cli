import * as readline from 'readline';
import { getUserInput } from '../../../src/utils/userInput';

// Mock the readline module
jest.mock('readline', () => ({
  createInterface: jest.fn().mockReturnValue({
    question: jest.fn((question, callback) => callback('mocked answer')),
    close: jest.fn(),
  }),
}));

describe('getUserInput', () => {
  it('should prompt the user and return their input', async () => {
    // Setup
    const promptMessage = 'Enter your name:';
    
    // Execute
    const result = await getUserInput(promptMessage);
    
    // Verify
    expect(readline.createInterface).toHaveBeenCalledWith({
      input: process.stdin,
      output: process.stdout,
    });
    
    const mockInterface = readline.createInterface({} as any);
    expect(mockInterface.question).toHaveBeenCalledWith(
      promptMessage,
      expect.any(Function)
    );
    
    expect(mockInterface.close).toHaveBeenCalled();
    expect(result).toBe('mocked answer');
  });
}); 