const assert = require('node:assert/strict');
const {test} = require('node:test');
const {browser, flush} = require('./browser-harness.cjs');

function analysisBrowser() {
    const app = browser();
    app.evaluate('api-config.js');
    app.evaluate('api-keys.js');
    app.evaluate('analysis.js');
    app.storage.set('jash.api-key.openai', 'model-a-test-key');
    app.storage.set('jash.api-key.google_genai', 'unrelated-test-key');
    const requests = [];
    const saved = [];
    const controls = {ok: true, status: 502, gate: null, saveError: false};
    app.context.fetch = async (url, options) => {
        requests.push({url, payload: JSON.parse(options.body), signal: options.signal});
        if (controls.gate) await controls.gate;
        return {
            ok: controls.ok, status: controls.status,
            json: async () => ({text: '<b>Observe</b>\nMessage 1 supports this.', time: '2026-11-16T12:00:00Z'})
        };
    };
    const input = {
        prompt: 'Plan a garden.', mode: null, model: 'openai:gpt-4o',
        messages: [
            {name: 'A', role: 'Planner', text: 'Use native plants.'},
            {name: 'Human', role: 'Moderator', text: 'Focus on cost.'}
        ],
        onResult: async report => {
            if (controls.saveError) throw new Error('Database unavailable');
            saved.push(report);
        }
    };
    return {...app, input, requests, saved, controls,
        open: (changes = {}) => app.context.window.conversationAnalysis.open({...input, ...changes})};
}

test('observer reuses only Model A key, sends a snapshot, and renders plain text safely', async () => {
    const app = analysisBrowser();
    await app.open();
    assert.equal(app.requests.length, 1);
    assert.equal(app.requests[0].url, 'https://ai-connector-szkl.onrender.com/api/analyze');
    assert.equal(app.requests[0].payload.model_a_api_key, 'model-a-test-key');
    assert.equal(app.requests[0].payload.model_a_model, 'openai:gpt-4o');
    assert.equal(app.requests[0].payload.messages.length, 2);
    assert.equal(app.requests[0].payload.prompt_is_complete, true);
    assert.ok(!JSON.stringify(app.requests[0].payload).includes('unrelated-test-key'));
    assert.equal(app.get('analysis-result').textContent, '<b>Observe</b>\nMessage 1 supports this.');
    assert.equal(app.get('analysis-result').children.length, 0);
    assert.equal(app.saved[0].message_count, 2);
    assert.ok(!JSON.stringify(app.saved).includes('test-key'));
    assert.equal(app.input.messages.length, 2);
    assert.equal(app.get('analysis-model-field').hidden, true);
});

test('saved analysis opens without a provider key or another model request', async () => {
    const app = analysisBrowser();
    app.storage.clear();
    await app.open({analysis: {
        text: 'Saved report.', model: 'openai:gpt-4o', message_count: 2, time: 'earlier'
    }});
    assert.equal(app.requests.length, 0);
    assert.equal(app.get('analysis-result').textContent, 'Saved report.');
    assert.ok(app.get('analysis-status').textContent.startsWith('Previous analysis'));
    assert.equal(app.get('api-key-dialog').open, false);
});

test('the human reading guide accompanies cached reports without generating another analysis', async () => {
    const app = analysisBrowser();
    app.storage.clear();
    await app.open({analysis: {
        text: 'An older saved summary.', model: 'openai:gpt-4o', message_count: 2
    }});
    const guide = app.get('analysis-reader-guide');
    assert.equal(guide.tagName, 'DETAILS');
    assert.equal(guide.hidden, false);
    const markup = app.context.document.body.insertedHTML;
    assert.ok(markup.includes('How to read this report: ethics and AI goals'));
    assert.ok(markup.includes('Sycophancy means'));
    assert.ok(markup.includes('Inspect the goal you set'));
    assert.ok(markup.includes('Who could be affected?'));
    assert.ok(markup.includes('private custom instructions'));
    assert.ok(markup.includes('Previously generated reports may use the old format'));
    assert.equal(app.get('analysis-result').textContent, 'An older saved summary.');
    assert.equal(app.requests.length, 0);
});

test('a stale report is regenerated for the current message snapshot', async () => {
    const app = analysisBrowser();
    await app.open({analysis: {text: 'Old report', model: 'openai:gpt-4o', message_count: 1}});
    assert.equal(app.requests.length, 1);
    assert.equal(app.saved[0].message_count, 2);
});

test('older runs require the original Model A model and flag incomplete prompt context', async () => {
    const app = analysisBrowser();
    await app.open({model: null, promptIsComplete: false});
    assert.equal(app.requests.length, 0);
    assert.equal(app.get('analysis-model-field').hidden, false);
    assert.ok(app.get('analysis-context').textContent.includes('original prompt was not saved'));
    await app.get('generate-analysis').emit('click');
    assert.equal(app.requests.length, 0);
    app.get('analysis-model').value = 'openai:gpt-4o';
    await app.get('analysis-model').emit('change');
    await app.get('generate-analysis').emit('click');
    assert.equal(app.requests.length, 1);
    assert.equal(app.requests[0].payload.prompt_is_complete, false);
});

test('missing keys use the shared dialog and cancellation never starts an AI request', async () => {
    const app = analysisBrowser();
    app.storage.delete('jash.api-key.openai');
    const pending = app.open();
    await flush();
    assert.equal(app.get('api-key-dialog').open, true);
    assert.equal(app.get('api-key-title').textContent, 'OpenAI API key');
    await app.get('cancel-api-key').emit('click');
    await pending;
    assert.equal(app.requests.length, 0);
    assert.equal(app.get('generate-analysis').disabled, false);
    assert.ok(app.get('analysis-status').textContent.includes('canceled'));
});

test('keys can be entered on Runs without model selectors or a clear-keys control', async () => {
    const app = analysisBrowser();
    app.storage.delete('jash.api-key.openai');
    const pending = app.open();
    await flush();
    app.get('api-key-input').value = '  replacement-key  ';
    await app.get('api-key-form').emit('submit');
    await pending;
    assert.equal(app.requests[0].payload.model_a_api_key, 'replacement-key');
    assert.equal(app.storage.get('jash.api-key.openai'), 'replacement-key');
    assert.equal(app.get('api-key-input').value, '');
});

test('errors unlock retry controls and never display raw provider failures', async () => {
    const app = analysisBrowser();
    app.controls.ok = false;
    app.controls.status = 404;
    await app.open();
    assert.ok(app.get('analysis-status').textContent.includes('updated Python server'));
    assert.equal(app.get('generate-analysis').disabled, false);
    app.controls.ok = true;
    await app.get('generate-analysis').emit('click');
    assert.equal(app.saved.length, 1);
});

test('Change key and retry replaces Model A key before a new analysis request', async () => {
    const app = analysisBrowser();
    await app.open();
    const pending = app.get('analysis-change-key').emit('click');
    await flush();
    assert.equal(app.get('api-key-dialog').open, true);
    assert.equal(app.get('api-key-input').value, '');
    app.get('api-key-input').value = 'new-model-a-key';
    await app.get('api-key-form').emit('submit');
    await pending;
    assert.equal(app.requests.length, 2);
    assert.equal(app.requests[1].payload.model_a_api_key, 'new-model-a-key');
});

test('closing an in-flight analysis aborts the client request and ignores late results', async () => {
    const app = analysisBrowser();
    let release;
    app.controls.gate = new Promise(resolve => { release = resolve; });
    const pending = app.open();
    await flush();
    assert.equal(app.requests.length, 1);
    await app.get('generate-analysis').emit('click');
    await app.get('analysis-change-key').emit('click');
    assert.equal(app.requests.length, 1);
    await app.get('close-analysis').emit('click');
    assert.equal(app.requests[0].signal.aborted, true);
    release();
    await pending;
    assert.equal(app.saved.length, 0);
    assert.equal(app.get('analysis-result').textContent, '');
});

test('save failure retains the generated report in the modal', async () => {
    const app = analysisBrowser();
    app.controls.saveError = true;
    await app.open();
    assert.ok(app.get('analysis-result').textContent.includes('Observe'));
    assert.ok(app.get('analysis-status').textContent.includes('Could not save'));
});

test('the configured Render backend is preserved for local and hosted pages', () => {
    for (const [hostname, expected] of [
        ['localhost', 'https://ai-connector-szkl.onrender.com'],
        ['127.0.0.1', 'https://ai-connector-szkl.onrender.com'],
        ['[::1]', 'https://ai-connector-szkl.onrender.com'],
        ['jashai.netlify.app', 'https://ai-connector-szkl.onrender.com']
    ]) {
        const app = browser('runs.html', hostname);
        app.evaluate('api-config.js');
        assert.equal(app.context.window.appConfig.apiUrl, expected);
    }
});
