const express = require('express');
const path = require('path');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
const port = process.env.PORT || 3001;

// MongoDB connection string - update with your actual connection string
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://littlekewk:qfYeboHxEjPNPkpc@mycrm.pdilpxj.mongodb.net/?retryWrites=true&w=majority&appName=MyCRM';

// Database names
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

// Generate unique ID
function generateId() {
  return Date.now() + Math.random().toString(36).substr(2, 9);
}

// Connect to MongoDB
async function connectToMongoDB() {
  try {
    console.log('Attempting to connect to MongoDB...');
    
    // Configure MongoDB options
    const options = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };
    
    client = new MongoClient(MONGO_URI, options);
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

// Initialize file-based storage as fallback
function initializeFallbackStorage() {
  console.log('⚠️ Using fallback file storage since MongoDB is not available');
  const fs = require('fs');
  const dataFile = path.join(__dirname, 'calls-data.json');
  
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify([], null, 2));
    console.log('📄 Created fallback calls-data.json file');
  }
  
  return {
    readCalls: () => {
      try {
        const data = fs.readFileSync(dataFile, 'utf8');
        return JSON.parse(data);
      } catch (error) {
        console.error('Error reading calls data:', error);
        return [];
      }
    },
    writeCalls: (calls) => {
      try {
        fs.writeFileSync(dataFile, JSON.stringify(calls, null, 2));
        return true;
      } catch (error) {
        console.error('Error writing calls data:', error);
        return false;
      }
    }
  };
}

// Fallback storage
let fallbackStorage = null;

// API Routes

// Test endpoint - always works even without MongoDB
app.get('/api/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'CRM server is running!', 
    time: new Date().toISOString(),
    mongoUri: MONGO_URI ? (MONGO_URI.substring(0, 20) + '...') : 'Not set',
    databaseConnected: !!callsCollection,
    usingFallback: !!fallbackStorage,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Get all calls
app.get('/api/calls', async (req, res) => {
  try {
    // Use MongoDB if available
    if (callsCollection) {
      const calls = await callsCollection.find({}).sort({ call_date: -1 }).toArray();
      return res.json(calls);
    }
    
    // Use fallback if MongoDB is not available
    if (fallbackStorage) {
      const calls = fallbackStorage.readCalls();
      calls.sort((a, b) => new Date(b.call_date) - new Date(a.call_date));
      return res.json(calls);
    }
    
    res.status(500).json({ error: 'No storage system available' });
  } catch (err) {
    console.error('Error fetching calls:', err);
    res.status(500).json({ error: 'Failed to fetch calls: ' + err.message });
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
    
    // Use MongoDB if available
    if (callsCollection) {
      const result = await callsCollection.insertOne(newCall);
      
      if (result.acknowledged) {
        console.log('✅ Successfully added new call to MongoDB:', newCall.phone_number);
        return res.json({ success: true, call: newCall });
      } else {
        return res.status(500).json({ error: 'Failed to save call data to MongoDB' });
      }
    }
    
    // Use fallback if MongoDB is not available
    if (fallbackStorage) {
      const calls = fallbackStorage.readCalls();
      calls.push(newCall);
      
      if (fallbackStorage.writeCalls(calls)) {
        console.log('✅ Successfully added new call to fallback storage:', newCall.phone_number);
        return res.json({ success: true, call: newCall });
      } else {
        return res.status(500).json({ error: 'Failed to save call data to fallback storage' });
      }
    }
    
    res.status(500).json({ error: 'No storage system available' });
    
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
    
    // Use MongoDB if available
    if (callsCollection) {
      const result = await callsCollection.updateOne(
        { call_id: id },
        { $set: { prospect_name: prospect_name } }
      );
      
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Call not found' });
      }
      
      const updatedCall = await callsCollection.findOne({ call_id: id });
      return res.json(updatedCall);
    }
    
    // Use fallback if MongoDB is not available
    if (fallbackStorage) {
      const calls = fallbackStorage.readCalls();
      const callIndex = calls.findIndex(call => call.call_id === id);
      
      if (callIndex === -1) {
        return res.status(404).json({ error: 'Call not found' });
      }
      
      calls[callIndex].prospect_name = prospect_name;
      
      if (fallbackStorage.writeCalls(calls)) {
        return res.json(calls[callIndex]);
      } else {
        return res.status(500).json({ error: 'Failed to update prospect name in fallback storage' });
      }
    }
    
    res.status(500).json({ error: 'No storage system available' });
    
  } catch (err) {
    console.error('Error updating prospect:', err);
    res.status(500).json({ error: 'Failed to update prospect name: ' + err.message });
  }
});

// Update notes
app.put('/api/calls/:id/notes', async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    
    // Use MongoDB if available
    if (callsCollection) {
      const result = await callsCollection.updateOne(
        { call_id: id },
        { $set: { notes: notes } }
      );
      
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Call not found' });
      }
      
      const updatedCall = await callsCollection.findOne({ call_id: id });
      return res.json(updatedCall);
    }
    
    // Use fallback if MongoDB is not available
    if (fallbackStorage) {
      const calls = fallbackStorage.readCalls();
      const callIndex = calls.findIndex(call => call.call_id === id);
      
      if (callIndex === -1) {
        return res.status(404).json({ error: 'Call not found' });
      }
      
      calls[callIndex].notes = notes;
      
      if (fallbackStorage.writeCalls(calls)) {
        return res.json(calls[callIndex]);
      } else {
        return res.status(500).json({ error: 'Failed to update notes in fallback storage' });
      }
    }
    
    res.status(500).json({ error: 'No storage system available' });
    
  } catch (err) {
    console.error('Error updating notes:', err);
    res.status(500).json({ error: 'Failed to update notes: ' + err.message });
  }
});

// Delete a single call
app.delete('/api/calls/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Use MongoDB if available
    if (callsCollection) {
      const result = await callsCollection.deleteOne({ call_id: id });
      
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Call not found' });
      }
      
      return res.json({ success: true, message: 'Call deleted successfully' });
    }
    
    // Use fallback if MongoDB is not available
    if (fallbackStorage) {
      const calls = fallbackStorage.readCalls();
      const initialLength = calls.length;
      
      const filteredCalls = calls.filter(call => call.call_id !== id);
      
      if (filteredCalls.length === initialLength) {
        return res.status(404).json({ error: 'Call not found' });
      }
      
      if (fallbackStorage.writeCalls(filteredCalls)) {
        return res.json({ success: true, message: 'Call deleted successfully' });
      } else {
        return res.status(500).json({ error: 'Failed to delete call in fallback storage' });
      }
    }
    
    res.status(500).json({ error: 'No storage system available' });
    
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
    
    // Use MongoDB if available
    if (callsCollection) {
      const result = await callsCollection.deleteMany({ call_id: { $in: ids } });
      
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'No matching calls found' });
      }
      
      return res.json({
        success: true,
        message: `Successfully deleted ${result.deletedCount} calls`
      });
    }
    
    // Use fallback if MongoDB is not available
    if (fallbackStorage) {
      const calls = fallbackStorage.readCalls();
      const initialLength = calls.length;
      
      const filteredCalls = calls.filter(call => !ids.includes(call.call_id));
      
      if (filteredCalls.length === initialLength) {
        return res.status(404).json({ error: 'No matching calls found' });
      }
      
      if (fallbackStorage.writeCalls(filteredCalls)) {
        return res.json({
          success: true,
          message: `Successfully deleted ${initialLength - filteredCalls.length} calls`
        });
      } else {
        return res.status(500).json({ error: 'Failed to delete calls in fallback storage' });
      }
    }
    
    res.status(500).json({ error: 'No storage system available' });
    
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
    
    // Use MongoDB if available
    if (callsCollection) {
      const total = await callsCollection.countDocuments({});
      
      // For today's calls
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
      
      // For week's calls
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
      
      return res.json({
        total: total,
        today: todayCalls,
        week: weekCalls
      });
    }
    
    // Use fallback if MongoDB is not available
    if (fallbackStorage) {
      const calls = fallbackStorage.readCalls();
      
      const todayCalls = calls.filter(call => {
        try {
          const callDate = new Date(call.call_date);
          return !isNaN(callDate.getTime()) && callDate >= today;
        } catch (e) {
          return false;
        }
      });
      
      const weekCalls = calls.filter(call => {
        try {
          const callDate = new Date(call.call_date);
          return !isNaN(callDate.getTime()) && callDate >= weekAgo;
        } catch (e) {
          return false;
        }
      });
      
      return res.json({
        total: calls.length,
        today: todayCalls.length,
        week: weekCalls.length
      });
    }
    
    res.status(500).json({ error: 'No storage system available' });
    
  } catch (err) {
    console.error('Error fetching statistics:', err);
    res.status(500).json({ error: 'Failed to fetch statistics: ' + err.message });
  }
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server
async function startServer() {
  // Try to connect to MongoDB
  const connected = await connectToMongoDB();
  
  // Use file-based fallback if MongoDB connection fails
  if (!connected) {
    console.warn('⚠️ Failed to connect to MongoDB. Using fallback file storage.');
    fallbackStorage = initializeFallbackStorage();
  }
  
  // Start the server even if MongoDB fails
  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Call CRM Server running at http://localhost:${port}`);
    console.log(`📊 Visit http://localhost:${port} to view your CRM`);
    console.log(`📡 n8n can send data to: http://localhost:${port}/api/calls`);
    console.log(`💾 Data stored in: ${connected ? 'MongoDB Atlas' : 'Fallback JSON file'}`);
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

// Add this BEFORE your existing /api/calls route
app.get('/ping', (req, res) => {
  res.status(200).json({ 
    status: 'alive', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Your existing /api/calls route stays the same...
app.post('/api/calls', (req, res) => {
  // Your existing code here
});
