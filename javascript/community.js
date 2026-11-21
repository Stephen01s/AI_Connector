import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';

import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    where
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

import { auth, db, usernameSessionKey } from './firebase.js';
import './account.js';

const communityList = document.querySelector('#community-list');
const communityDetail = document.querySelector('#community-detail');
const detailTitle = document.querySelector('#community-detail-title');
const detailAuthor = document.querySelector('#community-detail-author');
const detailDate = document.querySelector('#community-detail-date');
const communityMessages = document.querySelector('#community-messages');
const backButton = document.querySelector('#community-back');
const realButton = document.querySelector('#community-real-btn');
const demoButton = document.querySelector('#community-demo-btn');
const commentsSection = document.querySelector('#community-comments');
const commentList = document.querySelector('#community-comment-list');
const commentForm = document.querySelector('#community-comment-form');
const commentInput = document.querySelector('#community-comment-input');
const commentStatus = document.querySelector('#community-comment-status');
const analysisButton = document.querySelector('#analyze-community');
const analysisButtonLabel = analysisButton.querySelector('.analysis-trigger-label');

let currentMode = 'real';
let requestVersion = 0;
let activeCommentPostId = null;

onAuthStateChanged(auth, updateCommentForm);

let detailRequestVersion = 0;
let selectedCommunityChat = null;
let selectedCommunityMessages = [];

const communityModelNames = new Map();
const communityAnalysisCache = new Map();


function setAnalysisButtonLabel(label) {
    analysisButtonLabel.textContent = label;
}

function clearCommunityAnalysis() {
    ++detailRequestVersion;

    selectedCommunityChat = null;
    selectedCommunityMessages = [];

    communityModelNames.clear();

    analysisButton.hidden = true;
    analysisButton.disabled = true;

    setAnalysisButtonLabel('Analyze conversation');
}

function selectCommunityAnalysis(chat, messages) {
    selectedCommunityChat = chat;

    selectedCommunityMessages = messages.map(data => ({
        name: data.agentId || 'Unknown participant',
        role: data.role || 'assistant',
        text: data.content || ''
    }));

    const cached = communityAnalysisCache.get(
        currentMode + ':' + chat.id
    );

    if (
        cached?.message_count === selectedCommunityMessages.length
    ) {
        chat.analysis = cached;
    }

    analysisButton.hidden = false;
    analysisButton.disabled = !selectedCommunityMessages.length;

    const hasAnalysis =
        chat.analysis?.message_count === selectedCommunityMessages.length &&
        typeof chat.analysis?.text === 'string';

    setAnalysisButtonLabel(
        hasAnalysis ? 'View Analysis' : 'Analyze conversation'
    );
}

analysisButton.addEventListener('click', async () => {
    if (
        !selectedCommunityChat ||
        !selectedCommunityMessages.length ||
        analysisButton.disabled
    ) {
        return;
    }

    const chat = selectedCommunityChat;
    const cacheKey = currentMode + ':' + chat.id;

    await window.conversationAnalysis.open({
        prompt: chat.prompt || chat.title || 'Original prompt unavailable.',
        promptIsComplete: Boolean(chat.prompt),
        mode: chat.mode ?? null,
        model: chat.model_a_model || null,
        messages: selectedCommunityMessages,
        analysis: chat.analysis,

        onResult: report => {
            // Community is read-only.
            // Never write a viewer's report or API key
            // onto somebody else's published conversation.

            communityAnalysisCache.set(cacheKey, report);

            chat.analysis = report;

            if (selectedCommunityChat === chat) {
                setAnalysisButtonLabel('View Analysis');
            }
        }
    });
});

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
    button.addEventListener('click', () => {
        window.location.href = button.dataset.page;
    });
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

    return loadCommunity();
}

realButton.addEventListener('click', () => {
    return setCommunityMode('real');
});

demoButton.addEventListener('click', () => {
    return setCommunityMode('demo');
});

function closeCommunityPopup() {
    clearCommunityAnalysis();

    history.replaceState(null, '', 'community.html');

    communityDetail.hidden = true;
    communityList.hidden = false;

    document.body.style.overflow = '';
}

backButton.addEventListener('click', closeCommunityPopup);

commentForm.addEventListener('submit', async event => {
    event.preventDefault();

    const comment = commentInput.value.trim();
    const user = auth.currentUser;
    const postId = activeCommentPostId;

    if (!comment) return;

    if (!user) {
        commentStatus.textContent = 'Sign in to post a comment.';
        return;
    }

    if (!postId || currentMode !== 'real') return;

    const commentRef = doc(collection(db, 'comments'));

    const submitButton = commentForm.querySelector(
        'button[type="submit"]'
    );

    submitButton.disabled = true;

    commentStatus.textContent = 'Posting comment…';

    try {
        const profileId = localStorage.getItem(usernameSessionKey);

        let username = user.displayName || 'Anonymous';

        if (profileId) {
            const profile = await getDoc(
                doc(db, 'users', profileId)
            );

            if (profile.exists() && profile.data().username) {
                username = profile.data().username;
            }
        }

        await setDoc(commentRef, {
            comment,
            postId,
            commentId: commentRef.id,
            userId: user.uid,
            username,
            createdAt: serverTimestamp()
        });

        commentInput.value = '';

        commentStatus.textContent = 'Comment posted.';

        await loadComments(postId);

    } catch (error) {
        console.error('Could not post comment:', error);

        commentStatus.textContent =
            error.code === 'permission-denied'
                ? 'You do not have permission to comment on this conversation.'
                : 'Could not post your comment. Please try again.';

    } finally {
        submitButton.disabled = !auth.currentUser;
    }
});

communityDetail.addEventListener('click', event => {
    if (event.target === communityDetail) {
        closeCommunityPopup();
    }
});

document.addEventListener('keydown', event => {
    const analysisOpen =
        document.querySelector('#analysis-dialog')?.open;

    const keyEntryOpen =
        document.querySelector('#api-key-dialog')?.open;

    if (
        event.key === 'Escape' &&
        !communityDetail.hidden &&
        !analysisOpen &&
        !keyEntryOpen
    ) {
        closeCommunityPopup();
    }
});

async function loadCommunity() {
    const version = ++requestVersion;

    clearCommunityAnalysis();

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

    author.textContent =
        `Shared by ${chat.username || 'Anonymous'}`;

    const preview = document.createElement('p');

    preview.className = 'community-preview';

    const firstMessage =
        chat.preview || chat.messages?.[0]?.content;

    if (
        typeof firstMessage === 'string' &&
        firstMessage.trim()
    ) {
        preview.textContent = formatPreview(firstMessage);

    } else if (currentMode === 'real') {
        preview.textContent = 'Loading preview...';

        loadMessagePreview(
            chat.id,
            preview,
            requestVersion
        );

    } else {
        preview.textContent =
            'No conversation preview available.';
    }

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

        return showPublicChat(chat.id);
    });

    footer.append(date, viewButton);

    card.append(title, author, preview, footer);

    communityList.append(card);
}

function formatPreview(content) {
    const text = content.replace(/\s+/g, ' ').trim();

    const maxLength = 200;

    return text.length > maxLength
        ? text.slice(0, maxLength).trimEnd() + '...'
        : text;
}

async function loadMessagePreview(
    chatId,
    previewElement,
    version
) {
    try {
        const messagesRef = collection(
            db,
            'chats',
            chatId,
            'messages'
        );

        const snapshot = await getDocs(
            query(
                messagesRef,
                orderBy('timestamp', 'asc'),
                limit(1)
            )
        );

        if (
            version !== requestVersion ||
            currentMode !== 'real' ||
            !previewElement.isConnected
        ) {
            return;
        }

        if (snapshot.empty) {
            previewElement.textContent = 'No messages available.';
            return;
        }

        const firstMessage = snapshot.docs[0].data().content;

        previewElement.textContent =
            typeof firstMessage === 'string' &&
            firstMessage.trim()
                ? formatPreview(firstMessage)
                : 'No conversation preview available.';

    } catch (error) {
        console.error('Could not load message preview:', error);

        if (
            version === requestVersion &&
            currentMode === 'real' &&
            previewElement.isConnected
        ) {
            previewElement.textContent = 'Preview unavailable.';
        }
    }
}

async function showPublicChat(chatId) {
    clearCommunityAnalysis();

    const detailVersion = detailRequestVersion;
    const version = requestVersion;
    const mode = currentMode;

    const isCurrent = () =>
        version === requestVersion &&
        detailVersion === detailRequestVersion &&
        mode === currentMode &&
        !communityDetail.hidden;

    communityList.hidden = false;
    communityDetail.hidden = false;

    document.body.style.overflow = 'hidden';

    detailTitle.textContent = 'Loading conversation…';

    detailAuthor.textContent = '';
    detailDate.textContent = '';

    communityMessages.replaceChildren();

    activeCommentPostId = null;

    commentsSection.hidden = true;

    commentList.replaceChildren();

    commentStatus.textContent = '';

    if (mode === 'demo') {
        const demoChat = demoChats.find(
            chat => chat.id === chatId
        );

        if (demoChat) {
            displayDemoChat(demoChat);
        } else {
            detailTitle.textContent = 'Conversation unavailable';

            showDetailMessage(
                'This sample conversation was not found.'
            );
        }

        return;
    }

    try {
        const chatRef = doc(db, 'chats', chatId);

        const chatSnapshot = await getDoc(chatRef);

        if (!isCurrent()) {
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

        const chat = {
            ...chatSnapshot.data(),
            id: chatId
        };

        activeCommentPostId = chatId;

        commentsSection.hidden = false;

        updateCommentForm();

        // Display the original initial prompt.
        detailTitle.textContent =
            chat.prompt ||
            chat.title ||
            'Initial prompt unavailable.';

        detailAuthor.textContent =
            `Shared by ${chat.username || 'Anonymous'}`;

        detailDate.textContent = formatTimestamp(
            chat.createdAt || chat.updatedAt
        );

        const messages = await getDocs(
            query(
                collection(db, 'chats', chatId, 'messages'),
                orderBy('timestamp', 'asc')
            )
        );

        if (!isCurrent()) {
            return;
        }

        const transcript = [];

        if (messages.empty) {
            showDetailMessage('No messages available.');

        } else {
            messages.forEach(message => {
                const data = message.data();

                transcript.push(data);

                createMessageRow(data);
            });
        }

        selectCommunityAnalysis(chat, transcript);

        await loadComments(chatId);

    } catch (error) {
        if (!isCurrent()) {
            return;
        }

        console.error('Could not load conversation:', error);

        detailTitle.textContent = 'Conversation unavailable';

        showDetailMessage(
            error.message ===
                'This conversation is private or unavailable.' ||
            error.code === 'permission-denied'
                ? 'This conversation is private or unavailable.'
                : 'Could not load this conversation.'
        );
    }
}

function displayDemoChat(chat) {
    detailTitle.textContent =
        chat.prompt ||
        chat.title ||
        'Initial prompt unavailable.';

    detailAuthor.textContent =
        `Shared by ${chat.username}`;

    detailDate.textContent = formatTimestamp(
        chat.createdAt || chat.updatedAt
    );

    activeCommentPostId = null;

    commentsSection.hidden = true;

    communityMessages.replaceChildren();

    chat.messages.forEach(message => {
        createMessageRow(message);
    });

    selectCommunityAnalysis(chat, chat.messages);
}

function updateCommentForm() {
    const signedIn = Boolean(auth.currentUser);

    commentInput.disabled = !signedIn;

    commentForm.querySelector(
        'button[type="submit"]'
    ).disabled = !signedIn;

    commentInput.placeholder = signedIn
        ? 'Write a comment…'
        : 'Sign in to join the conversation';
}

async function loadComments(postId) {
    commentList.replaceChildren();

    try {
        const snapshot = await getDocs(
            query(
                collection(db, 'comments'),
                where('postId', '==', postId)
            )
        );

        if (activeCommentPostId !== postId) return;

        if (snapshot.empty) {
            const empty = document.createElement('p');

            empty.textContent = 'No comments yet.';

            commentList.append(empty);

            return;
        }

        snapshot.docs
            .sort((a, b) =>
                timestampMillis(a.data().createdAt) -
                timestampMillis(b.data().createdAt)
            )
            .forEach(item => {
                const data = item.data();

                const card = document.createElement('article');

                card.className = 'community-comment';

                const author = document.createElement('strong');

                author.textContent =
                    data.username || 'Anonymous';

                const body = document.createElement('p');

                body.textContent = data.comment || '';

                const time = document.createElement('time');

                time.textContent = formatTimestamp(data.createdAt);

                card.append(author, body, time);

                commentList.append(card);
            });

    } catch (error) {
        console.error('Could not load comments:', error);

        if (activeCommentPostId === postId) {
            const message = document.createElement('p');

            message.textContent =
                'Comments could not be loaded.';

            commentList.append(message);
        }
    }
}

function createMessageRow(data) {
    const row = document.createElement('article');

    row.className = 'run-message';
    // Model A blue, Model B purple, humans green.

    const sender = String(data.agentId || '').trim();

    const role = String(data.role || '').trim();

    const isHuman =
        /^(human|user|moderator)$/i.test(sender) ||
        /^(human|user|moderator)$/i.test(role);

    if (isHuman) {
        row.classList.add('message-human');

    } else {
        const modelKey = sender || role || 'assistant';

        if (!communityModelNames.has(modelKey)) {
            communityModelNames.set(
                modelKey,
                communityModelNames.size
            );
        }

        if (communityModelNames.get(modelKey) % 2 === 1) {
            row.classList.add('message-model-b');
        }
    }

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
    let date;

    if (timestamp?.toDate) {
        date = timestamp.toDate();

    } else if (timestamp instanceof Date) {
        date = timestamp;

    } else {
        return 'Date unavailable';
    }

    if (Number.isNaN(date.getTime())) {
        return 'Date unavailable';
    }

    return date.toLocaleDateString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric'
    });
}


window.addEventListener('popstate', () => {
    document.body.style.overflow = '';

    loadCommunity();
});

updateModeButtons();

loadCommunity();
