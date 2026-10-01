/* global localStorage */
/**
 * Setup for the happy-dom project.
 *
 * Recent Node versions expose their own `localStorage` global (which throws
 * or is undefined unless --localstorage-file is given) and it shadows the
 * happy-dom one, so install a small in-memory Storage for the tests that
 * exercise the token persistence of the admin client.
 */
import { beforeEach } from 'vitest';

class MemoryStorage {
  #items = new Map();

  get length() {
    return this.#items.size;
  }

  key(index) {
    return [...this.#items.keys()][index] ?? null;
  }

  getItem(key) {
    return this.#items.has(String(key)) ? this.#items.get(String(key)) : null;
  }

  setItem(key, value) {
    this.#items.set(String(key), String(value));
  }

  removeItem(key) {
    this.#items.delete(String(key));
  }

  clear() {
    this.#items.clear();
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  configurable: true,
  writable: true
});

beforeEach(() => {
  localStorage.clear();
});
