const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize SQLite Database
const db = new sqlite3.Database('./attendance.db', (err) => {
  if (err) console.error('Database opening error:', err.message);
  else console.log('Connected to SQLite database.');
});

// Create Records Table
db.run(`
  CREATE TABLE IF NOT EXISTS check_ins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name TEXT NOT NULL,
    action_type TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// API Routes
app.post('/api/checkin', (req, res) => {
  const { userName, actionType, latitude, longitude } = req.body;
  if (!userName || !actionType || !latitude || !longitude) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const query = `INSERT INTO check_ins (user_name, action_type, latitude, longitude) VALUES (?, ?, ?, ?)`;
  db.run(query, [userName, actionType, latitude, longitude], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ status: 'Success', id: this.lastID });
  });
});

app.get('/api/reports/csv', (req, res) => {
  db.all(`SELECT * FROM check_ins ORDER BY timestamp DESC`, [], (err, rows) => {
    if (err) return res.status(500).send('Error generating report');

    let csvContent = 'ID,User Name,Action,Latitude,Longitude,Timestamp\n';
    rows.forEach((row) => {
      csvContent += `${row.id},"${row.user_name}","${row.action_type}",${row.latitude},${row.longitude},"${row.timestamp}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="attendance_report.csv"');
    res.status(200).send(csvContent);
  });
});

// Single Page UI
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Location Check-In System</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-100 min-h-screen flex items-center justify-center p-4">
      <div class="bg-white p-6 rounded-xl shadow-md w-full max-w-md">
        <h1 class="text-2xl font-bold text-center text-slate-800 mb-6">Staff Check-In Tracker</h1>
        
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-slate-700">User Name / Staff ID</label>
            <input type="text" id="userName" placeholder="John Doe" class="mt-1 block w-full rounded-md border border-slate-300 p-2 text-sm focus:ring-2 focus:ring-blue-500">
          </div>

          <div class="flex gap-4">
            <button onclick="handleCheck('IN')" class="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-lg shadow transition">
              Check IN
            </button>
            <button onclick="handleCheck('OUT')" class="w-1/2 bg-rose-600 hover:bg-rose-700 text-white font-semibold py-2 px-4 rounded-lg shadow transition">
              Check OUT
            </button>
          </div>

          <div id="status" class="mt-4 text-center text-sm font-medium"></div>

          <hr class="my-6">

          <a href="/api/reports/csv" download class="block text-center w-full bg-slate-800 hover:bg-slate-900 text-white font-medium py-2 rounded-lg transition">
            Download CSV Report
          </a>
        </div>
      </div>

      <script>
        function handleCheck(actionType) {
          const userName = document.getElementById('userName').value.trim();
          const statusDiv = document.getElementById('status');

          if (!userName) {
            statusDiv.className = 'text-rose-600';
            statusDiv.innerText = 'Please enter your user name.';
            return;
          }

          if (!navigator.geolocation) {
            statusDiv.className = 'text-rose-600';
            statusDiv.innerText = 'Geolocation is not supported by your browser.';
            return;
          }

          statusDiv.className = 'text-blue-600';
          statusDiv.innerText = 'Acquiring GPS location...';

          navigator.geolocation.getCurrentPosition(
            (position) => {
              const latitude = position.coords.latitude;
              const longitude = position.coords.longitude;

              fetch('/api/checkin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userName, actionType, latitude, longitude })
              })
              .then(res => res.json())
              .then(data => {
                if (data.status === 'Success') {
                  statusDiv.className = 'text-emerald-600';
                  statusDiv.innerText = \`Checked \${actionType} recorded successfully at (\${latitude.toFixed(4)}, \${longitude.toFixed(4)})!\`;
                } else {
                  statusDiv.className = 'text-rose-600';
                  statusDiv.innerText = 'Failed to submit check-in.';
                }
              });
            },
            (error) => {
              statusDiv.className = 'text-rose-600';
              statusDiv.innerText = 'Unable to fetch location: ' + error.message;
            },
            { enableHighAccuracy: true }
          );
        }
      </script>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
