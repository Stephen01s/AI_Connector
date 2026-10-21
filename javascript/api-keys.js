// Keep API-key controls available while external account modules are loading.
(() => {
    const providers = {
        google_genai: 'Google Gemini',
        openai: 'OpenAI',
        anthropic: 'Anthropic'
    };
    const storagePrefix = 'jash.api-key.';
    const modelSelects = [...document.querySelectorAll('[data-api-key-model]')];
    const dialog = document.querySelector('#api-key-dialog');
    const form = document.querySelector('#api-key-form');
    const keyInput = document.querySelector('#api-key-input');
    const errorText = document.querySelector('#api-key-error');
    let promptQueue = Promise.resolve();

    function getSavedKey(provider) {
        try {
            return sessionStorage.getItem(storagePrefix + provider) || '';
        } catch {
            return '';
        }
    }

    function getModelSelection(select) {
        const option = select.selectedOptions[0];
        return {
            model: option.value,
            provider: option.dataset.provider,
            label: option.textContent.trim()
        };
    }

    function updateKeyStatus() {
        for (const select of modelSelects) {
            const {provider} = getModelSelection(select);
            const prefix = select.id.replace('-model', '');
            const hasKey = Boolean(getSavedKey(provider));
            document.querySelector('#' + prefix + '-api-key').textContent =
                hasKey ? 'Change API key' : 'Set API key';
        }
    }

    function requestKey(selection, replace = false) {
        const request = promptQueue.then(() => {
            const existingKey = getSavedKey(selection.provider);
            if (existingKey && !replace) return existingKey;

            return new Promise(resolve => {
                let savedKey = null;
                keyInput.value = '';
                keyInput.setCustomValidity('');
                errorText.textContent = '';
                document.querySelector('#api-key-title').textContent =
                    providers[selection.provider] + ' API key';
                document.querySelector('#api-key-description').textContent =
                    'Enter your API key to use ' + selection.label + '.';

                function onSubmit(event) {
                    event.preventDefault();
                    const value = keyInput.value.trim();
                    keyInput.setCustomValidity(value ? '' : 'Please enter an API key.');
                    if (!keyInput.reportValidity()) return;
                    try {
                        sessionStorage.setItem(storagePrefix + selection.provider, value);
                    } catch {
                        errorText.textContent = 'Session storage is unavailable. Enable it in your browser to save a key.';
                        return;
                    }
                    savedKey = value;
                    dialog.close();
                }

                function onClose() {
                    form.removeEventListener('submit', onSubmit);
                    keyInput.value = '';
                    updateKeyStatus();
                    resolve(savedKey);
                }

                form.addEventListener('submit', onSubmit);
                dialog.addEventListener('close', onClose, {once: true});
                dialog.showModal();
                keyInput.focus();
            });
        });
        promptQueue = request.then(() => {}, () => {});
        return request;
    }

    async function getRunCredentials() {
        // Capture both choices before awaiting dialogs.
        const selections = modelSelects.map(getModelSelection);
        const credentials = [];
        for (const selection of selections) {
            const apiKey = await requestKey(selection);
            if (!apiKey) return null;
            credentials.push({model: selection.model, apiKey});
        }
        return credentials;
    }

    keyInput.addEventListener('input', () => keyInput.setCustomValidity(''));
    document.querySelector('#cancel-api-key').addEventListener('click', () => dialog.close());
    for (const select of modelSelects) {
        select.addEventListener('change', () => {
            updateKeyStatus();
            requestKey(getModelSelection(select));
        });
        const buttonId = '#' + select.id.replace('-model', '-api-key');
        document.querySelector(buttonId).addEventListener('click', () => {
            requestKey(getModelSelection(select), true);
        });
    }
    document.querySelector('#clear-api-keys').addEventListener('click', () => {
        try {
            for (const provider of Object.keys(providers)) {
                sessionStorage.removeItem(storagePrefix + provider);
            }
            updateKeyStatus();
        } catch {
            alert('Your browser could not clear the saved keys.');
        }
    });
    updateKeyStatus();
    window.apiKeys = {getRunCredentials};
})();
