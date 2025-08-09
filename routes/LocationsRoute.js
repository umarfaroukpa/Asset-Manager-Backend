import express from 'express';
import { authenticateToken } from '../middleware/auth.js'; 

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Health check endpoint (unauthenticated)
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

export default router;