const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// Increase body limit to allow base64 image strings in JSON payloads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize SQLite Database
const db = new sqlite3.Database('./attendance.db', (err) => {
  if (err) console.error('DB Error:', err.message);
  else console.log('Connected to SQLite DB.');
});

db.run(`
  CREATE TABLE IF NOT EXISTS check_ins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_name TEXT NOT NULL,
    action_type TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    selfie TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// API Endpoint to Record Attendance with Selfie
app.post('/api/checkin', (req, res) => {
  const { userName, actionType, latitude, longitude, selfie } = req.body;
  if (!userName || !actionType || !latitude || !longitude) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const query = `INSERT INTO check_ins (user_name, action_type, latitude, longitude, selfie) VALUES (?, ?, ?, ?, ?)`;
  db.run(query, [userName, actionType, latitude, longitude, selfie || ''], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ status: 'Success', id: this.lastID });
  });
});

// API Endpoint to Fetch All Records JSON
app.get('/api/records', (req, res) => {
  db.all(`SELECT * FROM check_ins ORDER BY timestamp DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Download CSV Report
app.get('/api/reports/csv', (req, res) => {
  db.all(`SELECT id, user_name, action_type, latitude, longitude, timestamp FROM check_ins ORDER BY timestamp DESC`, [], (err, rows) => {
    if (err) return res.status(500).send('Error generating report');

    let csvContent = 'ID,User Name,Action,Latitude,Longitude,Timestamp,Google Maps Link\n';
    rows.forEach((row) => {
      const mapsUrl = `https://maps.google.com/?q=${row.latitude},${row.longitude}`; csvContent += `${row.id},"${row.user_name}","${row.action_type}",${row.latitude},${row.longitude},"${row.timestamp}","${mapsUrl}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="attendance_report.csv"');
    res.status(200).send(csvContent);
  });
});

// Single Page Responsive UI with Camera Stream & Selfie Capture
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>GPS Attendance & Selfie Tracker</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-100 min-h-screen p-4 md:p-8">
      <div class="max-w-4xl mx-auto space-y-6">
        
        <!-- Check In / Out Card -->
        <div class="bg-white p-6 rounded-xl shadow-md">
          <h1 class="text-2xl font-bold text-slate-800 mb-4 text-center">GPS Attendance with Selfie</h1>
          
          <div class="max-w-md mx-auto space-y-4">
            <div>
              <label class="block text-sm font-medium text-slate-700">User Name / Employee ID</label>
              <input type="text" id="userName" placeholder="Enter your full name" class="mt-1 block w-full rounded-md border border-slate-300 p-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
            </div>

            <!-- Camera Viewfinder -->
            <div class="space-y-2">
              <label class="block text-sm font-medium text-slate-700">Verify Selfie</label>
              <div class="relative bg-slate-900 rounded-lg overflow-hidden aspect-[4/3] flex items-center justify-center">
                <video id="video" autoplay playsinline class="w-full h-full object-cover"></video>
                <canvas id="canvas" class="hidden"></canvas>
                <div id="cameraPlaceholder" class="absolute text-white text-xs text-center p-4">Camera loading or permission required...</div>
              </div>
              <button type="button" onclick="startCamera()" class="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold py-1.5 rounded transition">
                Restart / Enable Camera
              </button>
            </div>

            <div class="flex gap-4 pt-2">
              <button onclick="handleCheck('IN')" class="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-4 rounded-lg shadow transition">
                Check IN + Selfie
              </button>
              <button onclick="handleCheck('OUT')" class="w-1/2 bg-rose-600 hover:bg-rose-700 text-white font-semibold py-2.5 px-4 rounded-lg shadow transition">
                Check OUT + Selfie
              </button>
            </div>

            <div id="status" class="text-center text-sm font-medium"></div>
          </div>
        </div>

        <!-- Live Attendance
