const assert = require('node:assert/strict');
const {test} = require('node:test');
const vm = require('node:vm');
const {browser, flush} = require('./browser-harness.cjs');

async function communityBrowser() {
    const app = browser('community.html');
    const publishedReport = {
        text: 'Published report', model: 'openai:gpt-4o', message_count: 2
    };
    const chats = {
        garden: {
            title: 'Garden', prompt: 'Plan an accessible community garden.',
            isPublic: true, username: 'Owner', preview: 'Plant native species.',
            model_a_model: 'openai:gpt-4o', mode: 'Debate', analysis: publishedReport
        },
        legacy: {
            title: 'An older discussion', isPublic: true, preview: 'An old idea.'
        },
        empty: {title: 'No messages', isPublic: true, preview: 'No messages'},
        private: {title: 'Private chat', isPublic: false}
    };
    const rows = {
        garden: [
            {agentId: 'Planner', role: 'Planner', content: 'Plant native species.'},
            {agentId: 'Human', role: 'Moderator', content: 'Make it accessible.'}
        ],
        legacy: [{agentId: 'A', role: 'Researcher', content: 'An old idea.'}],
        empty: []
    };
    const opens = [];
    const writes = [];
    const comments = new Map();
    const commentSubmit = new app.Element('button');
    commentSubmit.type = 'submit';
    // The lightweight DOM does not parse nested form markup.
    app.get('community-comment-form').querySelector = selector =>
        selector === 'button[type="submit"]' ? commentSubmit : null;
    const controls = {
        report: null, gates: new Map(), failMessages: false,
        commentGates: new Map(), failComments: false
    };
    Object.assign(app.context, {
        db: {}, auth: {currentUser: null}, usernameSessionKey: 'profile',
        onAuthStateChanged: (_auth, callback) => { callback(); return () => {}; },
        doc: (ref, ...parts) => parts.length
            ? {path: parts.join('/'), id: parts.at(-1)}
            : {path: ref.path + '/test-comment', id: 'test-comment'},
        collection: (_db, ...parts) => ({path: parts.join('/')}),
        query: (ref, ...conditions) => ({...ref, conditions}),
        where: (field, _operator, value) => ({field, value}),
        orderBy() {}, limit() {},
        getDoc: async ref => {
            const chat = chats[ref.path.split('/')[1]];
            return {exists: () => Boolean(chat), data: () => chat};
        },
        getDocs: async ref => {
            if (ref.path === 'comments') {
                const postId = ref.conditions.find(item => item?.field === 'postId')?.value;
                if (controls.commentGates.has(postId)) await controls.commentGates.get(postId);
                if (controls.failComments) throw new Error('Comments unavailable');
                const docs = (comments.get(postId) || []).map(comment => ({data: () => comment}));
                return {docs, empty: !docs.length};
            }
            if (ref.path === 'chats') return {
                docs: Object.entries(chats).filter(([, chat]) => chat.isPublic)
                    .map(([id, chat]) => ({id, data: () => chat}))
            };
            const id = ref.path.split('/')[1];
            if (controls.gates.has(id)) await controls.gates.get(id);
            if (controls.failMessages) throw new Error('Read failed');
            const docs = (rows[id] || []).map(row => ({data: () => row}));
            return {docs, empty: !docs.length, forEach: callback => docs.forEach(callback)};
        },
        updateDoc: async (...args) => writes.push(args),
        serverTimestamp: () => new Date(),
        setDoc: async (ref, data) => {
            writes.push({ref, data});
            comments.set(data.postId, [...(comments.get(data.postId) || []), data]);
        }
    });
    app.context.window.conversationAnalysis = {
        open: async input => {
            opens.push(input);
            if (controls.report) await input.onResult(controls.report);
        }
    };
    app.evaluate('community.js');
    await flush();
    return {
        ...app, chats, publishedReport, opens, writes, controls, comments, commentSubmit,
        select: id => {
            app.context.testChatId = id;
            return vm.runInContext('showPublicChat(testChatId)', app.context);
        },
        analyze: () => app.get('analyze-community').emit('click'),
        close: () => app.get('community-back').emit('click')
    };
}

test('Community hides analysis until a public conversation is selected', async () => {
    const app = await communityBrowser();
    assert.equal(app.get('analyze-community').hidden, true);
    await app.analyze();
    assert.equal(app.opens.length, 0);
    await app.select('garden');
    assert.equal(app.get('analyze-community').hidden, false);
    assert.equal(app.get('analyze-community').disabled, false);
    assert.equal(app.get('analyze-community').textContent, 'View analysis');
    await app.analyze();
    const input = app.opens[0];
    assert.equal(input.model, 'openai:gpt-4o');
    assert.equal(input.prompt, 'Plan an accessible community garden.');
    assert.equal(input.promptIsComplete, true);
    assert.equal(input.messages.length, 2);
    assert.equal(input.messages[1].name, 'Human');
    assert.equal(input.analysis.text, 'Published report');
});

test('analysis is available before a slow comments request completes', async () => {
    const app = await communityBrowser();
    let release;
    app.controls.commentGates.set('garden', new Promise(resolve => { release = resolve; }));
    const pending = app.select('garden');
    await flush();
    assert.equal(app.get('analyze-community').hidden, false);
    assert.equal(app.get('analyze-community').disabled, false);
    await app.analyze();
    assert.equal(app.opens[0].messages.length, 2);
    release();
    await pending;
    assert.equal(app.get('community-detail-title').textContent, 'Garden');
});

test('comments failures do not hide the conversation analysis action', async () => {
    const app = await communityBrowser();
    app.controls.failComments = true;
    await app.select('garden');
    assert.equal(app.get('analyze-community').hidden, false);
    assert.equal(app.get('analyze-community').disabled, false);
    assert.equal(app.get('community-detail-title').textContent, 'Garden');
    assert.equal(app.get('community-comment-list').children[0].textContent, 'Comments could not be loaded.');
    await app.analyze();
    assert.equal(app.opens[0].messages.length, 2);
});

test('late comments cannot switch the analysis target back to an older conversation', async () => {
    const app = await communityBrowser();
    let release;
    app.controls.commentGates.set('garden', new Promise(resolve => { release = resolve; }));
    const pending = app.select('garden');
    await flush();
    await app.select('legacy');
    release();
    await pending;
    await app.analyze();
    assert.equal(app.get('community-detail-title').textContent, 'An older discussion');
    assert.equal(app.opens[0].messages.length, 1);
    assert.equal(app.opens[0].messages[0].text, 'An old idea.');
});

test('comment posting still works without adding comments to the AI transcript', async () => {
    const app = await communityBrowser();
    app.context.auth.currentUser = {uid: 'viewer', displayName: 'Reader'};
    await app.select('garden');
    app.get('community-comment-input').value = 'An interesting conversation.';
    await app.get('community-comment-form').emit('submit');
    assert.equal(app.writes.length, 1);
    assert.equal(app.writes[0].data.postId, 'garden');
    assert.equal(app.writes[0].data.comment, 'An interesting conversation.');
    assert.equal(app.get('community-comment-input').value, '');
    assert.equal(app.get('community-comment-status').textContent, 'Comment posted.');
    assert.equal(app.get('community-comment-list').children.length, 1);
    await app.analyze();
    assert.equal(app.opens[0].messages.length, 2);
    assert.ok(app.opens[0].messages.every(message => message.text !== 'An interesting conversation.'));
});

test('Community caches viewer analyses without modifying the published conversation', async () => {
    const app = await communityBrowser();
    await app.select('garden');
    app.controls.report = {
        text: 'My own observer report', model: 'openai:gpt-4o', message_count: 2
    };
    await app.analyze();
    assert.equal(app.writes.length, 0);
    assert.equal(app.chats.garden.analysis.text, 'Published report');
    await app.close();
    assert.equal(app.get('analyze-community').hidden, true);
    app.controls.report = null;
    await app.select('garden');
    await app.analyze();
    assert.equal(app.opens[1].analysis.text, 'My own observer report');
});

test('older Community conversations use the shared model/key selection flow', async () => {
    const app = await communityBrowser();
    await app.select('legacy');
    await app.analyze();
    assert.equal(app.opens[0].model, null);
    assert.equal(app.opens[0].promptIsComplete, false);
    assert.equal(app.opens[0].prompt, 'An older discussion');
});

test('closing, switching modes, and unavailable conversations clear the analysis selection', async () => {
    const app = await communityBrowser();
    await app.select('garden');
    await app.close();
    await app.analyze();
    assert.equal(app.opens.length, 0);
    assert.equal(app.get('analyze-community').hidden, true);
    await app.get('community-demo-btn').emit('click');
    await app.select('demo-mars');
    assert.equal(app.get('analyze-community').hidden, false);
    await app.analyze();
    assert.equal(app.opens[0].messages.length, 3);
    await app.get('community-real-btn').emit('click');
    assert.equal(app.get('analyze-community').hidden, true);
    await app.select('garden');
    await app.select('private');
    assert.equal(app.get('analyze-community').hidden, true);
    await app.select('missing');
    assert.equal(app.get('analyze-community').hidden, true);
});

test('empty public conversations show a disabled button and load failures leave it hidden', async () => {
    const app = await communityBrowser();
    await app.select('empty');
    assert.equal(app.get('analyze-community').hidden, false);
    assert.equal(app.get('analyze-community').disabled, true);
    await app.analyze();
    assert.equal(app.opens.length, 0);
    app.controls.failMessages = true;
    await app.select('garden');
    assert.equal(app.get('analyze-community').hidden, true);
});

test('closing a loading Community popup cannot reveal a stale analysis button', async () => {
    const app = await communityBrowser();
    let release;
    app.controls.gates.set('garden', new Promise(resolve => { release = resolve; }));
    const pending = app.select('garden');
    await flush();
    assert.equal(app.get('analyze-community').hidden, true);
    await app.close();
    release();
    await pending;
    assert.equal(app.get('community-detail').hidden, true);
    assert.equal(app.get('analyze-community').hidden, true);
    await app.analyze();
    assert.equal(app.opens.length, 0);
});

test('rapid Community selection changes cannot mix conversations', async () => {
    const app = await communityBrowser();
    let release;
    app.controls.gates.set('garden', new Promise(resolve => { release = resolve; }));
    const pending = app.select('garden');
    await flush();
    await app.select('legacy');
    release();
    await pending;
    await app.analyze();
    assert.equal(app.get('community-detail-title').textContent, 'An older discussion');
    assert.equal(app.opens[0].messages.length, 1);
    assert.equal(app.opens[0].messages[0].text, 'An old idea.');
});

test('Escape in the observer or key modal does not close the selected Community conversation', async () => {
    const app = await communityBrowser();
    await app.select('garden');
    const observerDialog = new app.Element('dialog');
    app.elements.set('analysis-dialog', observerDialog);
    observerDialog.open = true;
    await app.documentEvents.emit('keydown', {key: 'Escape'});
    assert.equal(app.get('community-detail').hidden, false);
    observerDialog.open = false;
    const keyDialog = new app.Element('dialog');
    app.elements.set('api-key-dialog', keyDialog);
    keyDialog.open = true;
    await app.documentEvents.emit('keydown', {key: 'Escape'});
    assert.equal(app.get('community-detail').hidden, false);
    keyDialog.open = false;
    await app.documentEvents.emit('keydown', {key: 'Escape'});
    assert.equal(app.get('community-detail').hidden, true);
    assert.equal(app.get('analyze-community').hidden, true);
});
