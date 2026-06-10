// content-script.js

/**
 * Helper function to pause execution for a given number of milliseconds.
 * @param {number} ms - Number of milliseconds to wait.
 * @returns {Promise<void>}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parse a Kindle page or location label.
 * @param {string} text - Text containing a page or location number.
 * @param {string} [preferredType] - Preferred coordinate type when both are present.
 * @returns {{type: string, number: number} | null}
 */
function parsePositionText(text, preferredType) {
    const matches = [
        ...(text?.matchAll(/\b(Page|Location|Loc\.?)\s+([\d,]+)/gi) || [])
    ];
    if (!matches.length) {
        return null;
    }

    const match = matches.find(candidate => {
        const type = candidate[1].toLowerCase().startsWith('page')
            ? 'page'
            : 'location';
        return type === preferredType;
    }) || matches[0];

    const number = Number.parseInt(match[2].replace(/,/g, ''), 10);
    if (!Number.isFinite(number)) {
        return null;
    }

    return {
        type: match[1].toLowerCase().startsWith('page') ? 'page' : 'location',
        number
    };
}

/**
 * Helper function to get the TOC button from the shadow DOM.
 * @returns {HTMLElement|null} - The TOC button element or null if not found.
 */
function getShadowButton() {
    const parentButton = document.querySelector("#top_menu_right_buttons_group > ion-button:nth-child(1)");
    return parentButton?.shadowRoot.querySelector("button > span");
}

/**
 * Find Kindle's history control, such as "Back to 273".
 * @returns {HTMLElement|null}
 */
function getBackNavigationControl() {
    const controls = document.querySelectorAll(
        'button, ion-button, [role="button"]'
    );

    return [...controls].find(control => {
        const label = [
            control.textContent,
            control.getAttribute?.('aria-label'),
            control.getAttribute?.('title')
        ].filter(Boolean).join(' ').trim();

        return /^Back to\b/i.test(label);
    }) || null;
}

/**
 * Return to the page Kindle had open before the chapter scan.
 * @param {{type: string, number: number} | null} originalPosition
 * @returns {Promise<boolean>}
 */
async function restoreOriginalPosition(originalPosition) {
    const backControl = getBackNavigationControl();
    if (!backControl) {
        console.error("Kindle's back-to-original-page control was not found");
        return false;
    }

    backControl.click();

    const timeoutAt = Date.now() + 10000;
    while (Date.now() < timeoutAt) {
        await delay(250);

        if (!originalPosition) {
            return true;
        }

        const currentPosition = await getCurrentPosition();
        if (currentPosition &&
            currentPosition.type === originalPosition.type &&
            currentPosition.number === originalPosition.number) {
            return true;
        }
    }

    console.error("Kindle did not return to the original page before timeout");
    return false;
}

/**
 * Helper function to simulate hover on an element
 * @param {JQuery<HTMLElement>} $element - The jQuery element to hover over
 * @param {number} hoverTime - Time in milliseconds to hover
 */
async function simulateHover($element) {
    $element.trigger('mouseenter');
    await delay(500); // Hover for half a second
    return $element;
}

async function triggerClick($element) {
  // Try multiple click methods
  const element = $element[0];
  element.click(); // Native click
  await delay(500);
  $element.trigger('click'); // jQuery click
  await delay(500);
  
  // Programmatic click as fallback
  const clickEvent = new MouseEvent('click', {
    view: window,
    bubbles: true,
    cancelable: true
  });
  element.dispatchEvent(clickEvent);
  await delay(500);
}

/**
 * Helper function to properly interact with ion-item elements
 * @param {Element} ionItem - The ion-item element to interact with
 */
async function triggerIonItemClick(ionItem) {
    // Get the ion-label element inside the ion-item
    const ionLabel = ionItem.querySelector('ion-label');
    
    // Create and dispatch proper ion events
    const ionClickEvent = new CustomEvent('click', {
        bubbles: true,
        composed: true,
        detail: { sourceEvent: { isTrusted: true } }
    });

    // Focus and click the label
    if (ionLabel) {
        ionLabel.focus();
        await delay(100);
        ionLabel.dispatchEvent(ionClickEvent);
    }
    
    // Also click the item itself
    ionItem.dispatchEvent(ionClickEvent);
    await delay(500);
}

/**
 * Helper function to get the current location/page from any possible source
 * @returns {Promise<{type: string, number: number} | null>}
 */
async function getCurrentPosition() {
    // Try multiple selectors and contexts
    const possibleSelectors = [
        "div.text-div",
        "#reader-footer div.text-div",
        "iframe#KindleReaderIFrame",
        "#kindleReader-footer div.text-div"
    ];

    for (const selector of possibleSelectors) {
        const element = document.querySelector(selector);
        if (element) {
            // If it's an iframe, we need to access its content
            if (element.tagName === 'IFRAME') {
                try {
                    const iframeContent = element.contentDocument || element.contentWindow.document;
                    const progressDiv = iframeContent.querySelector("div.text-div");
                    if (progressDiv) {
                        const text = progressDiv.textContent.trim();
                        console.log(`Found position in iframe: ${text}`);
                        const position = parsePositionText(text);
                        if (position) {
                            return position;
                        }
                    }
                } catch (e) {
                    console.error('Error accessing iframe content:', e);
                }
            } else {
                const text = element.textContent.trim();
                console.log(`Found position in element: ${text}`);
                const position = parsePositionText(text);
                if (position) {
                    return position;
                }
            }
        }
    }
    return null;
}

/**
 * Helper function to get position data from a TOC item
 * @param {JQuery<HTMLElement>} $tocItem - The TOC item element
 * @returns {Promise<number|null>}
 */
async function getItemPosition($tocItem) {
    // Try to get position from data attributes
    const position = $tocItem.attr('data-position') || 
                    $tocItem.attr('data-cfi') || 
                    $tocItem.attr('data-location');
                    
    if (position) {
        console.log(`Found position attribute: ${position}`);
        return parseInt(position, 10);
    }

    // Try to get position from anchor href
    const anchor = $tocItem.find('a[href]').attr('href');
    if (anchor) {
        const posMatch = anchor.match(/position=(\d+)/);
        if (posMatch) {
            console.log(`Found position in href: ${posMatch[1]}`);
            return parseInt(posMatch[1], 10);
        }
    }

    return null;
}

async function getChapterData(progressCallback, startingPositionCallback) {
    // Add test mode check
    if (window.location.hash === '#test') {
        const { chapters } = generateTestData();
        return chapters;
    }
    
    const chapters = [];
    let previousPosition = null;
    
    // --- STEP 1 & 2: Open TOC ---
    const $pageContainer = $('.pagination-container');
    if (!$pageContainer.length) {
        console.error("Page container not found. Please adjust the selector.");
        return chapters;
    }
    
    $pageContainer.click();
    await delay(1000);

    if (startingPositionCallback) {
        startingPositionCallback(await getCurrentPosition());
    }

    const tocButton = getShadowButton();
    if (!tocButton) {
      console.error("TOC button not found. Please adjust the selector.");
      return chapters;
    }
    tocButton.click();
    await delay(1000);
  
    // --- STEP 3: Get TOC items ---
    const tocItems = document.querySelectorAll('ion-item.toc-item');
    if (!tocItems.length) {
        console.error("No TOC items found. Please adjust the selector.");
        return chapters;
    }

    // --- STEP 4: Iterate through chapters while keeping TOC open ---
    let index = 0;
    for (const item of tocItems) {
        const titleElement = item.querySelector('.chapter-title');
        const chapterTitle = titleElement ? titleElement.textContent.trim() : 'Unknown Chapter';

        if (progressCallback) {
            progressCallback(index + 1, tocItems.length, chapterTitle);
        }

        console.log(`Processing chapter: "${chapterTitle}"`);

        let locationChanged = false;
        for (let attempt = 0; attempt < 3 && !locationChanged; attempt++) {
            // Use the new ion-item click handling
            await triggerIonItemClick(item);
            await delay(2000);

            const position = await getCurrentPosition();
            console.log(`Current position for "${chapterTitle}":`, position);
            
            if (position) {
                if (!previousPosition || previousPosition.number !== position.number) {
                    locationChanged = true;
                    previousPosition = position;
                    chapters.push({ 
                        title: chapterTitle, 
                        page: position.number,
                        type: position.type 
                    });
                    console.log(`Successfully navigated to "${chapterTitle}" at ${position.type} ${position.number}`);
                    break;
                }
            }
            console.log(`Attempt ${attempt + 1}: Waiting for location change...`);
        }

        if (!locationChanged) {
            console.error(`Failed to navigate to "${chapterTitle}" after 3 attempts`);
        }

        index++;
    }

    return chapters;
  }
  
/**
 * Helper function to click the annotations button and wait for content
 * @returns {Promise<void>}
 */
async function openAnnotations() {
    const annotationsButton = document.querySelector([
        'ion-button[data-testid="top_menu_notebook"]',
        'ion-button[item-i-d="top_menu_notebook"]',
        'ion-button[aria-label="Annotations"]',
        'ion-button[title="Annotations"]'
    ].join(', '));

    if (!annotationsButton) {
        console.error("Annotations button not found");
        return false;
    }

    annotationsButton.click();

    const timeoutAt = Date.now() + 10000;
    while (Date.now() < timeoutAt) {
        const annotationItems = document.querySelectorAll('.notebook-editable-item');
        if (annotationItems.length > 0) {
            return true;
        }
        await delay(250);
    }

    console.error("Annotations panel opened, but no annotation items were found");
    return false;
}

/**
 * Updated highlight collection function
 * @returns {Promise<Array<{page: number, type: string, text: string}>>}
 */
async function getHighlightsData(preferredPositionType) {
    // Add test mode check
    if (window.location.hash === '#test') {
        const { highlights } = generateTestData();
        return highlights;
    }
    
    const opened = await openAnnotations();
    if (!opened) {
        console.error("Could not open annotations view");
        return [];
    }

    const highlights = [];
    const items = document.querySelectorAll('.notebook-editable-item');
    
    items.forEach(item => {
        const titleElem = item.querySelector('.grouped-annotation_title');
        const textElem = item.querySelector('.notebook-editable-item-black');

        const position =
            parsePositionText(titleElem?.textContent, preferredPositionType) ||
            parsePositionText(item.textContent, preferredPositionType);

        if (position) {
            highlights.push({
                page: position.number,
                type: position.type,
                text: textElem?.textContent.trim() || ''
            });
        }
    });

    console.log(`Found ${highlights.length} highlights`);
    return highlights;
}

/**
 * Assigns each highlight to a chapter based on the starting page numbers of the chapters.
 *
 * For each highlight page, the function determines which chapter it belongs to by
 * selecting the last chapter whose starting page is less than or equal to the highlight page.
 *
 * @param {Array<{title: string, page: number}>} chapters - Array of chapters with start pages.
 * @param {Array<{page: number, type?: string}>} highlights - Highlight positions.
 * @returns {Array<{title: string, startPage: number, count: number}>} - Array with the count of highlights per chapter.
 */
function assignHighlightsToChapters(chapters, highlights) {
    // Do not sort chapters so that they preserve the correct TOC order.
    const comparableHighlights = highlights
        .filter(highlight => chapters.some(chapter =>
            !highlight.type || !chapter.type || highlight.type === chapter.type
        ))
        .sort((a, b) => a.page - b.page);
  
    // Initialize count objects based on the natural TOC order.
    const chapterHighlightCounts = chapters.map(chapter => ({
      title: chapter.title,
      startPage: chapter.page,
      count: 0
    }));
  
    // For each highlight, iterate from the last chapter backwards.
    comparableHighlights.forEach(highlight => {
        for (let i = chapters.length - 1; i >= 0; i--) {
            const samePositionType = !highlight.type ||
                !chapters[i].type ||
                highlight.type === chapters[i].type;

            if (samePositionType && highlight.page >= chapters[i].page) {
                chapterHighlightCounts[i].count++;
                break;
            }
        }
    });
  
    return chapterHighlightCounts;
}
  
/**
 * Main function to run the dashboard extraction process.
 * It gets chapter data, extracts highlights, tallies them per chapter,
 * and logs the results.
 */
async function runDashboard() {
    console.log("Starting dashboard extraction...");
    const isTestMode = window.location.hash === '#test';
    let originalPosition = null;
    
    const sendProgress = (percentage, details) => {
        chrome.runtime.sendMessage({
            type: 'progress',
            percentage: Math.round(percentage),
            details
        });
    };

    sendProgress(0, 'Opening Table of Contents...');
    const chapters = await getChapterData((current, total, chapter) => {
        const percentage = (current / total) * 70; // TOC processing is 70% of total
        sendProgress(percentage, `Processing chapter ${current}/${total}: ${chapter}`);
    }, position => {
        originalPosition = position;
        console.log("Original reading position:", originalPosition);
    });
    console.log("Chapters extracted:", chapters);
    
    sendProgress(70, 'Collecting highlights...');
    const preferredPositionType = chapters.find(chapter => chapter.type)?.type;
    const highlights = await getHighlightsData(preferredPositionType);
    console.log("Highlights extracted:", highlights);
    
    sendProgress(90, 'Processing data...');
    const results = assignHighlightsToChapters(chapters, highlights);
    console.log("Highlight counts per chapter:", results);

    if (!isTestMode) {
        sendProgress(95, 'Returning to your original page...');
        const restored = await restoreOriginalPosition(originalPosition);
        console.log("Original reading position restored:", restored);
    }
    
    chrome.runtime.sendMessage({
        type: 'complete',
        data: results
    });
    
    return results;
}

// --- Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'runDashboard') {
        runDashboard().then((results) => {
            sendResponse({ 
                status: 'Dashboard process completed.',
                data: results
            });
        });
        return true;
    }
});

// Add this function near the top with other helper functions
function generateTestData() {
    const chapters = [];
    const highlights = [];
    
    // INSTRUCTIONS: add #test to the URL and then run the extension
    // This will generate test data instead of trying to interact with the Kindle Cloud Reader
    // Generate 35 chapters with increasing page numbers
    for (let i = 1; i <= 35; i++) {
        chapters.push({
            title: `Chapter ${i}: Test Chapter With A Long Name That Tests Layout`,
            page: i * 20, // Pages increase by 20 to simulate real book spacing
            type: 'page'
        });
        
        // Generate 5-15 random highlights for each chapter
        const numHighlights = Math.floor(Math.random() * 10) + 5;
        for (let j = 0; j < numHighlights; j++) {
            highlights.push({
                page: (i * 20) + Math.floor(Math.random() * 19), // Random page within chapter
                text: `Test highlight ${j + 1} for chapter ${i}`
            });
        }
    }
    
    return { chapters, highlights };
}
