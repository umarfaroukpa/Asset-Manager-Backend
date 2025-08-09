import express from 'express';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication to all department routes
router.use(authenticateToken);