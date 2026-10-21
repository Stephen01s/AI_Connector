
import {
    collection,
    getDocs,
    query,
    orderBy
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
    communityDetail.hidden = true;
    communityList.hidden = false;
});

async function loadCommunity() {
    communityList.replaceChildren();

    const loading = document.createElement('p');
    loading.textContent = 'Loading conversations...';
    communityList.append(loading);

    try {
        const postsQuery = query(
            collection(db, 'communityPosts'),
            orderBy('createdAt', 'desc')
        );

        const snapshot = await getDocs(postsQuery);
        communityList.replaceChildren();

        if (snapshot.empty) {
            showMessage('No conversations have been shared yet.');
            return;
        }

        snapshot.forEach(documentSnapshot => {
            const post = documentSnapshot.data();

            if (post.isPublic !== true) return;

            createCommunityCard(post);
        });

        if (communityList.children.length === 0) {
            showMessage('No conversations have been shared yet.');
        }

    } catch (error) {
        console.error('Could not load Community conversations:', error);
        communityList.replaceChildren();
        showMessage('Could not load conversations. Please try again.');
    }
}

function createCommunityCard(post) {
    const card = document.createElement('article');
    card.className = 'community-card';

    const title = document.createElement('h2');
    title.textContent = post.title || 'Untitled Conversation';

    const author = document.createElement('p');
    author.className = 'community-byline';
    author.textContent = `Shared by ${post.authorName || 'Anonymous'}`;

    const preview = document.createElement('p');
    preview.className = 'community-preview';
    preview.textContent = post.preview || 'View this conversation.';

    const footer = document.createElement('div');
    footer.className = 'community-card-footer';

    const date = document.createElement('span');
    date.textContent = formatTimestamp(post.createdAt);

    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.className = 'light';
    viewButton.textContent = 'View Conversation';

    viewButton.addEventListener('click', () => {
        showConversation(post);
    });

    footer.append(date, viewButton);
    card.append(title, author, preview, footer);
    communityList.append(card);
}

function showConversation(post) {
    communityList.hidden = true;
    communityDetail.hidden = false;

    detailTitle.textContent = post.title || 'Untitled Conversation';
    detailAuthor.textContent =
        `Shared by ${post.authorName || 'Anonymous'}`;

    communityMessages.replaceChildren();

    const messages = Array.isArray(post.messages)
        ? post.messages
        : [];

    if (messages.length === 0) {
        const empty = document.createElement('p');
        empty.textContent = 'No messages available.';
        communityMessages.append(empty);
        return;
    }

    messages.forEach(message => {
        const row = document.createElement('article');
        row.className = 'run-message';

        const byline = document.createElement('div');
        byline.className = 'run-message-byline';
        byline.textContent =
            `${message.agentId ? message.agentId + ' · ' : ''}` +
            (message.role || 'message');

        const content = document.createElement('p');
        content.textContent = message.content || '';

        const time = document.createElement('time');
        time.textContent = formatTimestamp(message.timestamp);

        row.append(byline, content, time);
        communityMessages.append(row);
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showMessage(message) {
    const paragraph = document.createElement('p');
    paragraph.textContent = message;
    communityList.append(paragraph);
}

function formatTimestamp(timestamp) {
    if (!timestamp?.toDate) {
        return 'Date unavailable';
    }

    return timestamp.toDate().toLocaleString();
}

loadCommunity();
