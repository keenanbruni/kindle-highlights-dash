let chart = null;

function updateChart(data) {
  const ctx = document.getElementById('highlightsChart').getContext('2d');
  
  if (chart) {
    chart.destroy();
  }

  // Sort data chronologically by page number
  const sortedData = [...data].sort((a, b) => a.startPage - b.startPage);

  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sortedData.map(d => d.title),
      datasets: [{
        label: 'Highlights per Chapter',
        data: sortedData.map(d => d.count),
        backgroundColor: 'rgba(0, 102, 204, 0.2)',
        borderColor: 'rgba(0, 102, 204, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          left: 20,
          right: 20,
          bottom: 100  // Add more padding at bottom for labels
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            maxRotation: 45,
            minRotation: 45,
            autoSkip: false,  // Show all labels
            font: {
              size: 10  // Smaller font size
            }
          }
        }
      },
      plugins: {
        tooltip: {
          callbacks: {
            title: function(context) {
              return sortedData[context[0].dataIndex].title;
            }
          }
        }
      }
    }
  });
}

function updateStats(data) {
  const totalHighlights = data.reduce((sum, d) => sum + d.count, 0);
  const totalChapters = data.length;
  const avgHighlights = (totalHighlights / totalChapters).toFixed(1);

  document.getElementById('total-highlights').textContent = totalHighlights;
  document.getElementById('total-chapters').textContent = totalChapters;
  document.getElementById('avg-highlights').textContent = avgHighlights;
}

function exportToCSV(data) {
  const headers = ['Chapter', 'Start Page', 'Highlight Count'];
  const csvContent = [
    headers.join(','),
    ...data.map(row => [
      `"${row.title.replace(/"/g, '""')}"`,
      row.startPage,
      row.count
    ].join(','))
  ].join('\n');

  downloadFile(csvContent, 'kindle-highlights.csv', 'text/csv');
}

function exportToJSON(data) {
  const jsonContent = JSON.stringify(data, null, 2);
  downloadFile(jsonContent, 'kindle-highlights.json', 'application/json');
}

function downloadFile(content, fileName, contentType) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

document.getElementById('run-dashboard').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs.length === 0) return;

    const statusEl = document.getElementById('status');
    statusEl.textContent = 'Initializing... (0%)';
    statusEl.style.display = 'block';
    document.getElementById('export-data').disabled = true;
    document.getElementById('warning-message').style.display = 'none'; // Add this line
    
    chrome.tabs.sendMessage(tabs[0].id, { action: 'runDashboard' }, null, response => {
      if (chrome.runtime.lastError) {
        statusEl.textContent = 'Error: ' + chrome.runtime.lastError.message;
        return;
      }
    });
  });
});

// Add message listener for progress updates
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'progress') {
    const statusEl = document.getElementById('status');
    statusEl.textContent = `${message.details} (${message.percentage}%)`;
  } else if (message.type === 'complete' && message.data) {
    document.getElementById('results-container').style.display = 'block';
    document.getElementById('status').style.display = 'none';
    document.getElementById('export-data').disabled = false;
    
    // Use CSS class instead of inline styles
    document.body.classList.add('processed');
    
    updateStats(message.data);
    updateChart(message.data);
    window.dashboardData = message.data;
  }
});

// Initially disable export button
document.getElementById('export-data').disabled = true;

document.getElementById('export-data').addEventListener('click', () => {
  const format = document.getElementById('export-format').value;
  const data = window.dashboardData;
  
  if (!data) {
    console.error('No data available for export');
    return;
  }

  if (format === 'csv') {
    exportToCSV(data);
  } else if (format === 'json') {
    exportToJSON(data);
  }
});
