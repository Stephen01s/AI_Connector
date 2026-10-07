import {
    addDoc, collection, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db, usernameSessionKey } from './firebase.js';

const API_URL = 'http://localhost:8000';
let messages = [];
let activeChatId = null;
let prompts = [];

const currentUsername = localStorage.getItem(usernameSessionKey);
const signInNav = document.querySelector('#sign-in-nav');
signInNav.textContent = currentUsername ? `Sign Out · ${currentUsername}` : 'Sign In';
signInNav.addEventListener('click', () => {
    if (currentUsername) {
        localStorage.removeItem(usernameSessionKey);
        window.location.reload();
    } else {
        window.location.href = 'sign-in.html';
    }
});

function renderMessages(target) {
    if (!target) return;
    target.innerHTML = messages.map(([name, role, text, time]) =>
        '<div class="message">' +
            '<div class="avatar">' + name[0] + '</div>' +
            '<div><strong>' + name +
                ' <small style="display:inline">(' + role + ')</small></strong>' +
                '<p>' + text + '</p></div>' +
            '<span class="time">' + time + '</span>' +
        '</div>'
    ).join('');
}

function show(name) {
    document.querySelectorAll('.screen').forEach(screen =>
        screen.classList.remove('active')
    );
    document.querySelector('#' + name + '-screen').classList.add('active');
    window.scrollTo(0, 0);
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
        } else {
            show('setup');
        }
    })
);

document.querySelector('#start-run').addEventListener('click', async () => {
    const prompt = document.querySelector('#initial-prompt').value.trim();
    const turns = Number(document.querySelector('#turn-limit').value);
    const startButton = document.querySelector('#start-run');

    if (!prompt) {
        alert('Please enter an initial prompt first.');
        return;
    }

    startButton.disabled = true;
    startButton.textContent = 'Running...';
    messages = [];
    activeChatId = null;
    renderMessages(document.querySelector('#messages'));
    renderMessages(document.querySelector('#review-messages'));
    document.querySelector('#turn-status').textContent = 'Run in progress...';
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
            body: JSON.stringify({prompt, turns})
        });
        if (!response.ok) throw new Error('Server returned ' + response.status);

        if (!response.body) throw new Error('Streaming is not supported by this browser');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const {value, done} = await reader.read();
            buffer += decoder.decode(value || new Uint8Array(), {stream: !done});

            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.trim()) continue;
                const message = JSON.parse(line);
                messages.push([
                    message.name, message.role, message.text, message.time
                ]);
                renderMessages(document.querySelector('#messages'));
                renderMessages(document.querySelector('#review-messages'));
                document.querySelector('#turn-status').textContent =
                    message.name + ' responded (' + messages.length + ' turns)';
            }

            if (done) break;
        }

        if (buffer.trim()) {
            const message = JSON.parse(buffer);
            messages.push([
                message.name, message.role, message.text, message.time
            ]);
            renderMessages(document.querySelector('#messages'));
            renderMessages(document.querySelector('#review-messages'));
        }

        document.querySelector('#turn-status').textContent =
            'Run completed (' + messages.length + ' turns)';
        activeChatId = await saveRun(prompt, messages.map(([name, role, text]) => ({
            name, role, text
        })));
    } catch (error) {
        document.querySelector('#turn-status').textContent =
            'Run stopped before completion';
        alert('Could not complete the conversation. Start the Python server with: uvicorn server:app --app-dir python --reload');
        console.error(error);
    } finally {
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
