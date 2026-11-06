// Offline browser-logic tests using the real scripts and a minimal DOM.
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {test} = require('node:test');
const vm = require('node:vm');
const root = join(__dirname, '..');
const html = readFileSync(join(root, 'html/index.html'), 'utf8');

class Element {
    constructor() {
        this.value = '';
        this.textContent = '';
        this.children = [];
        this.disabled = false;
        this.dataset = {};
        this.listeners = new Map();
        const classes = new Set();
        this.classList = {
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            contains: name => classes.has(name)
        };
    }
    addEventListener(type, callback, options = {}) {
        this.listeners.set(type, [...(this.listeners.get(type) || []), {callback, options}]);
    }
    removeEventListener(type, callback) {
        this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item.callback !== callback));
    }
    async emit(type) {
        for (const {callback, options} of [...(this.listeners.get(type) || [])]) {
            if (options.once) this.removeEventListener(type, callback);
            await callback({preventDefault() {}});
        }
    }
    get selectedOptions() { return this.options.filter(option => option.value === this.value); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    reportValidity() { return true; }
    setCustomValidity() {}
    setAttribute() {}
    focus() {}
    showModal() { this.open = true; }
    close() { this.open = false; this.emit('close'); }
    click() {}
}

function browser() {
    const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], new Element()]));
    const get = id => {
        assert.ok(elements.has(id), 'Missing HTML element: ' + id);
        return elements.get(id);
    };
    const selects = [...html.matchAll(/<select id="(model-[ab]-model)" data-api-key-model>([\s\S]*?)<\/select>/g)].map(match => {
        const select = get(match[1]);
        select.id = match[1];
        select.options = [...match[2].matchAll(/<option value="([^"]+)" data-provider="([^"]+)"([^>]*)>([^<]+)<\/option>/g)].map(option => {
            if (option[3].includes('selected')) select.value = option[1];
            return {value: option[1], dataset: {provider: option[2]}, textContent: option[4]};
        });
        return select;
    });
    const storage = new Map([['profile', 'test-profile']]);
    const alerts = [];
    const context = vm.createContext({
        document: {
            body: new Element(),
            querySelector: selector => elements.get(selector.slice(1)) || null,
            getElementById: get,
            querySelectorAll: selector => selector === '[data-api-key-model]' ? selects
                : selector === '.screen' ? ['setup-screen', 'conversation-screen', 'review-screen'].map(get) : [],
            createElement: () => new Element()
        },
        localStorage: {getItem: key => storage.get(key) || null},
        sessionStorage: {
            getItem: key => storage.get(key) || null,
            setItem: (key, value) => storage.set(key, value),
            removeItem: key => storage.delete(key)
        },
        window: {scrollTo() {}, location: {}},
        requestAnimationFrame: callback => callback(),
        alert: message => alerts.push(message),
        confirm: () => false,
        console: {error() {}},
        TextDecoder, Uint8Array, Date, Blob, URL
    });
    return {context, get, storage, alerts, selects};
}

function runBrowser() {
    const app = browser();
    const {context, get} = app;
    const requests = [];
    const saved = [];
    const chats = [];
    const credentialModels = [];
    let nextId = 0;
    const controls = {cancel: false, error: false, gate: null, failSave: false};
    Object.assign(context, {
        db: {},
        usernameSessionKey: 'profile',
        collection: (_db, ...parts) => ({path: parts.join('/')}),
        doc: (ref, ...parts) => ({path: parts.length ? parts.join('/') : ref.path + '/' + (++nextId)}),
        getDoc: async () => ({exists: () => true, data: () => ({username: 'Tester'})}),
        addDoc: async (ref, data) => {
            chats.push({ref, data});
            return {id: 'chat-' + chats.length};
        },
        serverTimestamp: () => 'server-time',
        writeBatch: () => {
            const writes = [];
            return {
                set: (ref, data) => writes.push({ref, data}),
                update() {},
                commit: async () => {
                    if (controls.failSave) throw new Error('Offline');
                    saved.push(...writes);
                }
            };
        },
        fetch: async (_url, options) => {
            const payload = JSON.parse(options.body);
            requests.push(payload);
            assert.equal(get('send-message').disabled, true);
            assert.equal(get('message-input').disabled, true);
            const previousTurns = payload.history.filter(message => message.name !== 'Human').length;
            assert.equal(get('turn-count').textContent,
                previousTurns + ' / ' + (previousTurns + payload.turns));
            assert.ok(get('conversation-screen').classList.contains('active'));
            if (controls.gate) await controls.gate;
            const events = [];
            for (let turn = 0; turn < payload.turns; turn++) {
                const prefix = turn % 2 ? 'model_b' : 'model_a';
                events.push({type: 'responding', name: payload[prefix + '_name'], turn: turn + 1});
                if (controls.error) {
                    events.push({type: 'error', message: 'Provider unavailable'});
                    break;
                }
                events.push({
                    name: payload[prefix + '_name'], role: payload[prefix + '_role'],
                    text: 'Round ' + requests.length + ', reply ' + (turn + 1),
                    time: new Date(Date.now() + turn * 1000).toISOString()
                });
            }
            // Split JSON records across chunks and omit the last newline.
            const bytes = new TextEncoder().encode(events.map(event => JSON.stringify(event)).join('\n'));
            const chunks = [bytes.slice(0, 11), bytes.slice(11, 41), bytes.slice(41)];
            return {ok: true, body: {getReader: () => ({
                read: async () => chunks.length ? {value: chunks.shift(), done: false} : {done: true}
            })}};
        }
    });
    context.window.roleControls = {
        getRoleValue: selector => get(selector.slice(1)).value,
        updateModelCards() {}
    };
    context.window.apiKeys = {
        getRunCredentials: async models => {
            credentialModels.push(models ? Array.from(models) : null);
            return controls.cancel ? null : [
                {model: models?.[0] || 'openai:gpt-4o', apiKey: 'dummy-a'},
                {model: models?.[1] || 'google_genai:gemini-3.5-flash-lite', apiKey: 'dummy-b'}
            ];
        }
    };
    get('initial-prompt').value = 'Plan a garden.';
    get('turn-limit').value = '3';
    get('run-mode').value = '';
    get('model-a-name').value = 'Gardener';
    get('model-b-name').value = 'Reviewer';
    get('model-a-role').value = 'Planner';
    get('model-b-role').value = 'Critic';
    const source = readFileSync(join(root, 'javascript/script.js'), 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
    vm.runInContext(source, context);
    return {
        ...app, controls, requests, saved, chats, credentialModels,
        state: () => JSON.parse(vm.runInContext('JSON.stringify({messages, currentRun, isRunning, savedMessageCount, completedTurns})', context)),
        start: () => get('start-run').emit('click'),
        send: text => { get('message-input').value = text; return get('message-form').emit('submit'); }
    };
}

test('follow-ups retain history/settings, stream another full round, and append to one chat', async () => {
    const app = runBrowser();
    app.get('run-mode').value = 'Debate';
    assert.equal(app.get('send-message').disabled, true);
    await app.start();
    assert.equal(app.get('send-message').disabled, false);
    assert.equal(app.requests[0].history.length, 0);
    for (const feedback of ['Use native plants.', 'Estimate the budget.']) {
        const previous = app.state().messages.length;
        const expectedTurns = app.state().completedTurns + 3;
        // Changing setup must not change the active conversation.
        app.get('turn-limit').value = '1';
        app.get('initial-prompt').value = 'Something unrelated';
        app.get('model-a-name').value = 'Changed name';
        app.get('run-mode').value = 'Brainstorm';
        await app.send(feedback);
        const request = app.requests.at(-1);
        assert.equal(request.turns, 3);
        assert.equal(request.prompt, 'Plan a garden.');
        assert.equal(request.model_a_name, 'Gardener');
        assert.equal(request.mode, 'Debate');
        assert.equal(app.get('run-mode-display').textContent, 'Debate');
        assert.equal(app.get('review-mode').textContent, 'Debate');
        assert.equal(request.history.length, previous + 1);
        assert.equal(request.history.at(-1).text, feedback);
        assert.equal(app.state().messages.length, previous + 4);
        assert.equal(app.get('turn-count').textContent, expectedTurns + ' / ' + expectedTurns);
        assert.ok(!app.context.document.querySelector('#responding-model')?.textContent);
    }
    assert.deepEqual(app.credentialModels[1], ['openai:gpt-4o', 'google_genai:gemini-3.5-flash-lite']);
    assert.equal(app.chats.length, 1);
    assert.equal(app.saved.length, 11);
    assert.ok(app.saved.every(write => write.ref.path.startsWith('chats/chat-1/messages/')));
    assert.ok(!JSON.stringify(app.saved).includes('dummy-'));
    assert.ok(!JSON.stringify(app.state()).includes('dummy-'));
    assert.equal(app.alerts.length, 0);
});

test('each selected mode is sent, displayed, saved, and exported', async () => {
    const app = runBrowser();
    let exported;
    app.context.URL = {
        createObjectURL: blob => { exported = blob; return 'blob:offline-test'; },
        revokeObjectURL() {}
    };
    const modeOptions = html.match(/<select id="run-mode">([\s\S]*?)<\/select>/)[1];
    const modes = [...modeOptions.matchAll(/<option value="([^"]*)"/g)].map(option => option[1]);
    assert.deepEqual(modes, ['', 'Cooperative Task', 'Debate', 'Brainstorm']);
    assert.match(modeOptions, /<option value="" selected>None<\/option>/);
    for (const mode of modes) {
        app.get('run-mode').value = mode;
        await app.start();
        assert.equal(app.requests.at(-1).mode, mode || null);
        assert.equal(app.get('run-mode-display').textContent, mode || 'None');
        assert.equal(app.get('review-mode').textContent, mode || 'None');
        assert.equal(app.chats.at(-1).data.mode, mode || null);
        assert.equal(app.chats.at(-1).data.preview, app.state().messages[0][2]);
        await app.get('export-json').emit('click');
        assert.equal(JSON.parse(await exported.text()).mode, mode || null);
    }
    assert.equal(app.alerts.length, 0);
});

test('the default None mode is retained across follow-up rounds', async () => {
    const app = runBrowser();
    await app.start();
    assert.equal(app.requests[0].mode, null);
    assert.equal(app.get('run-mode-display').textContent, 'None');
    app.get('run-mode').value = 'Debate';
    await app.send('Continue without adding a mode.');
    assert.equal(app.requests.at(-1).mode, null);
    assert.equal(app.state().currentRun.mode, null);
    assert.equal(app.get('run-mode-display').textContent, 'None');
    assert.equal(app.get('review-mode').textContent, 'None');
});

test('six-turn continuations count from 6/12 through 12/12, then 12/18 through 18/18', async () => {
    const app = runBrowser();
    app.get('turn-limit').value = '6';
    await app.start();
    const counter = app.get('turn-count');
    assert.equal(counter.textContent, '6 / 6');
    const updates = [];
    let currentText = counter.textContent;
    Object.defineProperty(counter, 'textContent', {
        get: () => currentText,
        set: value => { currentText = value; updates.push(value); }
    });
    for (const [previous, target] of [[6, 12], [12, 18]]) {
        updates.length = 0;
        await app.send('Continue the conversation.');
        assert.deepEqual(updates, Array.from({length: 7}, (_, turn) =>
            (previous + turn) + ' / ' + target
        ));
        assert.equal(app.state().completedTurns, target);
        assert.ok(app.get('turn-status').textContent.startsWith(
            'Run completed (' + target + ' turns)'
        ));
    }
});

test('empty messages and canceled key entry do not send or change the transcript', async () => {
    const app = runBrowser();
    await app.start();
    await app.send('   ');
    app.controls.cancel = true;
    await app.send('Keep this draft.');
    assert.equal(app.requests.length, 1);
    assert.equal(app.state().messages.length, 3);
    assert.equal(app.get('message-input').value, 'Keep this draft.');
    assert.equal(app.get('send-message').disabled, false);
    assert.equal(app.get('turn-count').textContent, '3 / 3');
});

test('busy guard prevents overlapping rounds and a failed provider unlocks the composer', async () => {
    const app = runBrowser();
    await app.start();
    let release;
    app.controls.gate = new Promise(resolve => { release = resolve; });
    const pending = app.send('Continue.');
    await new Promise(resolve => setImmediate(resolve));
    await app.send('Do not overlap.');
    await app.start();
    assert.equal(app.requests.length, 2);
    release();
    await pending;
    app.controls.gate = null;
    app.controls.error = true;
    await app.send('Try again.');
    assert.equal(app.get('send-message').disabled, false);
    assert.ok(!app.context.document.querySelector('#responding-model')?.textContent);
    assert.ok(app.get('turn-status').textContent.startsWith('Run stopped before completion'));
    assert.deepEqual(app.alerts, ['Provider unavailable']);
});

test('failed saves retry only unsaved messages without creating another chat', async () => {
    const app = runBrowser();
    app.controls.failSave = true;
    await app.start();
    assert.equal(app.saved.length, 0);
    app.controls.failSave = false;
    await app.send('Keep going.');
    assert.equal(app.chats.length, 1);
    assert.equal(app.saved.length, 7);
    await app.send('One more round.');
    assert.equal(app.saved.length, 11);
});

test('a new run resets the transcript and continuation settings', async () => {
    const app = runBrowser();
    await app.start();
    await app.send('Continue.');
    app.get('turn-limit').value = '1';
    app.get('initial-prompt').value = 'Start a different topic.';
    app.get('run-mode').value = 'Brainstorm';
    await app.start();
    assert.equal(app.requests.at(-1).history.length, 0);
    assert.equal(app.state().messages.length, 1);
    assert.equal(app.state().currentRun.turns, 1);
    assert.equal(app.state().currentRun.mode, 'Brainstorm');
    assert.equal(app.state().completedTurns, 1);
    assert.equal(app.get('turn-count').textContent, '1 / 1');
    assert.equal(app.chats.length, 2);
});

test('API key helper uses original model providers, reuses saved keys, and permits cancellation', async () => {
    const app = browser();
    vm.runInContext(readFileSync(join(root, 'javascript/api-keys.js'), 'utf8'), app.context);
    app.storage.set('jash.api-key.google_genai', 'gemini-test-key');
    app.storage.set('jash.api-key.openai', 'openai-test-key');
    const models = ['openai:gpt-4o', 'google_genai:gemini-3.5-flash-lite'];
    const credentials = await app.context.window.apiKeys.getRunCredentials(models);
    assert.deepEqual(Array.from(credentials, item => ({...item})), [
        {model: models[0], apiKey: 'openai-test-key'},
        {model: models[1], apiKey: 'gemini-test-key'}
    ]);
    app.storage.delete('jash.api-key.openai');
    const pending = app.context.window.apiKeys.getRunCredentials(models);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.get('api-key-dialog').open, true);
    assert.equal(app.get('api-key-title').textContent, 'OpenAI API key');
    await app.get('cancel-api-key').emit('click');
    assert.equal(await pending, null);
    assert.equal(app.get('api-key-input').value, '');
});
