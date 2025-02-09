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
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          }
        },
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 45
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

    document.getElementById('status').textContent = 'Processing...';
    document.getElementById('warning').style.display = 'block';
    document.getElementById('export-data').disabled = true;
    
    chrome.tabs.sendMessage(tabs[0].id, { action: 'runDashboard' }, response => {
      if (response && response.data) {
        document.getElementById('results-container').style.display = 'block';
        document.getElementById('status').textContent = 'Dashboard updated!';
        document.getElementById('warning').style.display = 'none';
        document.getElementById('export-data').disabled = false;
        updateStats(response.data);
        updateChart(response.data);
        
        // Store the data for export
        window.dashboardData = response.data;
      } else {
        document.getElementById('status').textContent = 'Error processing data.';
        document.getElementById('warning').style.display = 'none';
      }
    });
  });
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
