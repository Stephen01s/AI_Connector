
import {collection, doc, getDoc, getDocs, orderBy, query, where} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from './firebase.js';
import './account.js';

const communityList = document.querySelector('#community-list');
const communityDetail = document.querySelector('#community-detail');
const detailTitle = document.querySelector('#community-detail-title');
const detailAuthor = document.querySelector('#community-detail-author');
const communityMessages = document.querySelector('#community-messages');
const backButton = document.querySelector('#community-back');
const realButton = document.querySelector('#community-real-btn');
const demoButton = document.querySelector('#community-demo-btn');

let currentMode = 'real'; 
let requestVersion = 0;

const demoChats = [
    {
        id: 'demo-mars',
        title: 'Could Humans Live on Mars?',
        username: 'SkyExplorer',
        createdAt: new Date('2026-10-26T14:30:00'),
        messages: [
            {
                agentId: 'Model A',
                role: 'Researcher',
                content: 'Humans could potentially live on Mars, but they would need reliable shelter, oxygen, water, and food.',
                timestamp: new Date('2026-10-26T14:30:00')
            },
            {
                agentId: 'Model B',
                role: 'Critic',
                content: 'Radiation exposure and the extremely thin atmosphere would make long-term survival difficult.',
                timestamp: new Date('2026-10-26T14:31:00')
            },
            {
                agentId: 'Model A',
                role: 'Researcher',
                content: 'Underground habitats and improved life-support technology could help solve some of these problems.',
                timestamp: new Date('2026-10-26T14:32:00')
            }
        ]
    },
    {
        id: 'demo-ocean',
        title: 'How Can We Protect Ocean Wildlife?',
        username: 'BlueCurrent',
        createdAt: new Date('2026-10-24T10:00:00'),
        messages: [
            {
                agentId: 'Model A',
                role: 'Planner',
                content: 'Reducing plastic pollution and protecting marine habitats are important steps toward conserving ocean wildlife.',
                timestamp: new Date('2026-10-24T10:00:00')
            },
            {
                agentId: 'Model B',
                role: 'Researcher',
                content: 'Marine protected areas can help ecosystems recover by limiting harmful human activities.',
                timestamp: new Date('2026-10-24T10:01:00')
            },
            {
                agentId: 'Model A',
                role: 'Planner',
                content: 'Community cleanups, sustainable fishing, and public education can also make a difference.',
                timestamp: new Date('2026-10-24T10:02:00')
            }
        ]
    },
    {
        id: 'demo-programming',
        title: 'Best Ways to Learn Programming',
        username: 'CodeBuilder',
        createdAt: new Date('2026-10-22T16:15:00'),
        messages: [
            {
                agentId: 'Model A',
                role: 'Researcher',
                content: 'One of the best ways to learn programming is to build small projects while studying the fundamentals.',
                timestamp: new Date('2026-10-22T16:15:00')
            },
            {
                agentId: 'Model B',
                role: 'Critic',
                content: 'Tutorials are useful, but relying on them too much can prevent independent problem-solving.',
                timestamp: new Date('2026-10-22T16:16:00')
            },
            {
                agentId: 'Model A',
                role: 'Researcher',
                content: 'A combination of practice, debugging, documentation, and personal projects provides a strong learning experience.',
                timestamp: new Date('2026-10-22T16:17:00')
            }
        ]
    }
];

document.querySelectorAll('[data-page]').forEach(button => {
    button.addEventListener('click', () => {window.location.href = button.dataset.page;});
});

function updateModeButtons() {
    const isReal = currentMode === 'real';

    realButton.classList.toggle('active', isReal);
    demoButton.classList.toggle('active', !isReal);

    realButton.setAttribute('aria-pressed', String(isReal));
    demoButton.setAttribute('aria-pressed', String(!isReal));
}

function setCommunityMode(mode) {
    if (currentMode === mode) {
        return;
    }

    currentMode = mode;
    updateModeButtons();

    closeCommunityPopup();
    loadCommunity();
}

realButton.addEventListener('click', () => {
    setCommunityMode('real');
});

demoButton.addEventListener('click', () => {
    setCommunityMode('demo');
});

function closeCommunityPopup() {
    history.replaceState(null, '', 'community.html');

    communityDetail.hidden = true;
    communityList.hidden = false;

    document.body.style.overflow = '';
}

backButton.addEventListener('click', closeCommunityPopup);

communityDetail.addEventListener('click', event => {
    if (event.target === communityDetail) {
        closeCommunityPopup();
    }
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !communityDetail.hidden) {
        closeCommunityPopup();
    }
});

async function loadCommunity() {
    const version = ++requestVersion;

    const chatId = new URLSearchParams(
        window.location.search
    ).get('chat');

    communityDetail.hidden = true;
    communityList.hidden = false;
    document.body.style.overflow = '';

    communityList.replaceChildren();

    if (currentMode === 'demo') {
        loadDemoCommunity();

        if (chatId) {
            await showPublicChat(chatId);
        }

        return;
    }

    const loading = document.createElement('p');
    loading.textContent = 'Loading conversations...';
    communityList.append(loading);

    try {
        const snapshot = await getDocs(
            query(
                collection(db, 'chats'),
                where('isPublic', '==', true)
            )
        );

        if (version !== requestVersion) {
            return;
        }

        communityList.replaceChildren();

        const chats = snapshot.docs
            .map(item => ({
                ...item.data(),
                id: item.id
            }))
            .sort((a, b) =>
                timestampMillis(b.updatedAt || b.createdAt) -
                timestampMillis(a.updatedAt || a.createdAt)
            );

        chats.forEach(createCommunityCard);

        if (!chats.length) {
            showMessage('No conversations have been shared yet.');
        }

    } catch (error) {
        if (version !== requestVersion) {
            return;
        }

        console.error(
            'Could not load Community conversations:',
            error
        );

        communityList.replaceChildren();

        if (error.code === 'permission-denied') {
            showMessage(
                'Unable to load Community conversations because Firebase permissions were denied.'
            );
        } else {
            showMessage(
                'Could not load conversations. Please try again.'
            );
        }
    }

    if (chatId && version === requestVersion) {
        await showPublicChat(chatId);
    }
}

function loadDemoCommunity() {
    communityList.replaceChildren();

    const notice = document.createElement('p');
    notice.className = 'community-demo-notice';
    notice.textContent =
        'Preview Mode: Showing sample conversations for testing.';

    communityList.append(notice);

    demoChats.forEach(createCommunityCard);
}

function createCommunityCard(chat) {
    const card = document.createElement('article');
    card.className = 'community-card';

    const title = document.createElement('h2');
    title.textContent = chat.title || 'Untitled Conversation';

    const author = document.createElement('p');
    author.className = 'community-byline';
    author.textContent = `Shared by ${chat.username || 'Anonymous'}`;

    const preview = document.createElement('p');
    preview.className = 'community-preview';

    const firstMessage = chat.preview || chat.messages?.[0]?.content;

    preview.textContent = firstMessage
        ? firstMessage.slice(0, 120) +
          (firstMessage.length > 120 ? '...' : '')
        : 'View this conversation.';

    const footer = document.createElement('div');
    footer.className = 'community-card-footer';

    const date = document.createElement('span');
    date.textContent = formatTimestamp(
        chat.updatedAt || chat.createdAt
    );

    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.className = 'light';
    viewButton.textContent = 'View Conversation';

    viewButton.addEventListener('click', () => {
        history.pushState(
            null,
            '',
            `community.html?chat=${encodeURIComponent(chat.id)}`
        );

        showPublicChat(chat.id);
    });

    footer.append(date, viewButton);
    card.append(title, author, preview, footer);

    communityList.append(card);
}

async function showPublicChat(chatId) {
    const version = requestVersion;
    const mode = currentMode;

    communityList.hidden = false;
    communityDetail.hidden = false;
    document.body.style.overflow = 'hidden';

    detailTitle.textContent = 'Loading conversation…';
    detailAuthor.textContent = '';
    communityMessages.replaceChildren();

    if (mode === 'demo') {
        const demoChat = demoChats.find(chat => chat.id === chatId);

        if (demoChat) {
            displayDemoChat(demoChat);
        } else {
            detailTitle.textContent = 'Conversation unavailable';
            showDetailMessage('This sample conversation was not found.');
        }

        return;
    }

    try {
        const chatRef = doc(db, 'chats', chatId);
        const chatSnapshot = await getDoc(chatRef);

        if (version !== requestVersion || communityDetail.hidden) {
            return;
        }

        if (
            !chatSnapshot.exists() ||
            chatSnapshot.data().isPublic !== true
        ) {
            throw new Error(
                'This conversation is private or unavailable.'
            );
        }

        const chat = chatSnapshot.data();

        detailTitle.textContent = chat.title || 'Untitled Conversation';
        detailAuthor.textContent =
            `Shared by ${chat.username || 'Anonymous'}`;

        const messages = await getDocs(
            query(
                collection(db, 'chats', chatId, 'messages'),
                orderBy('timestamp', 'asc')
            )
        );

        if (version !== requestVersion || communityDetail.hidden) {
            return;
        }

        if (messages.empty) {
            showDetailMessage('No messages available.');
            return;
        }

        messages.forEach(message => {
            createMessageRow(message.data());
        });

    } catch (error) {
        if (version !== requestVersion || communityDetail.hidden) {
            return;
        }

        console.error('Could not load conversation:', error);

        detailTitle.textContent = 'Conversation unavailable';

        showDetailMessage(
            error.message === 'This conversation is private or unavailable.' ||
            error.code === 'permission-denied'
                ? 'This conversation is private or unavailable.'
                : 'Could not load this conversation.'
        );
    }
}

function displayDemoChat(chat) {
    detailTitle.textContent = chat.title;
    detailAuthor.textContent = `Shared by ${chat.username}`;

    communityMessages.replaceChildren();

    chat.messages.forEach(message => {
        createMessageRow(message);
    });
}

function createMessageRow(data) {
    const row = document.createElement('article');
    row.className = 'run-message';

    const byline = document.createElement('div');
    byline.className = 'run-message-byline';

    byline.textContent =
        `${data.agentId ? `${data.agentId} · ` : ''}${data.role || 'message'}`;

    const content = document.createElement('p');
    content.textContent = data.content || '';

    const time = document.createElement('time');
    time.textContent = formatTimestamp(data.timestamp);

    row.append(byline, content, time);
    communityMessages.append(row);
}

function showMessage(message) {
    const paragraph = document.createElement('p');
    paragraph.className = 'community-demo-notice';
    paragraph.textContent = message;

    communityList.append(paragraph);
}

function showDetailMessage(message) {
    const paragraph = document.createElement('p');
    paragraph.textContent = message;

    communityMessages.append(paragraph);
}

function timestampMillis(value) {
    if (value?.toDate) {
        return value.toDate().getTime();
    }

    if (value instanceof Date) {
        return value.getTime();
    }

    return 0;
}

function formatTimestamp(timestamp) {
    if (timestamp?.toDate) {
        return timestamp.toDate().toLocaleString();
    }

    if (timestamp instanceof Date) {
        return timestamp.toLocaleString();
    }

    return 'Date unavailable';
}

window.addEventListener('popstate', () => {
    document.body.style.overflow = '';
    loadCommunity();
});

updateModeButtons();
loadCommunity();
