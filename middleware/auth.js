const express = require('express');
const { authenticate, authenticateToken } = require('../middleware/auth');
const User = require('../models/User');
const router = express.Router();

// @route   POST /api/auth/register
// @desc    Register new user (via Firebase)
// @access  Public
router.post('/register', authenticateToken, async (req, res) => {
    try {
        const { name, department, phone } = req.body;
        
        // User is already created in auth middleware
        // Update additional info
        const user = await User.findByIdAndUpdate(
            req.user._id,
            { 
                name: name || req.user.name,
                department,
                phone 
            },
            { new: true }
        ).select('-firebaseUID');

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: { user }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during registration'
        });
    }
});

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-firebaseUID');
        
        res.json({
            success: true,
            data: { user }
        });
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error fetching profile'
        });
    }
});

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const { name, department, phone } = req.body;
        
        const user = await User.findByIdAndUpdate(
            req.user._id,
            { name, department, phone },
            { new: true, runValidators: true }
        ).select('-firebaseUID');

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: { user }
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error updating profile'
        });
    }
});

module.exports = router;