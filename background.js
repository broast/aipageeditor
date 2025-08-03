chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({});
});

class Cache {
  constructor(storageArea = 'session') {
    this.storage = chrome.storage[storageArea];
    this.prefix = 'contentGenCache_';
  }

  async get(key) {
    const storageKey = this.prefix + key;
    const result = await this.storage.get(storageKey);
    return result[storageKey];
  }

  async set(key, value) {
    const storageKey = this.prefix + key;
    await this.storage.set({ [storageKey]: value });
  }

  async has(key) {
    const storageKey = this.prefix + key;
    const result = await this.storage.get(storageKey);
    return storageKey in result;
  }

  async clear() {
    const allItems = await this.storage.get(null);
    const keysToRemove = Object.keys(allItems).filter(key => key.startsWith(this.prefix));
    if (keysToRemove.length > 0) {
      await this.storage.remove(keysToRemove);
    }
  }
}

const contentGenCache = new Cache('session');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'cache') {
    (async () => {
      try {
        switch (message.action) {
          case 'get':
            const value = await contentGenCache.get(message.key);
            sendResponse({ success: true, value });
            break;
          case 'set':
            await contentGenCache.set(message.key, message.value);
            sendResponse({ success: true });
            break;
          case 'has':
            const hasValue = await contentGenCache.has(message.key);
            sendResponse({ success: true, value: hasValue });
            break;
          case 'clear':
            await contentGenCache.clear();
            sendResponse({ success: true });
            break;
          default:
            sendResponse({ success: false, error: 'Unknown cache action' });
        }
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Indicates that the response is sent asynchronously
  }
});