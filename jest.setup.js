// Jest setup file for Node.js testing environment

// Define React Native globals
global.__DEV__ = true;

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock timers for consistent testing
jest.useFakeTimers();

// Global test utilities and mocks
global.mockDate = (date) => {
  const mockDate = new Date(date);
  jest.spyOn(global, 'Date').mockImplementation(() => mockDate);
  Date.now = jest.fn(() => mockDate.getTime());
  return mockDate;
};

global.restoreDate = () => {
  global.Date.mockRestore();
  Date.now.mockRestore();
};

// Mock fetch for network requests
global.fetch = jest.fn();

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;

// Mock setTimeout and setInterval for testing
global.setTimeout = jest.fn((fn, delay) => {
  return jest.requireActual('timers').setTimeout(fn, delay);
});

global.setInterval = jest.fn((fn, delay) => {
  return jest.requireActual('timers').setInterval(fn, delay);
});

global.clearTimeout = jest.fn((id) => {
  return jest.requireActual('timers').clearTimeout(id);
});

global.clearInterval = jest.fn((id) => {
  return jest.requireActual('timers').clearInterval(id);
});

// Mock crypto for security functions
global.crypto = {
  getRandomValues: jest.fn((arr) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
    return arr;
  }),
  randomUUID: jest.fn(() => 'mock-uuid-' + Math.random().toString(36).substr(2, 9)),
};

// Mock performance for timing measurements
global.performance = {
  now: jest.fn(() => Date.now()),
  mark: jest.fn(),
  measure: jest.fn(),
  getEntriesByName: jest.fn(() => []),
  getEntriesByType: jest.fn(() => []),
};

// Setup test environment
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
  
  // Reset console mocks
  console.log.mockClear();
  console.debug.mockClear();
  console.info.mockClear();
  console.warn.mockClear();
  console.error.mockClear();
  
  // Reset fetch mock
  fetch.mockClear();
  
  // Reset localStorage mock
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
  localStorageMock.clear.mockClear();
});

afterEach(() => {
  // Clean up after each test
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.useFakeTimers();
});