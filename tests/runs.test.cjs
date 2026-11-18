const assert = require('node:assert/strict');
const {test} = require('node:test');
const {browser, flush} = require('./browser-harness.cjs');

async function runsBrowser() {
    const app = browser();
    app.storage.set('profile', 'test-user');
    const chats = [
        {
            id: 'new-run', title: 'Garden', prompt: 'Plan a community garden with native plants.',
            model_a_model: 'openai:gpt-4o', mode: 'Debate',
            analysis: {text: 'Saved observation', model: 'openai:gpt-4o', message_count: 2}
        },
        {id: 'old-run', title: 'An older conversation'},
        {id: 'empty-run', title: 'No messages'}
    ];
    const rows = {
        'new-run': [
            {agentId: 'Planner', role: 'Planner', content: 'Use native plants.'},
            {agentId: 'Human', role: 'Moderator', content: 'Consider cost.'}
        ],
        'old-run': [{agentId: 'Model A', role: 'Proposer', content: 'An earlier idea.'}],
        'empty-run': []
    };
    const opens = [];
    const updates = [];
    const controls = {report: null, gates: new Map()};
    Object.assign(app.context, {
        db: {}, usernameSessionKey: 'profile',
        doc: (_db, ...parts) => ({path: parts.join('/')}),
        collection: (_db, ...parts) => ({path: parts.join('/')}),
        query: ref => ref, where() {}, orderBy() {},
        getDoc: async () => ({exists: () => true, data: () => ({username: 'Tester'})}),
        getDocs: async ref => {
            if (ref.path === 'chats') {
                return {docs: chats.map(chat => ({id: chat.id, data: () => ({...chat})}))};
            }
            const id = ref.path.split('/')[1];
            if (controls.gates.has(id)) await controls.gates.get(id);
            const values = rows[id];
            return {empty: values.length === 0, forEach: callback =>
                values.forEach(value => callback({data: () => value}))};
        },
        updateDoc: async (ref, data) => updates.push({ref, data}),
        deleteDoc: async () => {}
    });
    app.context.window.conversationAnalysis = {
        open: async input => {
            opens.push(input);
            if (controls.report) await input.onResult(controls.report);
        }
    };
    app.evaluate('runs.js');
    await flush();
    return {
        ...app, opens, updates, controls,
        select: index => app.get('runs-list').children[index].children[0].emit('click'),
        analyze: () => app.get('analyze-saved-run').emit('click')
    };
}

test('saved-run button analyzes the selected transcript using its saved Model A model', async () => {
    const app = await runsBrowser();
    assert.equal(app.get('analyze-saved-run').disabled, true);
    await app.select(0);
    assert.equal(app.get('run-detail-title').textContent, 'Garden');
    assert.equal(app.get('analyze-saved-run').hidden, false);
    assert.equal(app.get('analyze-saved-run').disabled, false);
    await app.analyze();
    const input = app.opens[0];
    assert.equal(input.model, 'openai:gpt-4o');
    assert.equal(input.prompt, 'Plan a community garden with native plants.');
    assert.equal(input.promptIsComplete, true);
    assert.equal(input.messages.length, 2);
    assert.equal(input.messages[1].name, 'Human');
    assert.equal(input.analysis.text, 'Saved observation');
});

test('older saved runs explicitly request a model and disclose the title-only prompt', async () => {
    const app = await runsBrowser();
    await app.select(1);
    await app.analyze();
    assert.equal(app.opens[0].model, null);
    assert.equal(app.opens[0].promptIsComplete, false);
    assert.equal(app.opens[0].prompt, 'An older conversation');
    assert.equal(app.opens[0].messages[0].text, 'An earlier idea.');
});

test('analysis saves onto the selected chat without saving credentials or adding messages', async () => {
    const app = await runsBrowser();
    await app.select(1);
    app.controls.report = {
        text: 'An observation.', model: 'google_genai:gemini-3.5-flash-lite',
        message_count: 1, time: new Date().toISOString()
    };
    await app.analyze();
    assert.equal(app.updates[0].ref.path, 'chats/old-run');
    assert.equal(app.updates[0].data.analysis.text, 'An observation.');
    assert.equal(app.updates[0].data.model_a_model, 'google_genai:gemini-3.5-flash-lite');
    assert.equal(app.get('run-messages').children.length, 1);
    assert.ok(!JSON.stringify(app.updates).includes('api_key'));
});

test('empty saved runs cannot start an analysis', async () => {
    const app = await runsBrowser();
    await app.select(2);
    assert.equal(app.get('analyze-saved-run').disabled, true);
    await app.analyze();
    assert.equal(app.opens.length, 0);
});

test('late message loads cannot overwrite a newly selected run', async () => {
    const app = await runsBrowser();
    let release;
    app.controls.gates.set('new-run', new Promise(resolve => { release = resolve; }));
    const pending = app.select(0);
    await flush();
    await app.select(1);
    release();
    await pending;
    await app.analyze();
    assert.equal(app.get('run-detail-title').textContent, 'An older conversation');
    assert.equal(app.opens[0].prompt, 'An older conversation');
    assert.equal(app.opens[0].messages.length, 1);
    assert.equal(app.opens[0].messages[0].text, 'An earlier idea.');
});
