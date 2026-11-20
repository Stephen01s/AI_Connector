const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const root = join(__dirname, '..');

function browser(page = 'runs.html', hostname = 'localhost') {
    const elements = new Map();
    const nodes = [];
    class Element {
        constructor(tag = 'div') {
            this.tagName = tag.toUpperCase();
            this.value = '';
            this.textContent = '';
            this.className = '';
            this.children = [];
            this.dataset = {};
            this.listeners = new Map();
            this.hidden = false;
            this.disabled = false;
            this.open = false;
            this.style = {};
            this.isConnected = true;
            this.classList = {
                contains: name => this.className.split(/\s+/).includes(name),
                add: name => { this.className = [...new Set([...this.className.split(/\s+/), name])].join(' '); },
                remove: name => { this.className = this.className.split(/\s+/).filter(item => item !== name).join(' '); },
                toggle: (name, enabled) => {
                    const on = enabled ?? !this.classList.contains(name);
                    this.classList[on ? 'add' : 'remove'](name);
                    return on;
                }
            };
        }
        get options() { return this.children.filter(child => child.tagName === 'OPTION'); }
        get selectedOptions() { return this.options.filter(option => option.value === this.value); }
        addEventListener(type, callback, options = {}) {
            this.listeners.set(type, [...(this.listeners.get(type) || []), {callback, options}]);
        }
        removeEventListener(type, callback) {
            this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item.callback !== callback));
        }
        async emit(type, event = {}) {
            for (const {callback, options} of [...(this.listeners.get(type) || [])]) {
                if (options.once) this.removeEventListener(type, callback);
                await callback({target: this, preventDefault() {}, stopPropagation() {}, ...event});
            }
        }
        append(...children) {
            for (const child of children) { child.parentElement = this; this.children.push(child); }
        }
        appendChild(child) { this.append(child); return child; }
        replaceChildren(...children) { this.children = []; this.append(...children); }
        remove() {
            if (this.parentElement) this.parentElement.children =
                this.parentElement.children.filter(child => child !== this);
        }
        querySelectorAll(selector) {
            const all = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
            return selector === '*' ? all : all.filter(child =>
                selector.startsWith('.') ? child.classList.contains(selector.slice(1)) : child.id === selector.slice(1)
            );
        }
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
        setAttribute(name, value) { this[name] = value; }
        setCustomValidity(message) { this.validityMessage = message; }
        reportValidity() { return !this.validityMessage; }
        focus() {}
        showModal() { this.open = true; }
        close() { this.open = false; return this.emit('close'); }
        insertAdjacentHTML(_position, html) {
            this.insertedHTML = (this.insertedHTML || '') + html;
            register(html);
        }
    }
    function register(html) {
        for (const match of html.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
            const element = new Element(match[1]);
            element.id = match[2].match(/\bid\s*=\s*"([^"]+)"/)?.[1] || '';
            element.hidden = /(?:^|\s)hidden(?:\s|$|=)/.test(match[2]);
            element.disabled = /(?:^|\s)disabled(?:\s|$|=)/.test(match[2]);
            element.className = match[2].match(/\bclass\s*=\s*"([^"]*)"/)?.[1] || '';
            nodes.push(element);
            if (element.id) elements.set(element.id, element);
        }
    }
    register(readFileSync(join(root, 'html', page), 'utf8'));
    const storage = new Map();
    const documentEvents = new Element('document');
    const windowEvents = new Element('window');
    const context = vm.createContext({
        document: {
            body: new Element('body'),
            getElementById: id => elements.get(id) || null,
            querySelector: selector => selector.startsWith('#')
                ? elements.get(selector.slice(1)) || null
                : nodes.find(element => element.classList.contains(selector.slice(1))) || null,
            querySelectorAll: () => [],
            createElement: tag => new Element(tag),
            addEventListener: (...args) => documentEvents.addEventListener(...args)
        },
        window: {
            location: {hostname, search: '', replace() {}}, confirm: () => false,
            addEventListener: (...args) => windowEvents.addEventListener(...args)
        },
        history: {
            pushState: (_state, _title, url) => {
                context.window.location.search = new URL(url, 'http://localhost/html/').search;
            },
            replaceState: (_state, _title, url) => {
                context.window.location.search = new URL(url, 'http://localhost/html/').search;
            }
        },
        localStorage: {getItem: key => storage.get(key) || null},
        sessionStorage: {
            getItem: key => storage.get(key) || null,
            setItem: (key, value) => storage.set(key, value),
            removeItem: key => storage.delete(key)
        },
        console: {error() {}},
        AbortController, Date, URL, URLSearchParams, Blob, setTimeout, clearTimeout
    });
    const evaluate = filename => {
        const source = readFileSync(join(root, 'javascript', filename), 'utf8')
            .replace(/^import[\s\S]*?;\r?\n/gm, '');
        return vm.runInContext(source, context);
    };
    const get = id => { assert.ok(elements.has(id), 'Missing element: ' + id); return elements.get(id); };
    return {context, storage, get, evaluate, elements, Element, documentEvents, windowEvents};
}

const flush = () => new Promise(resolve => setImmediate(resolve));
module.exports = {browser, flush};
