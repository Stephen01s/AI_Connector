
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
const analysisButton = document.querySelector('#analyze-saved-run');
let selectedChat = null;
let selectedMessages = [];
let selectionVersion = 0;

function clearAnalysisSelection() {
    ++selectionVersion;
    selectedChat = null;
    selectedMessages = [];
    analysisButton.hidden = true;
    analysisButton.disabled = true;
    analysisButton.textContent = 'Analyze conversation';
}

analysisButton.addEventListener('click', async () => {
    if (!selectedChat || !selectedMessages.length || analysisButton.disabled) return;
    const chat = selectedChat;
    await window.conversationAnalysis.open({
        prompt: chat.prompt || chat.title || 'Original prompt unavailable.',
        promptIsComplete: Boolean(chat.prompt),
        mode: chat.mode ?? null,
        model: chat.model_a_model || null,
        messages: selectedMessages,
        analysis: chat.analysis,
        onResult: async report => {
            // Retain the report in this page even if saving it is unavailable.
            chat.analysis = report;
            chat.model_a_model = report.model;
            if (selectedChat === chat) analysisButton.textContent = 'View analysis';
            await updateDoc(doc(db, 'chats', chat.id), {
                analysis: report,
                model_a_model: report.model
            });
        }
    });
});

document.querySelectorAll('[data-page]').forEach(button => {
    button.addEventListener('click', () => {
        window.location.href = button.dataset.page;
    });
});

// Custom confirmation dialog for sharing, unsharing, and deleting
function confirmRunAction({ title, message, confirmText, icon, danger = false }) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'run-confirm-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'run-confirm-dialog';
        dialog.setAttribute('role', 'alertdialog');
        dialog.setAttribute('aria-modal', 'true');

        const heading = document.createElement('div');
        heading.className = 'run-confirm-heading';
        heading.innerHTML = icon;

        const titleElement = document.createElement('h3');
        titleElement.textContent = title;
        heading.append(titleElement);

        const description = document.createElement('p');
        description.className = 'run-confirm-message';
        description.textContent = message;

        const actions = document.createElement('div');
        actions.className = 'run-confirm-actions';

        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.className = 'run-confirm-cancel';
        cancelButton.textContent = 'Cancel';

        const confirmButton = document.createElement('button');
        confirmButton.type = 'button';
        confirmButton.className = danger
            ? 'run-confirm-submit is-danger'
            : 'run-confirm-submit';
        confirmButton.textContent = confirmText;

        actions.append(cancelButton, confirmButton);
        dialog.append(heading, description, actions);
        overlay.append(dialog);

        const previousFocus = document.activeElement;

        function close(confirmed) {
            document.removeEventListener('keydown', onKeyDown);
            overlay.remove();
            previousFocus?.focus?.();
            resolve(confirmed);
        }

        function onKeyDown(event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                close(false);
            } else if (event.key === 'Tab') {
                const focusable = [cancelButton, confirmButton];
                const currentIndex = focusable.indexOf(document.activeElement);
                if (event.shiftKey && currentIndex === 0) {
                    event.preventDefault();
                    confirmButton.focus();
                } else if (!event.shiftKey && currentIndex === focusable.length - 1) {
                    event.preventDefault();
                    cancelButton.focus();
                }
            }
        }

        cancelButton.addEventListener('click', () => close(false));
        confirmButton.addEventListener('click', () => close(true));
        overlay.addEventListener('click', event => {
            if (event.target === overlay) close(false);
        });

        document.body.append(overlay);
        document.addEventListener('keydown', onKeyDown);
        cancelButton.focus();
    });
}

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

        // Current visibility, displayed beside the conversation date
        const metadata = document.createElement('div');
        metadata.className = 'run-card-metadata';

        const visibilityStatus = document.createElement('span');
        visibilityStatus.className = 'run-visibility-status';

        metadata.append(date, visibilityStatus);
        button.append(title, metadata);

        button.addEventListener('click', () => {
            return selectRun(chat).catch(error => {
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

        // Keep the visibility button and status label in sync
        function updateVisibilityDisplay() {
            const isPublic = chat.isPublic === true;
            const label = isPublic ? 'Public' : 'Private';
            const icon = isPublic ? globeIcon() : lockIcon();

            visibilityStatus.innerHTML =
                `${icon}<span>${label}</span>`;

            visibilityStatus.classList.toggle(
                'is-public',
                isPublic
            );

            visibilityButton.innerHTML = isPublic
                ? `${lockIcon()}<span>Make Private</span>`
                : `${globeIcon()}<span>Make Public</span>`;

            visibilityButton.setAttribute(
                'aria-label',
                isPublic
                    ? 'Make conversation private'
                    : 'Make conversation public'
            );

            visibilityButton.setAttribute(
                'aria-pressed',
                String(isPublic)
            );

            visibilityButton.title = isPublic
                ? 'Remove this conversation from Community'
                : 'Share this conversation to Community';
        }

        updateVisibilityDisplay();

        visibilityButton.addEventListener('click', async event => {
            event.stopPropagation();

            const isPublic = chat.isPublic !== true;

            const confirmed = await confirmRunAction({
                title: isPublic
                    ? 'Share conversation to Community?'
                    : 'Make this conversation private?',
                message: isPublic
                    ? 'Other users will be able to view this conversation on the Community page.'
                    : 'This conversation will be removed from Community but will remain saved in Your Runs.',
                confirmText: isPublic ? 'Make Public' : 'Make Private',
                icon: isPublic ? globeIcon() : lockIcon()
            });

            if (!confirmed) return;

            visibilityButton.disabled = true;

            try {
                await updateDoc(
                    doc(db, 'chats', chat.id),
                    { isPublic }
                );

                chat.isPublic = isPublic;

                updateVisibilityDisplay();

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
        deleteButton.innerHTML = `${trashIcon()}<span>Delete</span>`;

        deleteButton.addEventListener('click', async event => {
            event.stopPropagation();

            const confirmed = await confirmRunAction({
                title: 'Delete this conversation?',
                message: 'This will permanently delete the saved conversation and its messages. This action cannot be undone.',
                confirmText: 'Delete Conversation',
                icon: trashIcon(),
                danger: true
            });

            if (!confirmed) return;

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
                    clearAnalysisSelection();
                    detailPanel.classList.remove('has-selected-run');
                    detailTitle.textContent = 'Select a chat';
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
    clearAnalysisSelection();
    const version = selectionVersion;
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

    let snapshot;
    try {
        snapshot = await getDocs(messagesQuery);
    } catch (error) {
        if (version !== selectionVersion) return;
        clearAnalysisSelection();
        emptyTitle.textContent = 'Conversation unavailable';
        emptyDescription.textContent = 'Could not load this conversation. Please try again.';
        detailEmpty.hidden = false;
        throw error;
    }
    if (version !== selectionVersion) return;
    selectedChat = chat;
    analysisButton.hidden = false;
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
        selectedMessages.push({
            name: data.agentId || 'Unknown participant',
            role: data.role || 'assistant',
            text: data.content || ''
        });
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
    analysisButton.disabled = !selectedMessages.length;
    if (chat.analysis?.message_count === selectedMessages.length &&
        typeof chat.analysis.text === 'string') {
        analysisButton.textContent = 'View analysis';
    }
}

// Icons for conversation visibility and deletion
function globeIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18M12 3c5 5 5 13 0 18"/></svg>';
}

function lockIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
}

function trashIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>';
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
