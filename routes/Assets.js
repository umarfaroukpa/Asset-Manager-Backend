const express = require('express');
const router = express.Router();
const Asset = require('../models/Assets');
const AssetLog = require('../models/AssetsLog');
const { authenticate, authorize } = require('../middleware/auth');
const { validateAsset } = require('../middleware/Validations');
const rateLimit = require('../middleware/LimiteRate');

// Get all assets with pagination, filtering, and sorting
router.get('/', authenticate, rateLimit('assets'), async (req, res) => {
  try {
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc', ...filters } = req.query;
    
    // Build query
    const query = {};
    if (filters.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { serialNumber: { $regex: filters.search, $options: 'i' } },
        { description: { $regex: filters.search, $options: 'i' } }
      ];
    }
    
    // Add other filters
    if (filters.status) query.status = filters.status;
    if (filters.category) query.category = filters.category;
    if (filters.location) query.location = filters.location;
    
    // Get total count
    const total = await Asset.countDocuments(query);
    
    // Get paginated results
    const assets = await Asset.find(query)
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate('assignedTo', 'name email')
      .lean();
    
    res.json({
      success: true,
      data: {
        assets,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Create new asset with logging
router.post('/', authenticate, validateAsset, async (req, res) => {
  try {
    const asset = new Asset(req.body);
    await asset.save();
    
    // Log the creation
    await AssetLog.create({
      asset: asset._id,
      action: 'create',
      performedBy: req.user.id,
      details: req.body
    });
    
    res.status(201).json({ success: true, data: asset });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Assign asset to user
router.post('/:id/assign', authenticate, async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found' });
    
    asset.assignedTo = req.body.userId;
    asset.status = 'assigned';
    await asset.save();
    
    // Log the assignment
    await AssetLog.create({
      asset: asset._id,
      action: 'assign',
      performedBy: req.user.id,
      details: {
        assignedTo: req.body.userId,
        notes: req.body.notes
      }
    });
    
    res.json({ success: true, data: asset });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Generate QR code for asset
router.post('/:id/qrcode', authenticate, async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);
    if (!asset) return res.status(404).json({ success: false, message: 'Asset not found' });
    
    // In a real app, you would generate a QR code here
    const qrCode = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${asset._id}`;
    
    asset.qrCode = qrCode;
    await asset.save();
    
    res.json({ success: true, data: { qrCode } });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Export assets to CSV
router.get('/export/csv', authenticate, async (req, res) => {
  try {
    const assets = await Asset.find().lean();
    
    // Convert to CSV
    const headers = ['ID', 'Name', 'Serial Number', 'Category', 'Status', 'Location', 'Purchase Date', 'Purchase Price'];
    const rows = assets.map(asset => [
      asset._id,
      asset.name,
      asset.serialNumber,
      asset.category,
      asset.status,
      asset.location,
      asset.purchaseDate,
      asset.purchasePrice
    ]);
    
    let csv = headers.join(',') + '\n';
    rows.forEach(row => {
      csv += row.map(field => `"${field}"`).join(',') + '\n';
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=assets-export.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get asset history
router.get('/:id/history', authenticate, async (req, res) => {
  try {
    const history = await AssetLog.find({ asset: req.params.id })
      .sort({ createdAt: -1 })
      .populate('performedBy', 'name email')
      .lean();
    
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;