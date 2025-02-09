document.getElementById('run-dashboard').addEventListener('click', () => {
    // Query the active tab (which should be read.amazon.com)
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs.length === 0) return;
  
      // Send a message to the content script in the active tab
      chrome.tabs.sendMessage(tabs[0].id, { action: 'runDashboard' }, response => {
        // Update the popup status based on the response
        document.getElementById('status').textContent =
          response && response.status ? response.status : 'Dashboard process triggered.';
      });
    });
  });
  