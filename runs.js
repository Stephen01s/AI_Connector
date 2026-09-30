import {
    collection, getDocs, query, where, orderBy
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db, usernameSessionKey } from './firebase.js';

const username = localStorage.getItem(usernameSessionKey);
const status = document.querySelector('#runs-status');
const runsList = document.querySelector('#runs-list');
const runMessages = document.querySelector('#run-messages');
const detailTitle = document.querySelector('#run-detail-title');
const detailEmpty = document.querySelector('#run-detail-empty');

document.querySelectorAll('[data-page]').forEach(button => {
    button.addEventListener('click', () => {
        window.location.href = button.dataset.page;
    });
});

document.querySelector('#sign-out').addEventListener('click', () => {
    localStorage.removeItem(usernameSessionKey);
    window.location.href = 'index.html';
});

if (!username) {
    window.location.replace('sign-in.html');
} else {
    document.querySelector('#runs-description').textContent = `Previous conversations for ${username}.`;
    loadRuns().catch(error => {
        console.error('Could not load runs:', error);
        status.textContent = 'Could not load your runs. Please refresh to try again.';
    });
}

async function loadRuns() {
    const runsQuery = query(collection(db, 'chats'), where('userId', '==', username));
    const snapshot = await getDocs(runsQuery);
    const chats = snapshot.docs.map(chat => ({ id: chat.id, ...chat.data() }));
    chats.sort((a, b) => timestampMillis(b.updatedAt || b.createdAt) - timestampMillis(a.updatedAt || a.createdAt));

    runsList.replaceChildren();
    if (chats.length === 0) {
        status.textContent = 'No saved chats yet. Start a run from Home while signed in to save one.';
        return;
    }

    chats.forEach(chat => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'run-list-card';
        button.dataset.chatId = chat.id;

        const title = document.createElement('strong');
        title.textContent = chat.title || 'Untitled run';
        const date = document.createElement('small');
        date.textContent = formatTimestamp(chat.updatedAt || chat.createdAt);
        button.append(title, date);
        button.addEventListener('click', () => selectRun(chat).catch(error => {
            console.error('Could not load conversation:', error);
            status.textContent = 'Could not load that conversation.';
        }));
        runsList.append(button);
    });
    status.textContent = `${chats.length} saved chat${chats.length === 1 ? '' : 's'}.`;
}

async function selectRun(chat) {
    runsList.querySelectorAll('.run-list-card').forEach(button => {
        button.classList.toggle('selected', button.dataset.chatId === chat.id);
    });
    detailTitle.textContent = chat.title || 'Untitled run';
    detailEmpty.hidden = true;
    runMessages.replaceChildren();

    const messagesQuery = query(
        collection(db, 'chats', chat.id, 'messages'),
        orderBy('timestamp', 'asc')
    );
    const snapshot = await getDocs(messagesQuery);
    if (snapshot.empty) {
        detailEmpty.textContent = 'This chat has no saved messages.';
        detailEmpty.hidden = false;
        return;
    }

    snapshot.forEach(message => {
        const data = message.data();
        const row = document.createElement('article');
        row.className = 'run-message';
        const byline = document.createElement('div');
        byline.className = 'run-message-byline';
        byline.textContent = `${data.agentId ? `${data.agentId} · ` : ''}${data.role || 'message'}`;
        const content = document.createElement('p');
        content.textContent = data.content || '';
        const time = document.createElement('time');
        time.textContent = formatTimestamp(data.timestamp);
        row.append(byline, content, time);
        runMessages.append(row);
    });
}

function timestampMillis(value) {
    return value?.toDate ? value.toDate().getTime() : 0;
}

function formatTimestamp(value) {
    if (!value?.toDate) return 'Date unavailable';
    return value.toDate().toLocaleString();
}
