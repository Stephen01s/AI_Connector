import {
    addDoc, collection, doc, getDoc, serverTimestamp, writeBatch
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db, usernameSessionKey } from './firebase.js';
import './account.js';

const { getRoleValue, updateModelCards } = window.roleControls;
const API_URL = 'https://ai-connector-szkl.onrender.com';

let messages = [];
let activeChatId = null;
let prompts = [];
let currentRun = null;
let isRunning = false;
let savedMessageCount = 0;
let completedTurns = 0;

function formatMessageTime(time) {
    const date = new Date(time);
    // Keep older clock-only values readable during a server redeploy.
    if (Number.isNaN(date.getTime())) return time;
    return date.toLocaleString();
}

function renderMessages(target) {
    if (!target) return;
    target.replaceChildren(...messages.map(([name, role, text, time]) => {
        const message = document.createElement('article');
        message.className = 'run-message';
        const byline = document.createElement('div');
        byline.className = 'run-message-byline';
        byline.textContent = role ? name + ' · ' + role : name;
        const content = document.createElement('p');
        content.textContent = text;
        const timestamp = document.createElement('time');
        timestamp.textContent = formatMessageTime(time);
        message.append(byline, content, timestamp);
        return message;
    }));
}

function show(name) {
    document.querySelectorAll('.screen').forEach(screen =>
        screen.classList.remove('active')
    );
    document.querySelector('#' + name + '-screen').classList.add('active');
    window.scrollTo(0, 0);
}

function setRespondingModel(name = '') {
    const indicator = document.querySelector('#responding-model');
    if (!indicator) return;
    indicator.textContent = name ? '◌ ' + name + ' is responding...' : '';
    indicator.hidden = !name;
}

function setRunBusy(busy) {
    isRunning = busy;
    const startButton = document.querySelector('#start-run');
    startButton.disabled = busy;
    startButton.textContent = busy ? 'Running...' : 'Start Run';
    document.querySelector('#send-message').disabled = busy || !currentRun;
    document.querySelector('#message-input').disabled = busy || !currentRun;
}

renderMessages(document.querySelector('#messages'));
renderMessages(document.querySelector('#review-messages'));
setRunBusy(false);

document.querySelector('#random-prompt').addEventListener('click', async () => {
    const promptInput = document.querySelector('#initial-prompt');

    try {
        if (!prompts.length) {
            const response = await fetch('../json/prompts.json');
            if (!response.ok) throw new Error('Could not load prompts');
            ({ prompts } = await response.json());
        }

        promptInput.value = prompts[Math.floor(Math.random() * prompts.length)];
        promptInput.focus();
    } catch (error) {
        alert('Could not load a random prompt.');
        console.error(error);
    }
});

document.querySelectorAll('[data-nav]').forEach(button =>
    button.addEventListener('click', () => {
        if (button.dataset.nav === 'runs') {
            window.location.href = 'runs.html';
        } else if (button.dataset.nav === 'community') {
            window.location.href = 'community.html';
        } else {
            show('setup');
        }
    })
);

document.querySelector('#start-run').addEventListener('click', async () => {
    if (isRunning) return;
    const prompt = document.querySelector('#initial-prompt').value.trim();
    const turns = Number(document.querySelector('#turn-limit').value);
    const modelAName = document.querySelector('#model-a-name').value.trim();
    const modelBName = document.querySelector('#model-b-name').value.trim();
    const modelARole = getRoleValue('#model-a-role');
    const modelBRole = getRoleValue('#model-b-role');

    if (!prompt) {
        alert('Please enter an initial prompt first.');
        return;
    }
    if (!document.querySelector('#turn-limit').reportValidity()) return;

    for (const select of document.querySelectorAll('[data-custom-role-input]')) {
        if (select.value !== 'custom') continue;
        const input = document.getElementById(select.dataset.customRoleInput);
        input.setCustomValidity(input.value.trim() ? '' : 'Please enter a custom role.');
        if (!input.reportValidity()) return;
    }

    setRunBusy(true);
    try {
        const credentials = await window.apiKeys.getRunCredentials();
        if (!credentials) return;
        const [modelA, modelB] = credentials;
        // Keep the run's settings, but read keys from session storage each round.
        currentRun = {
            prompt,
            turns,
            model_a_name: modelAName,
            model_b_name: modelBName,
            model_a_role: modelARole,
            model_b_role: modelBRole,
            model_a_model: modelA.model,
            model_b_model: modelB.model
        };
        updateModelCards();
        messages = [];
        activeChatId = null;
        savedMessageCount = 0;
        completedTurns = 0;
        document.querySelector('#message-input').value = '';
        renderMessages(document.querySelector('#messages'));
        renderMessages(document.querySelector('#review-messages'));
        document.querySelector('#run-prompt').textContent = prompt;
        document.querySelector('#turn-status').textContent = 'Run in progress...';
        document.querySelector('#turn-count').textContent = '0 / ' + turns;
        setRespondingModel();
        show('conversation');
        // Paint the conversation screen before starting a slow model request.
        await new Promise(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
        );
        await runConversationRound(credentials);
    } catch {
        alert('Could not prepare the run. Refresh the page and try again.');
    } finally {
        setRunBusy(false);
    }
});

async function runConversationRound([modelA, modelB]) {
    const {turns} = currentRun;
    // Each follow-up adds another round to the conversation's AI turn count.
    const targetTurns = completedTurns + turns;
    document.querySelector('#turn-status').textContent = 'Run in progress...';
    document.querySelector('#turn-count').textContent = completedTurns + ' / ' + targetTurns;
    setRespondingModel();

    try {
        const response = await fetch(API_URL + '/api/run/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...currentRun,
                history: messages.map(([name, role, text]) => ({name, role, text})),
                model_a_api_key: modelA.apiKey,
                model_b_api_key: modelB.apiKey
            })
        });
        if (!response.ok) {
            throw new Error('Could not start the run. Check your model selections and API keys, then try again.');
        }

        if (!response.body) throw new Error('Streaming is not supported by this browser');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        function handleRunEvent(event) {
            if (event.type === 'error') {
                throw new Error(event.message);
            }
            if (event.type === 'responding') {
                setRespondingModel(completedTurns < targetTurns ? event.name : '');
                return;
            }

            messages.push([
                event.name, event.role, event.text, event.time
            ]);
            completedTurns += 1;
            renderMessages(document.querySelector('#messages'));
            renderMessages(document.querySelector('#review-messages'));
            document.querySelector('#turn-status').textContent =
                event.name + ' responded (' + completedTurns + ' turns)';
            document.querySelector('#turn-count').textContent =
                completedTurns + ' / ' + targetTurns;
            setRespondingModel();
        }

        while (true) {
            const { value, done } = await reader.read();
            buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.trim()) continue;
                handleRunEvent(JSON.parse(line));
            }

            if (done) break;
        }

        if (buffer.trim()) {
            handleRunEvent(JSON.parse(buffer));
        }

        document.querySelector('#turn-status').textContent =
            'Run completed (' + completedTurns + ' turns)';
    } catch (error) {
        setRespondingModel();
        document.querySelector('#turn-status').textContent =
            'Run stopped before completion';
        alert(error.message || 'Could not complete the conversation. Please try again.');
    } finally {
        setRespondingModel();
        // Save visible messages, including partial rounds, without duplicating
        // messages from earlier rounds.
        if (messages.length > savedMessageCount) await saveRun();
    }
}

async function saveRun() {
    const profileId = localStorage.getItem(usernameSessionKey);
    if (!profileId) return null;

    try {
        if (!activeChatId) {
            const profile = await getDoc(doc(db, 'users', profileId));
            if (!profile.exists()) return;
            const username = profile.data().username || profileId;
            const {prompt} = currentRun;
            const chat = await addDoc(collection(db, 'chats'), {
                userId: profileId,
                username,
                title: prompt.length > 70 ? `${prompt.slice(0, 67)}…` : prompt,
                preview: runMessages[0]?.text?.slice(0, 120) || '',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            activeChatId = chat.id;
        }

        const batch = writeBatch(db);
        for (const [name, role, text, time] of messages.slice(savedMessageCount)) {
            batch.set(doc(collection(db, 'chats', activeChatId, 'messages')), {
                role: role || 'assistant',
                agentId: name || null,
                content: text || '',
                // A batch shares one server timestamp; retain actual message
                // times so saved conversations stay in chronological order.
                timestamp: new Date(time)
            });
        }
        batch.update(doc(db, 'chats', activeChatId), {updatedAt: serverTimestamp()});
        await batch.commit();
        savedMessageCount = messages.length;
        document.querySelector('#turn-status').textContent += ' · Saved to your runs';
    } catch (error) {
        console.error('Could not save run to Firestore:', error);
        document.querySelector('#turn-status').textContent += ' · Could not save to your runs';
        return null;
    }
}

document.querySelector('#message-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (isRunning || !currentRun) return;
    const input = document.querySelector('#message-input');
    if (!input.value.trim()) return;
    const content = input.value.trim();

    setRunBusy(true);
    try {
        const credentials = await window.apiKeys.getRunCredentials([
            currentRun.model_a_model, currentRun.model_b_model
        ]);
        // Leave the draft and transcript unchanged if key entry is canceled.
        if (!credentials) return;
        messages.push(['Human', 'Moderator', content, new Date().toISOString()]);
        renderMessages(document.querySelector('#messages'));
        renderMessages(document.querySelector('#review-messages'));
        input.value = '';
        await runConversationRound(credentials);
    } catch {
        alert('Could not prepare the follow-up. Your message has not been sent.');
    } finally {
        setRunBusy(false);
        input.focus();
    }
});

document.querySelector('#save-local').addEventListener('click', () =>
    alert('Run saved locally.')
);

document.querySelector('#export-json').addEventListener('click', () => {
    const blob = new Blob([
        JSON.stringify({ mode: 'Cooperative Task', messages }, null, 2)
    ], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'jash-run.json';
    link.click();
    URL.revokeObjectURL(url);
});

document.querySelector('#delete-run').addEventListener('click', () => {
    if (confirm('Delete this run?')) show('setup');
});
