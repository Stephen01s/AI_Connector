
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    query,
    updateDoc,
    where,
    orderBy
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

import { db, usernameSessionKey } from './firebase.js';
import './account.js';

// Current signed-in user
const profileId = localStorage.getItem(usernameSessionKey);

// Runs page elements
const status = document.querySelector('#runs-status');
const runsList = document.querySelector('#runs-list');
const runMessages = document.querySelector('#run-messages');
const detailTitle = document.querySelector('#run-detail-title');
const detailEmpty = document.querySelector('#run-detail-empty');
const detailPanel = document.querySelector('.run-detail-panel');

// Centered empty-state elements
const emptyTitle = document.querySelector(
    '#run-detail-empty-title'
);

const emptyDescription = document.querySelector(
    '#run-detail-empty-description'
);

// Page navigation
document.querySelectorAll('[data-page]').forEach(button => {
    button.addEventListener('click', () => {
        window.location.href = button.dataset.page;
    });
});

// Load saved conversations
if (!profileId) {
    window.location.replace('sign-in.html');
} else {
    loadRuns().catch(error => {
        console.error('Could not load runs:', error);

        status.textContent =
            'Could not load your runs. Please refresh to try again.';
    });
}

// Retrieve and display saved conversations
async function loadRuns() {
    const profile = await getDoc(
        doc(db, 'users', profileId)
    );

    if (!profile.exists()) {
        window.location.replace('sign-in.html');
        return;
    }

    const username = profile.data().username || profileId;

    document.querySelector('#runs-description').textContent =
        `Previous conversations for ${username}.`;

    const runsQuery = query(
        collection(db, 'chats'),
        where('userId', '==', profileId)
    );

    const snapshot = await getDocs(runsQuery);

    const chats = snapshot.docs.map(chat => ({
        id: chat.id,
        ...chat.data()
    }));

    // Sort newest conversations first
    chats.sort((a, b) =>
        timestampMillis(b.updatedAt || b.createdAt) -
        timestampMillis(a.updatedAt || a.createdAt)
    );

    runsList.replaceChildren();

    if (chats.length === 0) {
        status.textContent =
            'No saved chats yet. Start a run from Home while signed in to save one.';
        return;
    }

    chats.forEach(chat => {
        const card = document.createElement('div');
        card.className = 'run-card-wrap';
        card.dataset.chatId = chat.id;

        // Conversation selection button
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'run-list-card';

        const title = document.createElement('strong');
        title.textContent = chat.title || 'Untitled run';

        const date = document.createElement('small');
        date.textContent = formatTimestamp(
            chat.updatedAt || chat.createdAt
        );

        button.append(title, date);

        button.addEventListener('click', () => {
            selectRun(chat).catch(error => {
                console.error(
                    'Could not load conversation:',
                    error
                );

                status.textContent =
                    'Could not load that conversation.';
            });
        });

        // Conversation action buttons
        const actions = document.createElement('div');
        actions.className = 'run-card-actions';

        // Public/private visibility button
        const visibilityButton = document.createElement('button');
        visibilityButton.type = 'button';

        visibilityButton.className =
            'run-card-action visibility-toggle';

        visibilityButton.setAttribute(
            'aria-label',
            chat.isPublic === true
                ? 'Make chat private'
                : 'Make chat public'
        );

        visibilityButton.setAttribute(
            'aria-pressed',
            String(chat.isPublic === true)
        );

        visibilityButton.title =
            chat.isPublic === true ? 'Public' : 'Private';

        visibilityButton.innerHTML =
            chat.isPublic === true ? eyeIcon() : eyeOffIcon();

        visibilityButton.addEventListener('click', async event => {
            event.stopPropagation();

            const isPublic = chat.isPublic !== true;
            visibilityButton.disabled = true;

            try {
                await updateDoc(
                    doc(db, 'chats', chat.id),
                    { isPublic }
                );

                chat.isPublic = isPublic;

                visibilityButton.setAttribute(
                    'aria-label',
                    isPublic
                        ? 'Make chat private'
                        : 'Make chat public'
                );

                visibilityButton.setAttribute(
                    'aria-pressed',
                    String(isPublic)
                );

                visibilityButton.title =
                    isPublic ? 'Public' : 'Private';

                visibilityButton.innerHTML =
                    isPublic ? eyeIcon() : eyeOffIcon();

                status.textContent = isPublic
                    ? 'Chat is now public.'
                    : 'Chat is now private.';

            } catch (error) {
                console.error(
                    'Could not change chat visibility:',
                    error
                );

                status.textContent =
                    'Could not change chat visibility.';
            } finally {
                visibilityButton.disabled = false;
            }
        });

        // Delete conversation button
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';

        deleteButton.className =
            'run-card-action delete-chat';

        deleteButton.setAttribute(
            'aria-label',
            'Delete chat'
        );

        deleteButton.title = 'Delete chat';
        deleteButton.textContent = '×';

        deleteButton.addEventListener('click', async event => {
            event.stopPropagation();

            if (!window.confirm(
                'are you sure you want to delete this chat? this action cannot be undone.'
            )) {
                return;
            }

            deleteButton.disabled = true;

            try {
                // Delete saved messages
                const messages = await getDocs(
                    collection(
                        db,
                        'chats',
                        chat.id,
                        'messages'
                    )
                );

                await Promise.all(
                    messages.docs.map(message =>
                        deleteDoc(message.ref)
                    )
                );

                // Delete the conversation
                await deleteDoc(
                    doc(db, 'chats', chat.id)
                );

                card.remove();

                if (!runsList.children.length) {
                    status.textContent =
                        'No saved chats yet. Start a run from Home while signed in to save one.';
                } else {
                    status.textContent = 'Chat deleted.';
                }

                // If the selected conversation was deleted,
                // restore the normal title and empty state.
                if (button.classList.contains('selected')) {
                    detailTitle.textContent = 'Select a chat';

                    // Remove the selected-title background
                    detailPanel.classList.remove(
                        'has-selected-run'
                    );

                    runMessages.replaceChildren();

                    emptyTitle.textContent =
                        'No conversation selected';

                    emptyDescription.textContent =
                        'Choose a previous chat to view its messages.';

                    detailEmpty.hidden = false;
                }

            } catch (error) {
                console.error(
                    'Could not delete chat:',
                    error
                );

                status.textContent =
                    'Could not delete that chat.';

                deleteButton.disabled = false;
            }
        });

        actions.append(
            visibilityButton,
            deleteButton
        );

        card.append(button, actions);
        runsList.append(card);
    });

    status.textContent =
        `${chats.length} saved chat${chats.length === 1 ? '' : 's'}.`;
}

// Load the messages for a selected conversation
async function selectRun(chat) {
    // Highlight the selected conversation card
    runsList.querySelectorAll('.run-card-wrap').forEach(card => {
        card.querySelector('.run-list-card').classList.toggle(
            'selected',
            card.dataset.chatId === chat.id
        );
    });

    // Update conversation title
    detailTitle.textContent = chat.title || 'Untitled run';

    // Add the background only for selected conversations
    detailPanel.classList.add('has-selected-run');

    // Hide the centered empty state
    detailEmpty.hidden = true;
    runMessages.replaceChildren();

    const messagesQuery = query(
        collection(db, 'chats', chat.id, 'messages'),
        orderBy('timestamp', 'asc')
    );

    const snapshot = await getDocs(messagesQuery);

    // Show a message if the selected chat is empty
    if (snapshot.empty) {
        emptyTitle.textContent = 'No messages yet';

        emptyDescription.textContent =
            'This chat has no saved messages.';

        detailEmpty.hidden = false;
        return;
    }

    // Track custom model names so both AI models
    // receive consistent message colors.
    const modelNames = new Map();

    snapshot.forEach(message => {
        const data = message.data();

        const row = document.createElement('article');
        row.className = 'run-message';

        const sender = String(data.agentId || '').trim();
        const role = String(data.role || '').trim();

        // Human, user, and moderator messages
        // receive an emerald border on the right.
        const isHuman =
            /^(human|user|moderator)$/i.test(sender) ||
            /^(human|user|moderator)$/i.test(role);

        if (isHuman) {
            row.classList.add('message-human');
        } else {
            // Model A: Midnight Blue
            // Model B: Muted Purple
            const modelKey = sender || role || 'assistant';

            if (!modelNames.has(modelKey)) {
                modelNames.set(modelKey, modelNames.size);
            }

            if (modelNames.get(modelKey) % 2 === 1) {
                row.classList.add('message-model-b');
            }
        }

        // Message sender information
        const byline = document.createElement('div');
        byline.className = 'run-message-byline';

        byline.textContent =
            `${data.agentId ? `${data.agentId} · ` : ''}${data.role || 'message'}`;

        // Message content
        const content = document.createElement('p');
        content.textContent = data.content || '';

        // Message timestamp
        const time = document.createElement('time');
        time.textContent = formatTimestamp(
            data.timestamp
        );

        row.append(byline, content, time);
        runMessages.append(row);
    });
}

// Icons for the public/private button
function eyeIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
}

function eyeOffIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a16 16 0 0 1-3.2 3.9M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7c1.4 0 2.6-.3 3.7-.8"/></svg>';
}

// Convert Firebase timestamps into milliseconds
function timestampMillis(value) {
    return value?.toDate
        ? value.toDate().getTime()
        : 0;
}

// Format message and conversation dates
function formatTimestamp(value) {
    if (!value?.toDate) {
        return 'Date unavailable';
    }

    return value.toDate().toLocaleString();
}
