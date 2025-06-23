const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const port = 3001;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(cors());

// Data file path
const dataFile = path.join(__dirname, 'calls-data.json');

// Initialize data file if it doesn't exist
function initializeDataFile() {
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify([], null, 2));
    console.log('📄 Created calls-data.json file');
  }
}

// Read calls from file
function readCalls() {
  try {
    const data = fs.readFileSync(dataFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading calls data:', error);
    return [];
  }
}

// Write calls to file
function writeCalls(calls) {
  try {
    fs.writeFileSync(dataFile, JSON.stringify(calls, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing calls data:', error);
    return false;
  }
}

// Generate unique ID
function generateId() {
  return Date.now() + Math.random().toString(36).substr(2, 9);
}

// API Routes

// Get all calls
app.get('/api/calls', (req, res) => {
  try {
    const calls = readCalls();
    calls.sort((a, b) => new Date(b.call_date) - new Date(a.call_date));
    res.json(calls);
  } catch (err) {
    console.error('Error fetching calls:', err);
    res.status(500).json({ error: 'Failed to fetch calls' });
  }
});

// Add new call (from n8n workflow)
app.post('/api/calls', (req, res) => {
  try {
    console.log('📞 Received new call data from n8n:', req.body);
    
    const newCall = {
      call_id: generateId(),
      phone_number: req.body.phone_number || '',
      recording_url: req.body.download_url || req.body.recording_url || '',
      call_date: req.body.call_date || new Date().toISOString(),
      file_name: req.body.file_name || '',
      processed_at: req.body.processed_at || new Date().toISOString(),
      prospect_name: req.body.prospect_name || '',
      notes: req.body.notes || ''
    };
    
    const calls = readCalls();
    calls.push(newCall);
    
    if (writeCalls(calls)) {
      console.log('✅ Successfully added new call:', newCall.phone_number);
      res.json({ success: true, call: newCall });
    } else {
      res.status(500).json({ error: 'Failed to save call data' });
    }
    
  } catch (err) {
    console.error('Error adding call:', err);
    res.status(500).json({ error: 'Failed to add call: ' + err.message });
  }
});

// Update prospect name
app.put('/api/calls/:id/prospect', (req, res) => {
  try {
    const { id } = req.params;
    const { prospect_name } = req.body;
    
    const calls = readCalls();
    const callIndex = calls.findIndex(call => call.call_id === id);
    
    if (callIndex === -1) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    calls[callIndex].prospect_name = prospect_name;
    
    if (writeCalls(calls)) {
      res.json(calls[callIndex]);
    } else {
      res.status(500).json({ error: 'Failed to update prospect name' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update prospect name' });
  }
});

// Update notes
app.put('/api/calls/:id/notes', (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    
    const calls = readCalls();
    const callIndex = calls.findIndex(call => call.call_id === id);
    
    if (callIndex === -1) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    calls[callIndex].notes = notes;
    
    if (writeCalls(calls)) {
      res.json(calls[callIndex]);
    } else {
      res.status(500).json({ error: 'Failed to update notes' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to update notes' });
  }
});

// Get call statistics
app.get('/api/stats', (req, res) => {
  try {
    const calls = readCalls();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const todayCalls = calls.filter(call => {
      const callDate = new Date(call.call_date);
      return callDate >= today;
    });
    
    const weekCalls = calls.filter(call => {
      const callDate = new Date(call.call_date);
      return callDate >= weekAgo;
    });
    
    res.json({
      total: calls.length,
      today: todayCalls.length,
      week: weekCalls.length
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Test endpoint - NO DATABASE REQUIRED
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Local CRM server is running! (No database required)', 
    time: new Date().toISOString(),
    storage: 'JSON file',
    dataFile: dataFile
  });
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize and start server
initializeDataFile();

app.listen(port, () => {
  console.log(`🚀 Automated Call CRM Server running at http://localhost:${port}`);
  console.log(`📊 Visit http://localhost:${port} to view your CRM`);
  console.log(`📡 n8n can send data to: http://localhost:${port}/api/calls`);
  console.log(`💾 Call data stored in: ${dataFile}`);
  console.log(`🔧 Storage: JSON file (no database required)`);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  process.exit(0);
});