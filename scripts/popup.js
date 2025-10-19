const SCRIBE_SELECT_ID = 'scribeFinder';
const DETECTED_LANGUAGE_SELECT_ID = 'detectedLanguage';
const TARGET_LANGUAGE_SELECT_ID = 'targetLanguage';
const API_KEY_INPUT_ID = 'openaiKey';
const STATUS_ELEMENT_ID = 'statusMessage';
const LANGUAGE_DISPLAY = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' });
  } catch (error) {
    return null;
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  const scribeSelect = document.getElementById(SCRIBE_SELECT_ID);
  const detectedSelect = document.getElementById(DETECTED_LANGUAGE_SELECT_ID);
  const targetSelect = document.getElementById(TARGET_LANGUAGE_SELECT_ID);
  const translateButton = document.getElementById('translateButton');
  const statusElement = document.getElementById(STATUS_ELEMENT_ID);
  const apiKeyInput = document.getElementById(API_KEY_INPUT_ID);

  if (!scribeSelect || !detectedSelect || !targetSelect || !translateButton || !apiKeyInput) {
    return;
  }

  populateDetectedLanguage(detectedSelect, detectedSelect.value || 'und');

  loadPersistedState({ scribeSelect, detectedSelect, apiKeyInput });
  registerStorageListener({ scribeSelect, detectedSelect });
  registerMessageListener(statusElement);

  translateButton.addEventListener('click', async () => {
    const selectedTitle = scribeSelect.value;
    if (!selectedTitle || selectedTitle === 'default') {
      updateStatus(statusElement, 'Please select a Scribe to translate.', true);
      return;
    }

    const selectedTargetOption = targetSelect.options[targetSelect.selectedIndex];
    if (!selectedTargetOption || selectedTargetOption.value === 'defaultLang') {
      updateStatus(statusElement, 'Please choose a target language.', true);
      return;
    }

    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      updateStatus(statusElement, 'Provide your OpenAI API key before translating.', true);
      return;
    }

    await chrome.storage.local.set({ openaiApiKey: apiKey });

    const targetLanguageCode = selectedTargetOption.value;
    const targetLanguageName = parseLanguageName(selectedTargetOption.textContent);
    const sourceLanguage = detectedSelect.value || 'und';

    updateStatus(statusElement, 'Translating with OpenAI…', false);
    translateButton.disabled = true;

    chrome.runtime.sendMessage({
      type: 'translateScribe',
      payload: {
        originalTitle: selectedTitle,
        targetLanguageCode,
        targetLanguageName,
        sourceLanguage,
        apiKey
      }
    }, (response) => {
      translateButton.disabled = false;

      if (chrome.runtime.lastError) {
        updateStatus(statusElement, chrome.runtime.lastError.message || 'Unexpected error during translation.', true);
        return;
      }

      if (!response) {
        updateStatus(statusElement, 'No response received from the background script.', true);
        return;
      }

      if (!response.ok) {
        updateStatus(statusElement, response.error || 'Unable to translate the selected Scribe.', true);
        return;
      }

      updateStatus(statusElement, `Created translation: ${response.newTitle}`, false);
    });
  });

  apiKeyInput.addEventListener('input', debounce(async () => {
    const value = apiKeyInput.value.trim();
    await chrome.storage.local.set({ openaiApiKey: value });
  }, 350));

  initialiseFromBackground({ scribeSelect, detectedSelect, statusElement });
});

function initialiseFromBackground({ scribeSelect, detectedSelect, statusElement }) {
  chrome.runtime.sendMessage({ type: 'popupReady' }, (response) => {
    if (chrome.runtime.lastError) {
      updateStatus(statusElement, chrome.runtime.lastError.message || 'Unable to connect to the background worker.', true);
      return;
    }

    if (!response) {
      updateStatus(statusElement, 'No response from background worker.', true);
      return;
    }

    if (!response.ok) {
      updateStatus(statusElement, response.error || 'Unable to read Scribe details.', true);
      return;
    }

    if (Array.isArray(response.titles)) {
      populateScribeSelect(scribeSelect, response.titles);
    }

    if (response.language) {
      populateDetectedLanguage(detectedSelect, response.language);
    }
  });
}

async function loadPersistedState({ scribeSelect, detectedSelect, apiKeyInput }) {
  const stored = await chrome.storage.local.get(['scribeTitles', 'detectedLanguage', 'openaiApiKey']);

  if (Array.isArray(stored.scribeTitles) && stored.scribeTitles.length > 0) {
    populateScribeSelect(scribeSelect, stored.scribeTitles);
  }

  if (stored.detectedLanguage) {
    populateDetectedLanguage(detectedSelect, stored.detectedLanguage);
  }

  if (typeof stored.openaiApiKey === 'string') {
    apiKeyInput.value = stored.openaiApiKey;
  }
}

function registerStorageListener({ scribeSelect, detectedSelect }) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') {
      return;
    }

    if (changes.scribeTitles && Array.isArray(changes.scribeTitles.newValue)) {
      populateScribeSelect(scribeSelect, changes.scribeTitles.newValue);
    }

    if (changes.detectedLanguage && typeof changes.detectedLanguage.newValue === 'string') {
      populateDetectedLanguage(detectedSelect, changes.detectedLanguage.newValue);
    }
  });
}

function registerMessageListener(statusElement) {
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== 'translationComplete' || message.from !== 'service-worker') {
      return;
    }

    if (message.success) {
      updateStatus(statusElement, `Created translation: ${message.newTitle}`, false);
    } else if (message.error) {
      updateStatus(statusElement, message.error, true);
    }
  });
}

function populateScribeSelect(select, titles) {
  if (!select) {
    return;
  }

  select.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = 'default';
  defaultOption.textContent = '<Select a Scribe>';
  select.appendChild(defaultOption);

  titles.forEach((title) => {
    const option = document.createElement('option');
    option.value = title;
    option.textContent = title;
    select.appendChild(option);
  });
}

function populateDetectedLanguage(select, languageCode) {
  if (!select) {
    return;
  }

  const readable = getLanguageDisplayName(languageCode);
  select.innerHTML = '';
  const option = document.createElement('option');
  option.value = languageCode;
  option.textContent = readable;
  select.appendChild(option);
}

function parseLanguageName(label) {
  if (!label) {
    return 'Unknown language';
  }

  const [name] = label.split(' - ');
  return name.trim();
}

function getLanguageDisplayName(code) {
  if (!code || code === 'und') {
    return 'Unknown language';
  }

  try {
    return LANGUAGE_DISPLAY ? LANGUAGE_DISPLAY.of(code) || code.toUpperCase() : code.toUpperCase();
  } catch (error) {
    return code.toUpperCase();
  }
}

function updateStatus(element, message, isError) {
  if (!element) {
    return;
  }

  element.textContent = message || '';
  element.className = isError ? 'statusMessage statusMessage--error' : 'statusMessage statusMessage--info';
}

function debounce(callback, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => callback(...args), delay);
  };
}
