import express from 'express';
import Department from '../models/Department.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// GET /api/departments - Get all departments
router.get('/', authenticateToken, async (req, res) => {
  try {
    console.log('📋 Fetching departments...');
    
    const departments = await Department.find({ 
      organizationId: req.user.organizationId 
    }).lean();

    const transformedDepartments = departments.map(dept => ({
      ...dept,
      id: dept._id,
      value: dept._id,
      label: dept.name
    }));

    res.status(200).json({
      success: true,
      data: transformedDepartments,
      count: transformedDepartments.length
    });

  } catch (error) {
    console.error('❌ Error fetching departments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch departments',
      error: error.message
    });
  }
});

// GET /api/departments/:id - Get department by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('📋 Fetching department by ID:', id);
    
    const department = await Department.findOne({ 
      _id: id,
      organizationId: req.user.organizationId 
    }).lean();
    
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        ...department,
        id: department._id,
        value: department._id,
        label: department.name
      }
    });

  } catch (error) {
    console.error('❌ Error fetching department:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch department',
      error: error.message
    });
  }
});

// POST /api/departments - Create new department
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, code, description } = req.body;
    console.log('📋 Creating new department:', { name, code, description });
    
    const newDepartment = new Department({
      name,
      code,
      description,
      organizationId: req.user.organizationId
    });

    await newDepartment.save();

    const responseData = {
      ...newDepartment.toObject(),
      id: newDepartment._id,
      value: newDepartment._id,
      label: newDepartment.name
    };

    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      data: responseData
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Department code must be unique'
      });
    }
    console.error('❌ Error creating department:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create department',
      error: error.message
    });
  }
});

// PUT /api/departments/:id - Update department
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, description } = req.body;
    console.log('📋 Updating department:', id, { name, code, description });
    
    const updatedDepartment = await Department.findOneAndUpdate(
      { 
        _id: id,
        organizationId: req.user.organizationId 
      },
      { 
        name,
        code,
        description,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    ).lean();
    
    if (!updatedDepartment) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Department updated successfully',
      data: {
        ...updatedDepartment,
        id: updatedDepartment._id,
        value: updatedDepartment._id,
        label: updatedDepartment.name
      }
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Department code must be unique'
      });
    }
    console.error('❌ Error updating department:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update department',
      error: error.message
    });
  }
});

// DELETE /api/departments/:id - Delete department
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    console.log('📋 Deleting department:', id);
    
    const deletedDepartment = await Department.findOneAndDelete({
      _id: id,
      organizationId: req.user.organizationId
    });
    
    if (!deletedDepartment) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Department deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting department:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete department',
      error: error.message
    });
  }
});

export default router;