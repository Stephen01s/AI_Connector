import {
    collection, doc, getDoc, getDocs, orderBy, query, where
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from './firebase.js';
import './account.js';

const communityList = document.querySelector('#community-list');
const communityDetail = document.querySelector('#community-detail');
const detailTitle = document.querySelector('#community-detail-title');
const detailAuthor = document.querySelector('#community-detail-author');
const communityMessages = document.querySelector('#community-messages');
const backButton = document.querySelector('#community-back');

document.querySelectorAll('[data-page]').forEach(button => {
    button.addEventListener('click', () => {
        window.location.href = button.dataset.page;
    });
});

backButton.addEventListener('click', () => {
    history.replaceState(null, '', 'community.html');
    communityDetail.hidden = true;
    communityList.hidden = false;
});

async function loadCommunity() {
    const chatId = new URLSearchParams(window.location.search).get('chat');
    if (chatId) {
        await showPublicChat(chatId);
        return;
    }

    communityList.replaceChildren();
    const loading = document.createElement('p');
    loading.textContent = 'Loading conversations...';
    communityList.append(loading);
    try {
        const snapshot = await getDocs(query(collection(db, 'chats'), where('isPublic', '==', true)));
        communityList.replaceChildren();
        const chats = snapshot.docs
            .map(item => ({ id: item.id, ...item.data() }))
            .sort((a, b) => timestampMillis(b.updatedAt || b.createdAt) - timestampMillis(a.updatedAt || a.createdAt));
        chats.forEach(createCommunityCard);
        if (!chats.length) showMessage('No conversations have been shared yet.');
    } catch (error) {
        console.error('Could not load Community conversations:', error);
        communityList.replaceChildren();
        showMessage('Could not load conversations. Please try again.');
    }
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
    preview.textContent = 'View this conversation.';
    const footer = document.createElement('div');
    footer.className = 'community-card-footer';
    const date = document.createElement('span');
    date.textContent = formatTimestamp(chat.updatedAt || chat.createdAt);
    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.className = 'light';
    viewButton.textContent = 'View Conversation';
    viewButton.addEventListener('click', () => {
        history.pushState(null, '', `community.html?chat=${encodeURIComponent(chat.id)}`);
        showPublicChat(chat.id);
    });
    footer.append(date, viewButton);
    card.append(title, author, preview, footer);
    communityList.append(card);
}

async function showPublicChat(chatId) {
    communityList.hidden = true;
    communityDetail.hidden = false;
    detailTitle.textContent = 'Loading conversation…';
    detailAuthor.textContent = '';
    communityMessages.replaceChildren();
    try {
        const chatRef = doc(db, 'chats', chatId);
        const chatSnapshot = await getDoc(chatRef);
        if (!chatSnapshot.exists() || chatSnapshot.data().isPublic !== true) {
            throw new Error('This conversation is private or unavailable.');
        }
        const chat = chatSnapshot.data();
        detailTitle.textContent = chat.title || 'Untitled Conversation';
        detailAuthor.textContent = `Shared by ${chat.username || 'Anonymous'}`;
        const messages = await getDocs(query(collection(db, 'chats', chatId, 'messages'), orderBy('timestamp', 'asc')));
        if (messages.empty) {
            showDetailMessage('No messages available.');
            return;
        }
        messages.forEach(message => {
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
            communityMessages.append(row);
        });
    } catch (error) {
        detailTitle.textContent = 'Conversation unavailable';
        showDetailMessage(error.message === 'This conversation is private or unavailable.' || error.code === 'permission-denied'
            ? 'This conversation is private or unavailable.'
            : 'Could not load this conversation.');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showMessage(message) {
    const paragraph = document.createElement('p');
    paragraph.textContent = message;
    communityList.append(paragraph);
}

function showDetailMessage(message) {
    const paragraph = document.createElement('p');
    paragraph.textContent = message;
    communityMessages.append(paragraph);
}

function timestampMillis(value) {
    return value?.toDate ? value.toDate().getTime() : 0;
}

function formatTimestamp(timestamp) {
    return timestamp?.toDate ? timestamp.toDate().toLocaleString() : 'Date unavailable';
}

loadCommunity();
