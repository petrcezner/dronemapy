/**
 * Content scripts keep running after the extension itself is reloaded/updated,
 * at which point `chrome.runtime` becomes an orphaned reference and any
 * `sendMessage` call throws "Extension context invalidated." synchronously.
 * This wraps that call so callers get `undefined` instead of an uncaught error.
 */
export function isExtensionContextValid(): boolean {
  try {
    return typeof chrome !== "undefined" && !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

export function sendRuntimeMessage<TResponse = unknown>(
  message: unknown
): Promise<TResponse | undefined> {
  return new Promise((resolve) => {
    if (!isExtensionContextValid()) {
      resolve(undefined);
      return;
    }
    try {
      chrome.runtime.sendMessage(message, (response: TResponse) => {
        if (chrome.runtime.lastError) {
          resolve(undefined);
          return;
        }
        resolve(response);
      });
    } catch {
      resolve(undefined);
    }
  });
}
