const SCRIBE_TITLE_CLASS = "m-0 mb-3 line-clamp-2 text-sm font-semibold leading-5 text-slate-900 3xl:text-base";

chrome.runtime.onInstalled.addListener(() => {
  chrome.runtime.setUninstallURL('http://localhost:3000/uninstall.html');
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.tabs.create({
      url: 'onboarding.html'
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    return;
  }

  switch (message.type) {
    case 'popupReady':
      handlePopupReady(sendResponse);
      return true;
    case 'translateScribe':
      handleTranslateRequest(message.payload, sendResponse);
      return true;
    default:
      break;
  }
});

async function handlePopupReady(sendResponse) {
  try {
    const tab = await getActiveScribeTab();
    if (!tab) {
      sendResponse({ ok: false, error: 'No active Scribe tab detected.' });
      return;
    }

    const [titles, language] = await Promise.all([
      gatherScribeTitles(tab.id),
      detectTabLanguage(tab.id)
    ]);

    if (titles.length > 0) {
      await safeSendMessage(tab.id, { from: 'service-worker', type: 'scribeTitles', titles });
    }

    if (language) {
      await safeSendMessage(tab.id, { from: 'service-worker', type: 'languageDetected', language });
    }

    sendResponse({ ok: true, titles, language });
  } catch (error) {
    console.error('Failed to initialise popup', error);
    sendResponse({ ok: false, error: error.message || String(error) });
  }
}

async function handleTranslateRequest(payload, sendResponse) {
  try {
    const {
      originalTitle,
      targetLanguageCode,
      targetLanguageName,
      sourceLanguage,
      apiKey
    } = payload || {};

    if (!apiKey) {
      sendResponse({ ok: false, error: 'An OpenAI API key is required.' });
      return;
    }

    const tab = await getActiveScribeTab();
    if (!tab) {
      sendResponse({ ok: false, error: 'No active Scribe tab detected.' });
      return;
    }

    const extraction = await gatherScribeContent(tab.id, originalTitle);
    if (!extraction || extraction.error) {
      const errorMessage = extraction?.error || 'Unable to read the selected Scribe.';
      sendResponse({ ok: false, error: errorMessage });
      return;
    }

    const translation = await translateWithOpenAI({
      apiKey,
      sourceLanguage,
      targetLanguageCode,
      targetLanguageName,
      originalTitle,
      body: extraction.text
    });

    if (!translation.ok) {
      await chrome.runtime.sendMessage({
        from: 'service-worker',
        type: 'translationComplete',
        success: false,
        error: translation.error
      });
      sendResponse({ ok: false, error: translation.error });
      return;
    }

    const newTitle = buildTranslatedTitle(originalTitle, targetLanguageCode, targetLanguageName);

    const duplicateResult = await duplicateScribe(tab.id, {
      originalTitle,
      newTitle,
      translatedContent: translation.text
    });

    if (!duplicateResult.ok) {
      await chrome.runtime.sendMessage({
        from: 'service-worker',
        type: 'translationComplete',
        success: false,
        error: duplicateResult.error
      });
      sendResponse({ ok: false, error: duplicateResult.error });
      return;
    }

    await safeSendMessage(tab.id, {
      from: 'service-worker',
      type: 'translationComplete',
      success: true,
      newTitle,
      targetLanguageCode,
      targetLanguageName
    });

    await chrome.runtime.sendMessage({
      from: 'service-worker',
      type: 'translationComplete',
      success: true,
      newTitle,
      targetLanguageCode,
      targetLanguageName
    });

    sendResponse({ ok: true, newTitle });
  } catch (error) {
    console.error('Translation workflow failed', error);
    chrome.runtime.sendMessage({
      from: 'service-worker',
      type: 'translationComplete',
      success: false,
      error: error.message || String(error)
    });
    sendResponse({ ok: false, error: error.message || String(error) });
  }
}

async function getActiveScribeTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs.find((tab) => typeof tab.url === 'string' && tab.url.startsWith('https://scribehow.com')) || null;
}

async function gatherScribeTitles(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (className) => {
      const nodes = Array.from(document.getElementsByClassName(className));
      return nodes.map((node) => node.textContent.trim()).filter(Boolean);
    },
    args: [SCRIBE_TITLE_CLASS]
  });

  return (results[0] && Array.isArray(results[0].result)) ? results[0].result : [];
}

async function gatherScribeContent(tabId, originalTitle) {
  const [response] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (className, title) => {
      const candidates = Array.from(document.getElementsByClassName(className));
      const match = candidates.find((node) => node.textContent.trim() === title.trim());
      if (!match) {
        return { error: 'Unable to locate the selected Scribe.' };
      }

      const container = match.closest('[data-testid="scribe-card"]') || match.closest('article') || match.parentElement;
      if (!container) {
        return { error: 'Unable to determine the Scribe container.' };
      }

      return { text: container.innerText.trim() };
    },
    args: [SCRIBE_TITLE_CLASS, originalTitle]
  });

  return response?.result || { error: 'Unexpected extraction error.' };
}

async function duplicateScribe(tabId, { originalTitle, newTitle, translatedContent }) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (className, title, duplicateTitle, content) => {
      const candidates = Array.from(document.getElementsByClassName(className));
      const match = candidates.find((node) => node.textContent.trim() === title.trim());
      if (!match) {
        return { ok: false, error: 'Unable to find the Scribe to duplicate.' };
      }

      const container = match.closest('[data-testid="scribe-card"]') || match.closest('article') || match.parentElement;
      if (!container || !container.parentElement) {
        return { ok: false, error: 'Unable to determine where to insert the duplicated Scribe.' };
      }

      const wrapper = document.createElement('article');
      wrapper.className = `${container.className} scribe-auto-translator-duplicate`;

      const titleElement = document.createElement(match.tagName || 'h2');
      titleElement.className = match.className;
      titleElement.textContent = duplicateTitle;

      const body = document.createElement('section');
      body.className = 'scribe-auto-translator-body';
      const contentElement = document.createElement('pre');
      contentElement.className = 'scribe-auto-translator-content';
      contentElement.textContent = content;
      body.appendChild(contentElement);

      wrapper.appendChild(titleElement);
      wrapper.appendChild(body);

      container.parentElement.insertBefore(wrapper, container.nextSibling);

      return { ok: true };
    },
    args: [SCRIBE_TITLE_CLASS, originalTitle, newTitle, translatedContent]
  });

  if (!result || !result.result) {
    return { ok: false, error: 'Failed to duplicate the Scribe.' };
  }

  return result.result;
}

async function safeSendMessage(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (error && error.message && error.message.includes('Receiving end does not exist')) {
      return;
    }

    console.warn('Unable to deliver message to tab', error);
  }
}

async function detectTabLanguage(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.detectLanguage(tabId, (language) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(language);
    });
  });
}

function buildTranslatedTitle(originalTitle, languageCode, languageName) {
  const code = (languageCode || '').toUpperCase();
  const readableName = languageName || 'translated';
  return `[${code}] ${originalTitle} but in ${readableName}`.trim();
}

async function translateWithOpenAI({ apiKey, sourceLanguage, targetLanguageCode, targetLanguageName, originalTitle, body }) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: 'You translate Scribe documentation. Preserve ordered steps, headings, and important formatting when translating.'
          },
          {
            role: 'user',
            content: [
              `Original title: ${originalTitle}`,
              `Source language: ${sourceLanguage || 'auto-detected'}`,
              `Target language: ${targetLanguageName} (${targetLanguageCode})`,
              'Document to translate:',
              body
            ].join('\n\n')
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { ok: false, error: `OpenAI API error: ${errorText}` };
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return { ok: false, error: 'OpenAI API returned an empty response.' };
    }

    return { ok: true, text };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}
