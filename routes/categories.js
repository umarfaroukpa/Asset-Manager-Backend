const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const Category = require('../models/Category');
const router = express.Router();// @route   GET /api/categories
// @desc    Get all categories
// @access  Private
router.get('/', authenticateToken, async (req, res) => {
    try {
        const categories = await Category.find({ isActive: true })
            .sort({ name: 1 });    res.json({
        success: true,
        count: categories.length,
        data: { categories }
    });
} catch (error) {
    console.error('Categories fetch error:', error);
    res.status(500).json({
        success: false,
        message: 'Server error fetching categories'
    });
}});// @route   POST /api/categories
// @desc    Create new category
// @access  Private (Admin/Manager only)
router.post('/', authenticateToken, requireRole('admin', 'manager'),
 async (req, res) => {
    try {
        const { name, description, icon, color } = req.body;    const category = new Category({
        name,
        description,
        icon,
        color,
        createdBy: req.user._id
    });

    await category.save();

    res.status(201).json({
        success: true,
        message: 'Category created successfully',
        data: { category }
    });
} catch (error) {
    if (error.code === 11000) {
        return res.status(400).json({
            success: false,
            message: 'Category name already exists'
        });
    }
    
    console.error('Category creation error:', error);
    res.status(500).json({
        success: false,
        message: 'Server error creating category'
    });
}});module.exports = router;

