const express = require('express');
const path = require('path');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 3001;

// MongoDB connection string - replace with your actual connection string
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://littlekewk:<qfYeboHxEjPNPkpc>@mycrm.pdilpxj.mongodb.net/?retryWrites=true&w=majority&appName=MyCRM';
const DB_NAME = 'call-crm';
const COLLECTION_NAME = 'calls';

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(cors());

// MongoDB client
let client = null;
let db = null;
let callsCollection = null;

// Connect to MongoDB
async function connectToMongoDB() {
  try {
    client = new MongoClient(MONGO_URI);
    await client.connect();
    console.log('🔌 Connected to MongoDB Atlas');
    
    db = client.db(DB_NAME);
    callsCollection = db.collection(COLLECTION_NAME);
    console.log('📊 Database and collection ready');
    
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    return false;
  }
}

// Generate unique ID
function generateId() {
  return Date.now() + Math.random().toString(36).substr(2, 9);
}

// API Routes

// Get all calls
app.get('/api/calls', async (req, res) => {
  try {
    const calls = await callsCollection.find({}).sort({ call_date: -1 }).toArray();
    res.json(calls);
  } catch (err) {
    console.error('Error fetching calls:', err);
    res.status(500).json({ error: 'Failed to fetch calls' });
  }
});

// Add new call (from n8n workflow)
app.post('/api/calls', async (req, res) => {
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
    
    const result = await callsCollection.insertOne(newCall);
    
    if (result.acknowledged) {
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
app.put('/api/calls/:id/prospect', async (req, res) => {
  try {
    const { id } = req.params;
    const { prospect_name } = req.body;
    
    const result = await callsCollection.updateOne(
      { call_id: id },
      { $set: { prospect_name: prospect_name } }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    const updatedCall = await callsCollection.findOne({ call_id: id });
    res.json(updatedCall);
    
  } catch (err) {
    console.error('Error updating prospect:', err);
    res.status(500).json({ error: 'Failed to update prospect name' });
  }
});

// Update notes
app.put('/api/calls/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    
    const result = await callsCollection.updateOne(
      { call_id: id },
      { $set: { notes: notes } }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    const updatedCall = await callsCollection.findOne({ call_id: id });
    res.json(updatedCall);
    
  } catch (err) {
    console.error('Error updating notes:', err);
    res.status(500).json({ error: 'Failed to update notes' });
  }
});

// Delete a single call
app.delete('/api/calls/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await callsCollection.deleteOne({ call_id: id });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    res.json({ success: true, message: 'Call deleted successfully' });
    
  } catch (err) {
    console.error('Error deleting call:', err);
    res.status(500).json({ error: 'Failed to delete call: ' + err.message });
  }
});

// Bulk delete calls
app.post('/api/calls/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No valid IDs provided for deletion' });
    }
    
    const result = await callsCollection.deleteMany({ call_id: { $in: ids } });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'No matching calls found' });
    }
    
    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} calls`
    });
    
  } catch (err) {
    console.error('Error bulk deleting calls:', err);
    res.status(500).json({ error: 'Failed to delete calls: ' + err.message });
  }
});

// Get call statistics
app.get('/api/stats', async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const total = await callsCollection.countDocuments({});
    
    // For today's calls, we need to handle potential date format issues
    const todayCalls = await callsCollection.countDocuments({
      $or: [
        { call_date: { $regex: today.toISOString().split('T')[0] } },
        { 
          call_date: { 
            $type: "date", 
            $gte: today 
          } 
        }
      ]
    });
    
    // For week's calls, we need to handle potential date format issues
    const weekCalls = await callsCollection.countDocuments({
      $or: [
        { 
          call_date: { 
            $type: "date", 
            $gte: weekAgo 
          } 
        },
        {
          call_date: {
            $type: "string",
            $gte: weekAgo.toISOString()
          }
        }
      ]
    });
    
    res.json({
      total: total,
      today: todayCalls,
      week: weekCalls
    });
    
  } catch (err) {
    console.error('Error fetching statistics:', err);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'CRM server is running with MongoDB!', 
    time: new Date().toISOString(),
    storage: 'MongoDB Atlas',
    database: DB_NAME,
    collection: COLLECTION_NAME
  });
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
async function startServer() {
  const connected = await connectToMongoDB();
  
  if (!connected) {
    console.error('❌ Failed to connect to MongoDB. Server will not start.');
    process.exit(1);
  }
  
  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Call CRM Server running at http://localhost:${port}`);
    console.log(`📊 Visit http://localhost:${port} to view your CRM`);
    console.log(`📡 n8n can send data to: http://localhost:${port}/api/calls`);
    console.log(`💾 Data stored in MongoDB Atlas`);
  });
}

startServer();

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  if (client) {
    await client.close();
    console.log('📊 MongoDB connection closed');
  }
  process.exit(0);
});
