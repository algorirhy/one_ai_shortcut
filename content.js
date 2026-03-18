// Content script — runs on supported AI assistant pages.
// When receiving the "new-chat" message from the background worker,
// it triggers a new chat using site-specific strategies.

(() => {
  'use strict';

  const LOG_PREFIX = '[One Shortcut for AI Chat]';
  const IS_MAC = navigator.platform.toUpperCase().includes('MAC');

  // ─── Site Definitions ───────────────────────────────────────────────
  // Each entry defines how to trigger "New Chat" on a specific site.
  //
  // Strategy (executed in order, stops at first success):
  //   1. `selectors`  — try clicking a matching DOM element
  //   2. `textMatch`  — find a clickable element by visible text
  //   3. `url`/`urlFn`— navigate to the "new chat" URL (always works)

  const SITES = [
    {
      name: 'Kimi',
      match: (host) => host.includes('kimi.com'),
      selectors: [
        'a[href*="chat_enter_method=new_chat"]',
        '[data-testid="new-chat"]',
      ],
      textMatch: ['新建会话'],
      url: 'https://www.kimi.com/',
    },
    {
      name: 'Doubao',
      match: (host) => host.includes('doubao.com'),
      selectors: [
        '[data-testid="new-chat"]',
        'a[href="/chat/new"]',
        'a[href="/chat"]',
      ],
      textMatch: ['新对话', '新建对话'],
      url: 'https://www.doubao.com/chat/',
    },
    {
      name: 'ChatGPT',
      match: (host) => host.includes('chatgpt.com'),
      selectors: [
        'a[data-testid="create-new-chat-button"]',
        'button[data-testid="create-new-chat-button"]',
      ],
      textMatch: ['New chat', 'New Chat'],
      url: 'https://chatgpt.com/',
    },
    {
      name: 'Grok',
      match: (host) => host.includes('grok.com'),
      selectors: [
        'a[aria-label*="New chat"]',
        'a[aria-label*="new chat"]',
        'button[aria-label*="New chat"]',
      ],
      textMatch: ['New chat'],
      url: 'https://grok.com/',
    },
    {
      name: 'Claude',
      match: (host) => host.includes('claude.ai'),
      selectors: [
        'a[href="/new"]',
        'a[data-testid="new-chat"]',
        'button[aria-label*="New chat"]',
        'a[aria-label*="New chat"]',
      ],
      textMatch: ['New chat', 'Start new chat'],
      url: 'https://claude.ai/new',
    },
    {
      name: 'Gemini',
      match: (host) => host.includes('gemini.google.com'),
      selectors: [
        'button[aria-label*="New chat"]',
        'a[aria-label*="New chat"]',
        'button[data-test-id="new-chat"]',
      ],
      textMatch: ['New chat'],
      url: null,
      urlFn: () => {
        const m = window.location.pathname.match(/\/u\/\d+/);
        return m
          ? `https://gemini.google.com${m[0]}/app`
          : 'https://gemini.google.com/app';
      },
    },
    {
      name: 'DeepSeek',
      match: (host) => host.includes('deepseek.com'),
      selectors: [
        'div[class*="new-chat"]',
        'a[class*="new-chat"]',
        'button[class*="new-chat"]',
      ],
      textMatch: ['New chat', '新建对话', '新对话'],
      url: 'https://chat.deepseek.com/',
    },
  ];

  // ─── Helpers ────────────────────────────────────────────────────────

  /**
   * Try to click the first element matching any of the given CSS selectors.
   * Only clicks elements that are visible (has an offsetParent or is the body).
   */
  function tryClickSelectors(selectors) {
    for (const sel of selectors) {
      try {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          if (isVisible(el)) {
            el.click();
            console.log(`${LOG_PREFIX} Clicked selector: ${sel}`);
            return true;
          }
        }
      } catch (e) {
        // Invalid selector, skip
      }
    }
    return false;
  }

  /**
   * Try to find and click a visible element whose text content matches.
   * Only searches common interactive element types.
   */
  function tryClickByText(texts) {
    // Search through interactive elements
    const tags = ['a', 'button', 'div[role="button"]', 'span[role="button"]'];
    for (const tag of tags) {
      const els = document.querySelectorAll(tag);
      for (const el of els) {
        const elText = (el.textContent || '').trim();
        for (const text of texts) {
          if (elText === text && isVisible(el)) {
            el.click();
            console.log(`${LOG_PREFIX} Clicked element with text: "${text}"`);
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Check if an element is visible in the viewport.
   */
  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      el.offsetWidth > 0 &&
      el.offsetHeight > 0
    );
  }

  function isPrimaryModifierPressed(event) {
    return IS_MAC ? event.metaKey : event.ctrlKey;
  }

  function matchesShortcut(event, key, { shiftKey = false } = {}) {
    return (
      isPrimaryModifierPressed(event) &&
      event.key.toLowerCase() === key &&
      event.shiftKey === shiftKey &&
      !event.altKey &&
      !event.repeat
    );
  }

  /**
   * Navigate to the new-chat URL.
   */
  function navigateToNewChat(site) {
    const url = site.urlFn ? site.urlFn() : site.url;
    if (url) {
      window.location.href = url;
      console.log(`${LOG_PREFIX} Navigated to: ${url}`);
    }
  }

  /**
   * Try to open Gemini's "Search chats" panel.
   * We prefer clicking the real UI entry, then fall back to dispatching
   * Gemini's built-in Shift+Cmd/Ctrl+K shortcut.
   */
  function openGeminiSearchChats() {
    const searchSelectors = [
      'button[aria-label*="Search"]',
      'button[aria-label*="search"]',
      'a[aria-label*="Search"]',
      'a[aria-label*="search"]',
      '[data-test-id="search"]',
    ];

    if (tryClickSelectors(searchSelectors)) {
      return true;
    }

    if (tryClickByText(['Search chats', 'Search'])) {
      return true;
    }

    const modifierKey = IS_MAC ? 'Meta' : 'Control';
    const eventInit = {
      key: 'K',
      code: 'KeyK',
      bubbles: true,
      cancelable: true,
      composed: true,
      shiftKey: true,
      metaKey: IS_MAC,
      ctrlKey: !IS_MAC,
    };

    document.dispatchEvent(new KeyboardEvent('keydown', eventInit));
    document.dispatchEvent(new KeyboardEvent('keyup', eventInit));
    console.log(`${LOG_PREFIX} Fallback dispatched ${modifierKey}+Shift+K for Gemini search`);
    return true;
  }

  /**
   * Normalize the new-chat shortcut to Cmd/Ctrl+Shift+O at page level.
   * This avoids browser-level shortcut conflicts preventing the extension
   * command from reaching supported sites consistently.
   */
  function handleNewChatShortcut(event) {
    if (!matchesShortcut(event, 'o', { shiftKey: true })) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handleNewChat();
  }

  /**
   * Normalize Gemini's search shortcut from Shift+Cmd/Ctrl+K to Cmd/Ctrl+K.
   */
  function handleGeminiSearchShortcut(event) {
    if (!window.location.hostname.includes('gemini.google.com')) {
      return;
    }

    if (!matchesShortcut(event, 'k')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    openGeminiSearchChats();
  }

  // ─── Main Handler ──────────────────────────────────────────────────

  function handleNewChat() {
    const host = window.location.hostname;
    const site = SITES.find((s) => s.match(host));

    if (!site) {
      console.warn(`${LOG_PREFIX} Current site is not supported.`);
      return;
    }

    console.log(`${LOG_PREFIX} Detected site: ${site.name}`);

    // Strategy 1: Try clicking via CSS selector
    if (site.selectors && tryClickSelectors(site.selectors)) {
      return;
    }
    console.log(`${LOG_PREFIX} Selectors did not match, trying text match...`);

    // Strategy 2: Try clicking by visible text content
    if (site.textMatch && tryClickByText(site.textMatch)) {
      return;
    }
    console.log(`${LOG_PREFIX} Text match did not work, navigating to URL...`);

    // Strategy 3: Navigate directly (always works)
    navigateToNewChat(site);
  }

  // ─── Message Listener ──────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'new-chat') {
      handleNewChat();
      sendResponse({ ok: true });
    }
  });

  document.addEventListener('keydown', handleNewChatShortcut, true);
  document.addEventListener('keydown', handleGeminiSearchShortcut, true);
})();
