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

document.getElementById('run-dashboard').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (tabs.length === 0) return;

    document.getElementById('status').textContent = 'Processing...';
    document.getElementById('warning').style.display = 'block';
    
    chrome.tabs.sendMessage(tabs[0].id, { action: 'runDashboard' }, response => {
      if (response && response.data) {
        document.getElementById('results-container').style.display = 'block';
        document.getElementById('status').textContent = 'Dashboard updated!';
        document.getElementById('warning').style.display = 'none';
        updateStats(response.data);
        updateChart(response.data);
      } else {
        document.getElementById('status').textContent = 'Error processing data.';
        document.getElementById('warning').style.display = 'none';
      }
    });
  });
});
