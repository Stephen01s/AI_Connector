const API_URL = 'http://localhost:8000';
let messages = [];

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

document.querySelectorAll('[data-nav]').forEach(button =>
    button.addEventListener('click', () =>
        show(button.dataset.nav === 'home' ? 'setup' :
            button.dataset.nav === 'runs' ? 'review' : 'setup')
    )
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

    try {
        const response = await fetch(API_URL + '/api/run', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({prompt, turns})
        });
        if (!response.ok) throw new Error('Server returned ' + response.status);

        const result = await response.json();
        messages = result.messages.map(message => [
            message.name, message.role, message.text, message.time
        ]);
        renderMessages(document.querySelector('#messages'));
        renderMessages(document.querySelector('#review-messages'));
        document.querySelector('#turn-status').textContent =
            'Run completed (' + messages.length + ' turns)';
        show('conversation');
    } catch (error) {
        alert('Could not connect to the Python server. Start it with: uvicorn server:app --reload');
        console.error(error);
    } finally {
        startButton.disabled = false;
        startButton.textContent = 'Start Run';
    }
});

document.querySelector('#send-message').addEventListener('click', () => {
    const input = document.querySelector('#message-input');
    if (!input.value.trim()) return;
    messages.push(['Human', 'Moderator', input.value.trim(), 'now']);
    renderMessages(document.querySelector('#messages'));
    input.value = '';
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
    link.download = 'vellum-run.json';
    link.click();
    URL.revokeObjectURL(url);
});

document.querySelector('#delete-run').addEventListener('click', () => {
    if (confirm('Delete this run?')) show('setup');
});
