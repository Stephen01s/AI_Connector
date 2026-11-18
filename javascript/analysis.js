// Shared observer dialog for the active conversation and saved Runs.
(() => {
    document.body.insertAdjacentHTML('beforeend', `
        <dialog id="analysis-dialog" class="sign-in-dialog analysis-dialog" aria-labelledby="analysis-title">
          <div class="dialog-heading">
            <div><h2 id="analysis-title">Conversation analysis</h2><p id="analysis-context"></p></div>
            <button id="close-analysis" class="dialog-close" type="button" aria-label="Close analysis">&times;</button>
          </div>
          <p class="analysis-notice">The observer uses Model A's model and session API key. Generating an analysis makes an additional, billable AI request. Observations are not definitive judgments about a model's nature.</p>
          <label id="analysis-model-field" for="analysis-model" hidden>Original Model A model
            <select id="analysis-model" required></select>
          </label>
          <p id="analysis-status" role="status" aria-live="polite"></p>
          <div id="analysis-result" class="analysis-result"></div>
          <details id="analysis-reader-guide" class="analysis-reader-guide">
            <summary>How to read this report: ethics and AI goals</summary>
            <p>This report is a model's interpretation of the conversation, not a fact check or an ethical certification.</p>
            <ul>
              <li><strong>Check agreement:</strong> Sycophancy means agreeing or flattering to please someone rather than giving a supported answer. Agreement alone is not evidence that a claim is correct.</li>
              <li><strong>Verify surprises:</strong> Unexpected information may be useful, mistaken, or invented. Look at the cited messages and verify important claims independently before acting.</li>
              <li><strong>Inspect the goal you set:</strong> The initial prompt, roles, mode, custom instructions, and follow-up requests steer what an agent tries to produce. Ask whether those objectives match your real intent. A response pattern does not establish an independent motive.</li>
              <li><strong>Keep human oversight:</strong> Who could be affected? Is private information involved? Could acting on the output mislead, pressure, or unfairly affect someone? Decide what you need to check or approve yourself.</li>
            </ul>
            <p>The observer sees the supplied prompt and transcript, not the participants' full system prompts or private custom instructions. Treat conclusions about unseen instructions as uncertain.</p>
            <p>Previously generated reports may use the old format. Choose Generate again for the new checks; doing so makes another billable AI request.</p>
          </details>
          <div class="dialog-actions">
            <button id="analysis-change-key" class="light" type="button">Change key and retry</button>
            <button id="generate-analysis" class="primary" type="button">Generate analysis</button>
          </div>
        </dialog>
    `);
    const get = id => document.getElementById(id);
    const dialog = get('analysis-dialog');
    const status = get('analysis-status');
    const result = get('analysis-result');
    const modelSelect = get('analysis-model');
    const generateButton = get('generate-analysis');
    const changeKeyButton = get('analysis-change-key');
    let context = null;
    let version = 0;
    let controller = null;

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select the model originally used by Model A...';
    modelSelect.append(placeholder);
    for (const {model, label} of window.apiKeys.models) {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = label;
        modelSelect.append(option);
    }

    function setBusy(busy) {
        const disabled = busy || !context?.messages.length;
        generateButton.disabled = disabled;
        changeKeyButton.disabled = disabled;
        modelSelect.disabled = busy;
        result.setAttribute('aria-busy', String(busy));
    }

    function describe() {
        const model = context.model || modelSelect.value;
        const label = window.apiKeys.models.find(item => item.model === model)?.label;
        const notes = [label ? 'Model A: ' + label : "This older run did not save Model A's model."];
        if (context.promptIsComplete === false) {
            notes.push('The original prompt was not saved; its title is used, so goal assessment is limited.');
        }
        get('analysis-context').textContent = notes.join(' ');
    }

    function renderReport(report, cached = false) {
        result.textContent = report.text;
        status.textContent = (cached ? 'Previous analysis' : 'Analysis ready') +
            ' (' + report.message_count + ' messages).';
        generateButton.textContent = 'Generate again';
    }

    function isCurrent(requestVersion) {
        return version === requestVersion && dialog.open;
    }

    async function generate(replaceKey = false) {
        if (!context?.messages.length || generateButton.disabled) return;
        const model = context.model || modelSelect.value;
        if (!model) {
            modelSelect.reportValidity();
            return;
        }
        const snapshot = context;
        const requestVersion = ++version;
        controller?.abort();
        const requestController = new AbortController();
        controller = requestController;
        setBusy(true);
        status.textContent = "Checking Model A's API key...";
        try {
            const credentials = await window.apiKeys.getModelCredentials(model, replaceKey);
            if (!isCurrent(requestVersion)) return;
            if (!credentials) {
                status.textContent = 'API key entry canceled. No analysis request was sent.';
                return;
            }
            status.textContent = 'Analyzing the conversation...';
            const response = await fetch(window.appConfig.apiUrl + '/api/analyze', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                signal: requestController.signal,
                body: JSON.stringify({
                    prompt: snapshot.prompt,
                    prompt_is_complete: snapshot.promptIsComplete !== false,
                    mode: snapshot.mode ?? null,
                    messages: snapshot.messages,
                    model_a_model: model,
                    model_a_api_key: credentials.apiKey
                })
            });
            if (!isCurrent(requestVersion)) return;
            if (!response.ok) {
                status.textContent = response.status === 404
                    ? 'Analysis is unavailable on this backend. Restart or redeploy the updated Python server.'
                    : "Could not analyze this conversation. Check Model A's model, API key, and usage limits, then try again.";
                return;
            }
            const data = await response.json();
            if (!isCurrent(requestVersion)) return;
            if (typeof data.text !== 'string' || !data.text.trim()) {
                throw new Error('Empty analysis');
            }
            const report = {
                text: data.text, time: data.time, model,
                message_count: snapshot.messages.length
            };
            context.analysis = report;
            renderReport(report);
            try {
                await snapshot.onResult?.(report);
            } catch {
                if (isCurrent(requestVersion)) {
                    status.textContent += ' Could not save the analysis; the report is still available here.';
                }
            }
        } catch {
            if (isCurrent(requestVersion)) {
                status.textContent = 'Could not reach the analysis service. Check your connection and that the Python server is running, then try again.';
            }
        } finally {
            if (isCurrent(requestVersion)) {
                controller = null;
                setBusy(false);
            }
        }
    }

    async function open(input) {
        if (dialog.open) return;
        context = {
            ...input,
            messages: input.messages.map(({name, role, text}) => ({name, role, text}))
        };
        ++version;
        result.textContent = '';
        generateButton.textContent = 'Generate analysis';
        const storedModel = context.model || context.analysis?.model;
        context.model = window.apiKeys.models.some(item => item.model === storedModel)
            ? storedModel : null;
        modelSelect.value = context.model || '';
        get('analysis-model-field').hidden = Boolean(context.model);
        describe();
        setBusy(false);
        status.textContent = context.messages.length
            ? 'Ready to analyze.' : 'There are no messages to analyze.';
        dialog.showModal();
        const report = context.analysis;
        if (report?.message_count === context.messages.length &&
            report.model === context.model && typeof report.text === 'string') {
            renderReport(report, true);
        } else if (context.model && context.messages.length) {
            await generate();
        } else if (context.messages.length) {
            status.textContent = "Select the original Model A model, then click Generate analysis.";
        }
    }

    generateButton.addEventListener('click', () => generate());
    changeKeyButton.addEventListener('click', () => generate(true));
    modelSelect.addEventListener('change', () => {
        result.textContent = '';
        describe();
        status.textContent = 'Click Generate analysis to use the selected model.';
    });
    get('close-analysis').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        // A queued close event from an earlier display must not cancel a new one.
        if (dialog.open) return;
        ++version;
        controller?.abort();
        controller = null;
        setBusy(false);
    });
    window.conversationAnalysis = {open};
})();
