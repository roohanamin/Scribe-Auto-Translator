const SCRIBE_SELECT_ID = 'scribeFinder';
const DETECTED_LANGUAGE_SELECT_ID = 'detectedLanguage';
const HIDDEN_CONTAINER_ID = 'scribe-auto-translator-hidden-data';
const LANGUAGE_DISPLAY = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' });
  } catch (error) {
    return null;
  }
})();

const isExtensionPage = window.location.protocol === 'chrome-extension:';

if (!isExtensionPage) {
  const hiddenContainer = ensureHiddenContainer();
  const scribeSelect = hiddenContainer.querySelector(`#${SCRIBE_SELECT_ID}`);
  const detectedSelect = hiddenContainer.querySelector(`#${DETECTED_LANGUAGE_SELECT_ID}`);

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || !message.type) {
      return;
    }

    switch (message.type) {
      case 'scribeTitles':
        updateScribeOptions(scribeSelect, message.titles || []);
        chrome.storage.local.set({ scribeTitles: message.titles || [] });
        break;
      case 'languageDetected':
        updateDetectedLanguageOption(detectedSelect, message.language || 'und');
        chrome.storage.local.set({ detectedLanguage: message.language || 'und' });
        break;
      case 'translationComplete':
        if (message.from === 'service-worker' && message.success) {
          showToast(`Created translated Scribe: ${message.newTitle}`);
        }
        break;
      default:
        break;
    }
  });
}

function ensureHiddenContainer() {
  let container = document.getElementById(HIDDEN_CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = HIDDEN_CONTAINER_ID;
    container.style.display = 'none';

    const scribeSelect = document.createElement('select');
    scribeSelect.id = SCRIBE_SELECT_ID;
    scribeSelect.name = SCRIBE_SELECT_ID;
    container.appendChild(scribeSelect);

    const detectedSelect = document.createElement('select');
    detectedSelect.id = DETECTED_LANGUAGE_SELECT_ID;
    detectedSelect.name = DETECTED_LANGUAGE_SELECT_ID;
    container.appendChild(detectedSelect);

    document.body.appendChild(container);
  }

  return container;
}

function updateScribeOptions(select, titles) {
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

function updateDetectedLanguageOption(select, languageCode) {
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

function showToast(message) {
  if (!message) {
    return;
  }

  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.position = 'fixed';
  toast.style.bottom = '24px';
  toast.style.right = '24px';
  toast.style.padding = '12px 16px';
  toast.style.background = 'rgba(30, 64, 175, 0.92)';
  toast.style.color = '#fff';
  toast.style.borderRadius = '8px';
  toast.style.boxShadow = '0 10px 25px rgba(15, 23, 42, 0.2)';
  toast.style.zIndex = '999999';
  toast.style.fontFamily = 'sans-serif';
  toast.style.fontSize = '14px';
  toast.style.maxWidth = '320px';
  toast.style.lineHeight = '1.4';

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 300ms ease';
    toast.style.opacity = '0';
  }, 2600);

  setTimeout(() => {
    toast.remove();
  }, 3100);
}
