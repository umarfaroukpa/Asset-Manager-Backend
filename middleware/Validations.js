const Joi = require('joi');const validate = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.body);    if (error) {
        const errorMessage = error.details[0].message;
        return res.status(400).json({
            success: false,
            message: errorMessage
        });
    }
    
    next();
};};// Enhanced validation schemas
const schemas = {
    category: Joi.object({
        name: Joi.string().trim().min(1).max(100).required(),
        description: Joi.string().trim().max(500).optional(),
        icon: Joi.string().trim().optional(),
        color: Joi.string().pattern(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).optional()
    }),user: Joi.object({
    name: Joi.string().trim().min(1).max(100).required(),
    department: Joi.string().trim().max(100).optional(),
    phone: Joi.string().trim().pattern(/^[0-9+\-\s()]+$/).optional()
}),

asset: Joi.object({
    name: Joi.string().trim().min(1).max(200).required(),
    description: Joi.string().trim().max(1000).optional(),
    category: Joi.string().hex().length(24).required(), // MongoDB ObjectId
    subCategory: Joi.string().trim().max(100).optional(),
    serialNumber: Joi.string().trim().max(100).optional(),
    model: Joi.string().trim().max(100).optional(),
    manufacturer: Joi.string().trim().max(100).optional(),
    purchaseDate: Joi.date().optional(),
    purchasePrice: Joi.number().min(0).optional(),
    currentValue: Joi.number().min(0).optional(),
    status: Joi.string().valid('available', 'in-use', 'maintenance', 'retired', 'lost', 'damaged').optional(),
    condition: Joi.string().valid('excellent', 'good', 'fair', 'poor').optional(),
    location: Joi.object({
        building: Joi.string().trim().max(100).optional(),
        floor: Joi.string().trim().max(50).optional(),
        room: Joi.string().trim().max(50).optional()
    }).optional(),
    vendor: Joi.object({
        name: Joi.string().trim().max(100).optional(),
        contact: Joi.string().trim().max(100).optional(),
        email: Joi.string().email().optional()
    }).optional(),
    warranty: Joi.object({
        provider: Joi.string().trim().max(100).optional(),
        startDate: Joi.date().optional(),
        endDate: Joi.date().optional(),
        terms: Joi.string().trim().max(500).optional()
    }).optional(),
    maintenance: Joi.object({
        lastService: Joi.date().optional(),
        nextService: Joi.date().optional(),
        frequency: Joi.string().valid('weekly', 'monthly', 'quarterly', 'yearly').optional(),
        notes: Joi.string().trim().max(500).optional()
    }).optional(),
    customFields: Joi.object().optional()
}),

assetUpdate: Joi.object({
    name: Joi.string().trim().min(1).max(200).optional(),
    description: Joi.string().trim().max(1000).optional(),
    category: Joi.string().hex().length(24).optional(),
    subCategory: Joi.string().trim().max(100).optional(),
    serialNumber: Joi.string().trim().max(100).optional(),
    model: Joi.string().trim().max(100).optional(),
    manufacturer: Joi.string().trim().max(100).optional(),
    purchaseDate: Joi.date().optional(),
    purchasePrice: Joi.number().min(0).optional(),
    currentValue: Joi.number().min(0).optional(),
    status: Joi.string().valid('available', 'in-use', 'maintenance', 'retired', 'lost', 'damaged').optional(),
    condition: Joi.string().valid('excellent', 'good', 'fair', 'poor').optional(),
    location: Joi.object({
        building: Joi.string().trim().max(100).optional(),
        floor: Joi.string().trim().max(50).optional(),
        room: Joi.string().trim().max(50).optional()
    }).optional(),
    vendor: Joi.object({
        name: Joi.string().trim().max(100).optional(),
        contact: Joi.string().trim().max(100).optional(),
        email: Joi.string().email().optional()
    }).optional(),
    warranty: Joi.object({
        provider: Joi.string().trim().max(100).optional(),
        startDate: Joi.date().optional(),
        endDate: Joi.date().optional(),
        terms: Joi.string().trim().max(500).optional()
    }).optional(),
    maintenance: Joi.object({
        lastService: Joi.date().optional(),
        nextService: Joi.date().optional(),
        frequency: Joi.string().valid('weekly', 'monthly', 'quarterly', 'yearly').optional(),
        notes: Joi.string().trim().max(500).optional()
    }).optional(),
    customFields: Joi.object().optional()
})};module.exports = { validate, schemas };

