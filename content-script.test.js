const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'content-script.js'), 'utf8');
const context = {
    console,
    setTimeout,
    clearTimeout,
    chrome: {
        runtime: {
            onMessage: { addListener() {} },
            sendMessage() {}
        }
    }
};

vm.createContext(context);
vm.runInContext(source, context);

test('parsePositionText parses page and location labels', () => {
    assert.deepEqual(
        { ...context.parsePositionText('Page 42 of 300') },
        { type: 'page', number: 42 }
    );
    assert.deepEqual(
        { ...context.parsePositionText('Yellow highlight | Location 1,234') },
        { type: 'location', number: 1234 }
    );
    assert.deepEqual(
        { ...context.parsePositionText('Loc. 987') },
        { type: 'location', number: 987 }
    );
    assert.deepEqual(
        { ...context.parsePositionText('Location 1,234 | Page 42', 'page') },
        { type: 'page', number: 42 }
    );
});

test('assignHighlightsToChapters counts matching location positions', () => {
    const chapters = [
        { title: 'One', page: 100, type: 'location' },
        { title: 'Two', page: 200, type: 'location' }
    ];
    const highlights = [
        { page: 150, type: 'location' },
        { page: 225, type: 'location' },
        { page: 250, type: 'page' }
    ];

    assert.deepEqual(
        context.assignHighlightsToChapters(chapters, highlights).map(value => ({ ...value })),
        [
            { title: 'One', startPage: 100, count: 1 },
            { title: 'Two', startPage: 200, count: 1 }
        ]
    );
});

test('getBackNavigationControl finds Kindle back-to-page button', () => {
    const unrelatedButton = {
        textContent: '',
        getAttribute(name) {
            return name === 'aria-label' ? 'Next page' : null;
        }
    };
    const backButton = {
        textContent: 'Back to 273',
        getAttribute() {
            return null;
        }
    };

    context.document = {
        querySelectorAll(selector) {
            assert.equal(selector, 'button, ion-button, [role="button"]');
            return [unrelatedButton, backButton];
        }
    };

    assert.equal(context.getBackNavigationControl(), backButton);
});

test('openAnnotations uses the current Kindle notebook button selector', async () => {
    const button = {
        clickCalled: false,
        click() {
            this.clickCalled = true;
        }
    };
    let itemLookupCount = 0;

    context.document = {
        querySelector(selector) {
            assert.match(selector, /top_menu_notebook/);
            return button;
        },
        querySelectorAll(selector) {
            assert.equal(selector, '.notebook-editable-item');
            itemLookupCount++;
            return itemLookupCount > 1 ? [{}] : [];
        }
    };

    assert.equal(await context.openAnnotations(), true);
    assert.equal(button.clickCalled, true);
});
