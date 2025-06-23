const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const port = 3001;

app.use(express.json());
app.use(express.static('public'));
app.use(cors());

// Mock data
const mockCalls = [
  {
    call_id: 1,
    phone_number: '818-322-7011',
    recording_url: 'https://drive.google.com/file/d/abc123',
    call_date: '2025-06-10T10:30:00Z',
    file_name: '6_10_2025-818_322_7011.mp3',
    processed_at: '2025-06-22T05:21:41.151Z'
  },
  {
    call_id: 2,
    phone_number: '555-123-4567',
    recording_url: 'https://drive.google.com/file/d/def456',
    call_date: '2025-06-09T14:15:00Z',
    file_name: '6_9_2025-555_123_4567.mp3',
    processed_at: '2025-06-21T08:30:00.000Z'
  }
];

app.get('/api/calls', (req, res) => {
  res.json(mockCalls);
});

app.get('/api/stats', (req, res) => {
  res.json({
    total: mockCalls.length,
    today: 1,
    week: mockCalls.length
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`🚀 Mock CRM Server running at http://localhost:${port}`);
  console.log(`📊 Visit http://localhost:${port} to view your CRM`);
});