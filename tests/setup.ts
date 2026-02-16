/**
 * Vitest global setup — mock localforage for Node/jsdom environment
 * (localforage requires IndexedDB which jsdom does not fully support)
 */
import { vi } from 'vitest'

function createMockInstance() {
  const store = new Map<string, unknown>()
  return {
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value)
      return value
    }),
    removeItem: vi.fn(async (key: string) => {
      store.delete(key)
    }),
    keys: vi.fn(async () => [...store.keys()]),
    clear: vi.fn(async () => {
      store.clear()
    }),
    length: vi.fn(async () => store.size),
    iterate: vi.fn(async (cb: (value: unknown, key: string, n: number) => void) => {
      let i = 0
      for (const [key, value] of store) {
        cb(value, key, i++)
      }
    }),
    config: vi.fn(),
    ready: vi.fn(async () => undefined),
    driver: vi.fn(() => 'mockDriver'),
    setDriver: vi.fn(async () => undefined),
    supports: vi.fn(() => true),
    defineDriver: vi.fn(async () => undefined),
    dropInstance: vi.fn(async () => undefined),
  }
}

vi.mock('localforage', () => {
  const instance = createMockInstance()
  return {
    default: {
      ...instance,
      createInstance: vi.fn(() => createMockInstance()),
      INDEXEDDB: 'asyncStorage',
      WEBSQL: 'webSQLStorage',
      LOCALSTORAGE: 'localStorageWrapper',
    },
  }
})
