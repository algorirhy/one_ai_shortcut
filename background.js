// Background service worker
// Listens for the unified keyboard shortcut command and forwards it to the active tab's content script.

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'new-chat') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'new-chat' });
      }
    } catch (err) {
      console.error('[AI New Chat] Failed to send message to tab:', err);
    }
  }
});
