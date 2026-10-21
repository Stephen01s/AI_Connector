import {
    addDoc, collection, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db, usernameSessionKey } from './firebase.js';
import './account.js';

const {getRoleValue, updateModelCards} = window.roleControls;
<<<<<<< HEAD
const API_URL = 'http://localhost:8000';
const themeToggle = document.querySelector('#theme-toggle');
const savedTheme = localStorage.getItem('jash-theme');
if (savedTheme === 'dark') document.body.classList.add('dark-mode');
if (themeToggle) {
    const updateThemeToggle = () => {
        const darkMode = document.body.classList.contains('dark-mode');
        themeToggle.textContent = darkMode ? '☀' : '☾';
        themeToggle.setAttribute('aria-label', darkMode ? 'Disable dark mode' : 'Enable dark mode');
        themeToggle.setAttribute('aria-pressed', String(darkMode));
    };
    updateThemeToggle();
    themeToggle.addEventListener('click', () => {
        const darkMode = document.body.classList.toggle('dark-mode');
        localStorage.setItem('jash-theme', darkMode ? 'dark' : 'light');
        updateThemeToggle();
    });
}
=======
const API_URL = 'https://ai-connector-szkl.onrender.com';
>>>>>>> 848dd1bd29b57eff6c8142c3066888c52177aaf0
let messages = [];
let activeChatId = null;
let prompts = [];

function renderMessages(target) {
    if (!target) return;
    target.replaceChildren(...messages.map(([name, role, text, time]) => {
        const message = document.createElement('div');
        message.className = 'message';
        message.innerHTML = '<div class="avatar"></div>' +
            '<div><strong><span></span> <small style="display:inline"></small></strong>' +
            '<p></p></div><span class="time"></span>';
        message.querySelector('.avatar').textContent = name[0];
        message.querySelector('strong span').textContent = name;
        message.querySelector('small').textContent = '(' + role + ')';
        message.querySelector('p').textContent = text;
        message.querySelector('.time').textContent = time;
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
    indicator.textContent = name ? '◌ ' + name + ' is responding...' : '';
    indicator.hidden = !name;
}

renderMessages(document.querySelector('#messages'));
renderMessages(document.querySelector('#review-messages'));

document.querySelector('#random-prompt').addEventListener('click', async () => {
    const promptInput = document.querySelector('#initial-prompt');

    try {
        if (!prompts.length) {
            const response = await fetch('../json/prompts.json');
            if (!response.ok) throw new Error('Could not load prompts');
            ({prompts} = await response.json());
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
    const prompt = document.querySelector('#initial-prompt').value.trim();
    const turns = Number(document.querySelector('#turn-limit').value);
    const modelAName = document.querySelector('#model-a-name').value.trim();
    const modelBName = document.querySelector('#model-b-name').value.trim();
    const modelARole = getRoleValue('#model-a-role');
    const modelBRole = getRoleValue('#model-b-role');
    const startButton = document.querySelector('#start-run');

    if (!prompt) {
        alert('Please enter an initial prompt first.');
        return;
    }

    for (const select of document.querySelectorAll('[data-custom-role-input]')) {
        if (select.value !== 'custom') continue;
        const input = document.getElementById(select.dataset.customRoleInput);
        input.setCustomValidity(input.value.trim() ? '' : 'Please enter a custom role.');
        if (!input.reportValidity()) return;
    }

    let credentials;
    startButton.disabled = true;
    try {
        credentials = await window.apiKeys.getRunCredentials();
    } catch {
        alert('Could not open the API-key dialog. Refresh the page and try again.');
        return;
    } finally {
        startButton.disabled = false;
    }
    if (!credentials) return;
    const [modelA, modelB] = credentials;

    updateModelCards();
    startButton.disabled = true;
    startButton.textContent = 'Running...';
    messages = [];
    activeChatId = null;
    renderMessages(document.querySelector('#messages'));
    renderMessages(document.querySelector('#review-messages'));
    document.querySelector('#turn-status').textContent = 'Run in progress...';
    document.querySelector('#turn-count').textContent = '0 / ' + turns;
    setRespondingModel();
    show('conversation');
    // Let the browser paint the conversation screen before starting the
    // request that may take several seconds.
    await new Promise(resolve =>
        requestAnimationFrame(() =>
            requestAnimationFrame(resolve)
        )
    );

    try {
        const response = await fetch(API_URL + '/api/run/stream', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                prompt,
                turns,
                model_a_name: modelAName,
                model_b_name: modelBName,
                model_a_role: modelARole,
                model_b_role: modelBRole,
                model_a_model: modelA.model,
                model_b_model: modelB.model,
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
        let completedTurns = 0;

        function handleRunEvent(event) {
            if (event.type === 'error') {
                throw new Error(event.message);
            }
            if (event.type === 'responding') {
                setRespondingModel(completedTurns < turns ? event.name : '');
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
                completedTurns + ' / ' + turns;
            setRespondingModel();
        }

        while (true) {
            const {value, done} = await reader.read();
            buffer += decoder.decode(value || new Uint8Array(), {stream: !done});

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
        activeChatId = await saveRun(prompt, messages.map(([name, role, text]) => ({
            name, role, text
        })));
    } catch (error) {
        setRespondingModel();
        document.querySelector('#turn-status').textContent =
            'Run stopped before completion';
        alert(error.message || 'Could not complete the conversation. Please try again.');
    } finally {
        setRespondingModel();
        startButton.disabled = false;
        startButton.textContent = 'Start Run';
    }
});

async function saveRun(prompt, runMessages) {
    const username = localStorage.getItem(usernameSessionKey);
    if (!username) return null;

    try {
        const chat = await addDoc(collection(db, 'chats'), {
            userId: username,
            username,
            title: prompt.length > 70 ? `${prompt.slice(0, 67)}…` : prompt,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        await Promise.all(runMessages.map(message => addDoc(
            collection(db, 'chats', chat.id, 'messages'),
            {
                role: message.role || 'assistant',
                agentId: message.name || null,
                content: message.text || '',
                timestamp: serverTimestamp()
            }
        )));
        document.querySelector('#turn-status').textContent += ' · Saved to your runs';
        return chat.id;
    } catch (error) {
        console.error('Could not save run to Firestore:', error);
        document.querySelector('#turn-status').textContent += ' · Could not save to your runs';
        return null;
    }
}

document.querySelector('#send-message').addEventListener('click', () => {
    const input = document.querySelector('#message-input');
    if (!input.value.trim()) return;
    const content = input.value.trim();
    messages.push(['Human', 'Moderator', content, new Date().toLocaleTimeString()]);
    renderMessages(document.querySelector('#messages'));
    input.value = '';
    if (activeChatId) {
        addDoc(collection(db, 'chats', activeChatId, 'messages'), {
            role: 'Moderator',
            agentId: 'Human',
            content,
            timestamp: serverTimestamp()
        }).catch(error => console.error('Could not save moderator message:', error));
    }
});

document.querySelector('#save-local').addEventListener('click', () =>
    alert('Run saved locally.')
);

document.querySelector('#export-json').addEventListener('click', () => {
    const blob = new Blob([
        JSON.stringify({mode: 'Cooperative Task', messages}, null, 2)
    ], {type: 'application/json'});
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
