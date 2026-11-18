
(() => {
    const providers = {
        google_genai: 'Google Gemini',
        openai: 'OpenAI',
        anthropic: 'Anthropic'
    };
    const storagePrefix = 'jash.api-key.';
    const models = [
        {model: 'google_genai:gemini-3.5-flash-lite', provider: 'google_genai', label: 'Gemini 3.5 Flash Lite'},
        {model: 'openai:gpt-4o', provider: 'openai', label: 'GPT-4o'},
        {model: 'anthropic:claude-sonnet-5-5', provider: 'anthropic', label: 'Claude Sonnet 5.5'}
    ];

    // The Runs page also needs the same provider-key dialog, but has no model
    // configuration form. Build it there rather than storing keys in chats.
    if (!document.querySelector('#api-key-dialog')) {
        document.body.insertAdjacentHTML('beforeend', `
            <dialog id="api-key-dialog" class="sign-in-dialog" aria-labelledby="api-key-title" aria-describedby="api-key-description">
              <form id="api-key-form">
                <div class="dialog-heading">
                  <div><h2 id="api-key-title">API key</h2><p id="api-key-description"></p></div>
                  <button id="cancel-api-key" class="dialog-close" type="button" aria-label="Cancel">&times;</button>
                </div>
                <p class="api-key-notice">Your key is saved for this tab's session. It is sent to this app's Python server and the selected AI provider. API usage is billed to your provider account.</p>
                <label for="api-key-input">API key
                  <input id="api-key-input" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="4096" required />
                </label>
                <p id="api-key-error" class="api-key-error" role="alert"></p>
                <div class="dialog-actions"><button class="primary" type="submit">Save for this tab</button></div>
              </form>
            </dialog>
        `);
    }

    const modelSelects = [
        ...document.querySelectorAll('[data-api-key-model]')
    ];

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

    function getModelSelection(select, model = null) {
        const option = model
            ? [...select.options].find(option => option.value === model)
            : select.selectedOptions[0];
        if (!option) throw new Error('The selected model is unavailable.');
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

            const button = document.querySelector(
                '#' + prefix + '-api-key'
            );

            const status = document.querySelector(
                '#' + prefix + '-key-status'
            );

            // Update the button depending on whether a key is saved.
            if (button) {
                button.textContent = hasKey
                    ? 'Change API key'
                    : 'Set API key';
            }

            // Display a green checkmark when a key is saved.
            if (status) {
                status.textContent = hasKey
                    ? '✓ API Key Saved'
                    : '';
            }
        }
    }

    function requestKey(selection, replace = false) {
        const request = promptQueue.then(() => {
            const existingKey = getSavedKey(selection.provider);

            if (existingKey && !replace) {
                return existingKey;
            }

            return new Promise(resolve => {
                let savedKey = null;
                keyInput.value = '';
                keyInput.setCustomValidity('');
                errorText.textContent = '';

                document.querySelector(
                    '#api-key-title'
                ).textContent =
                    providers[selection.provider] + ' API key';

                document.querySelector(
                    '#api-key-description'
                ).textContent =
                    'Enter your API key to use ' +
                    selection.label + '.';

                function onSubmit(event) {
                    event.preventDefault();
                    const value = keyInput.value.trim();

                    keyInput.setCustomValidity(
                        value ? '' : 'Please enter an API key.'
                    );

                    if (!keyInput.reportValidity()) {
                        return;
                    }

                    try {
                        sessionStorage.setItem(
                            storagePrefix + selection.provider,
                            value
                        );
                    } catch {
                        errorText.textContent =
                            'Session storage is unavailable. ' +
                            'Enable it in your browser to save a key.';
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

                dialog.addEventListener(
                    'close',
                    onClose,
                    {once: true}
                );

                dialog.showModal();
                keyInput.focus();
            });
        });

        promptQueue = request.then(
            () => {},
            () => {}
        );

        return request;
    }

    async function getRunCredentials(models = null) {
        // Continuations use the original run's models even if setup changes.
        const selections = modelSelects.map((select, index) =>
            getModelSelection(select, models?.[index])
        );
        const credentials = [];
        for (const selection of selections) {
            const apiKey = await requestKey(selection);

            if (!apiKey) {
                return null;
            }

            credentials.push({
                model: selection.model,
                apiKey
            });
        }
        return credentials;
    }

    async function getModelCredentials(model, replace = false) {
        const selection = models.find(item => item.model === model);
        if (!selection) throw new Error('The selected model is unavailable.');
        const apiKey = await requestKey(selection, replace);
        return apiKey ? {model: selection.model, apiKey} : null;
    }

    // Clear validation errors when typing a new API key.
    keyInput.addEventListener('input', () => {
        keyInput.setCustomValidity('');
    });

    // Cancel API key entry.
    document.querySelector(
        '#cancel-api-key'
    ).addEventListener('click', () => {
        dialog.close();
    });

    // Handle model selection changes and API key buttons.
    for (const select of modelSelects) {
        select.addEventListener('change', () => {
            updateKeyStatus();
            requestKey(getModelSelection(select));
        });

        const buttonId =
            '#' + select.id.replace('-model', '-api-key');

        document.querySelector(buttonId).addEventListener(
            'click',
            () => {
                requestKey(getModelSelection(select), true);
            }
        );
    }

    // Clear all saved API keys.
    document.querySelector(
        '#clear-api-keys'
    )?.addEventListener('click', () => {
        try {
            for (const provider of Object.keys(providers)) {
                sessionStorage.removeItem(
                    storagePrefix + provider
                );
            }
            updateKeyStatus();
        } catch {
            alert('Your browser could not clear the saved keys.');
        }
    });
    // Set the correct button labels and checkmarks on page load.
    updateKeyStatus();

    // Make credentials available to the run functionality.
    window.apiKeys = {
        getRunCredentials,
        getModelCredentials,
        models
    };
})();
