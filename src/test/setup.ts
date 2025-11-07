/**
 * Test setup - runs before all tests
 */

// Mock indexedDB if not available in test environment
import 'fake-indexeddb/auto';
import { TextEncoder, TextDecoder } from 'util';

// Set up global test utilities
global.structuredClone = global.structuredClone || ((obj: any) => JSON.parse(JSON.stringify(obj)));

// Polyfill TextEncoder/TextDecoder for Node environment
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder as any;
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder as any;
}
