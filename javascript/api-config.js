// Both pages use the local API during local development and Render when hosted.
(() => {
    const hostname = window.location.hostname || '';
    const isLocal = ['', 'localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
    window.appConfig = {
        apiUrl: isLocal ? 'http://localhost:8000' : 'https://ai-connector-szkl.onrender.com'
    };
})();
