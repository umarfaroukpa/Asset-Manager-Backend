import express from 'express';
import Location from '../models/Location.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/locations - Get all locations
router.get('/', authenticateToken, async (req, res) => {
  try {
    console.log('📍 Fetching locations...');
    
    const locations = await Location.find({ 
      organizationId: req.user.organizationId 
    }).lean();

    const transformedLocations = locations.map(location => ({
      ...location,
      id: location._id,
      value: location._id,
      label: location.name
    }));

    res.status(200).json({
      success: true,
      data: transformedLocations,
      count: transformedLocations.length
    });

  } catch (error) {
    console.error('❌ Error fetching locations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch locations',
      error: error.message
    });
  }
});

// GET /api/locations/:id - Get location by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('📍 Fetching location by ID:', id);
    
    const location = await Location.findOne({ 
      _id: id,
      organizationId: req.user.organizationId 
    }).lean();
    
    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'Location not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        ...location,
        id: location._id,
        value: location._id,
        label: location.name
      }
    });

  } catch (error) {
    console.error('❌ Error fetching location:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch location',
      error: error.message
    });
  }
});

// POST /api/locations - Create new location
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, address, city, state, country } = req.body;
    console.log('📍 Creating new location:', { name, address, city, state, country });
    
    const newLocation = new Location({
      name,
      address,
      city,
      state,
      country,
      organizationId: req.user.organizationId
    });

    await newLocation.save();

    const responseData = {
      ...newLocation.toObject(),
      id: newLocation._id,
      value: newLocation._id,
      label: newLocation.name
    };

    res.status(201).json({
      success: true,
      message: 'Location created successfully',
      data: responseData
    });

  } catch (error) {
    console.error('❌ Error creating location:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create location',
      error: error.message
    });
  }
});

// PUT /api/locations/:id - Update location
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, city, state, country } = req.body;
    console.log('📍 Updating location:', id, { name, address, city, state, country });
    
    const updatedLocation = await Location.findOneAndUpdate(
      { 
        _id: id,
        organizationId: req.user.organizationId 
      },
      { 
        name,
        address,
        city,
        state,
        country,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    ).lean();
    
    if (!updatedLocation) {
      return res.status(404).json({
        success: false,
        message: 'Location not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Location updated successfully',
      data: {
        ...updatedLocation,
        id: updatedLocation._id,
        value: updatedLocation._id,
        label: updatedLocation.name
      }
    });

  } catch (error) {
    console.error('❌ Error updating location:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update location',
      error: error.message
    });
  }
});

// DELETE /api/locations/:id - Delete location
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('📍 Deleting location:', id);
    
    const deletedLocation = await Location.findOneAndDelete({
      _id: id,
      organizationId: req.user.organizationId
    });
    
    if (!deletedLocation) {
      return res.status(404).json({
        success: false,
        message: 'Location not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Location deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting location:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete location',
      error: error.message
    });
  }
});

export default router;