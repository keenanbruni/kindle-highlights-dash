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
 * Helper function to get the TOC button from the shadow DOM.
 * @returns {HTMLElement|null} - The TOC button element or null if not found.
 */
function getShadowButton() {
    const parentButton = document.querySelector("#top_menu_right_buttons_group > ion-button:nth-child(1)");
    return parentButton?.shadowRoot.querySelector("button > span");
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
                        const match = text.match(/(Page|Location)\s+(\d+)\s+of\s+\d+/);
                        if (match) {
                            return { type: match[1].toLowerCase(), number: parseInt(match[2], 10) };
                        }
                    }
                } catch (e) {
                    console.error('Error accessing iframe content:', e);
                }
            } else {
                const text = element.textContent.trim();
                console.log(`Found position in element: ${text}`);
                const match = text.match(/(Page|Location)\s+(\d+)\s+of\s+\d+/);
                if (match) {
                    return { type: match[1].toLowerCase(), number: parseInt(match[2], 10) };
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

async function getChapterData(progressCallback) {
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
    const annotationsButton = document.querySelector('ion-button[title="Annotations"]');
    if (!annotationsButton) {
        console.error("Annotations button not found");
        return false;
    }

    // Click the annotations button using similar ion-button click handling
    const clickEvent = new CustomEvent('click', {
        bubbles: true,
        composed: true,
        detail: { sourceEvent: { isTrusted: true } }
    });
    annotationsButton.dispatchEvent(clickEvent);
    
    // Wait for annotations to load
    await delay(2000);
    
    // Verify annotations loaded
    const annotationItems = document.querySelectorAll('.notebook-editable-item');
    return annotationItems.length > 0;
}

/**
 * Updated highlight collection function
 * @returns {Promise<Array<{page: number, text: string}>>}
 */
async function getHighlightsData() {
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
        
        if (titleElem && textElem) {
            const titleText = titleElem.textContent.trim();
            const match = titleText.match(/Page\s+(\d+)/);
            
            if (match && match[1]) {
                highlights.push({
                    page: parseInt(match[1], 10),
                    text: textElem.textContent.trim()
                });
            }
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
 * @param {number[]} highlights - Array of highlight page numbers.
 * @returns {Array<{title: string, startPage: number, count: number}>} - Array with the count of highlights per chapter.
 */
function assignHighlightsToChapters(chapters, highlights) {
    // Sort chapters by their starting page number.
    chapters.sort((a, b) => a.page - b.page);
    // Sort highlight page numbers.
    highlights.sort((a, b) => a - b);
  
    // Initialize count objects for each chapter.
    const chapterHighlightCounts = chapters.map(chapter => ({
      title: chapter.title,
      startPage: chapter.page,
      count: 0
    }));
  
    // For each highlight, find which chapter it belongs to.
    highlights.forEach(highlightPage => {
      let assignedChapterIndex = null;
      // Since chapters are sorted, assign the highlight to the last chapter with a start page <= highlightPage.
      for (let i = 0; i < chapters.length; i++) {
        if (highlightPage >= chapters[i].page) {
          assignedChapterIndex = i;
        } else {
          break;
        }
      }
      if (assignedChapterIndex !== null) {
        chapterHighlightCounts[assignedChapterIndex].count++;
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
    });
    console.log("Chapters extracted:", chapters);
    
    sendProgress(70, 'Collecting highlights...');
    const highlights = await getHighlightsData();
    console.log("Highlights extracted:", highlights);
    
    sendProgress(90, 'Processing data...');
    const results = assignHighlightsToChapters(chapters, highlights.map(h => h.page));
    console.log("Highlight counts per chapter:", results);
    
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
