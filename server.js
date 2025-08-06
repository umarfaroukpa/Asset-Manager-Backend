import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { initializeFirebaseAdmin } from './config/firebase-admin.js';

// Validate required environment variables
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET'];
const missingVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingVars);
  process.exit(1);
}

// Initialize Express app
const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5500'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    success: false,
    message: 'Too many requests, please try again later.'
  }
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Database connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected successfully'))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📝 ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Route import helper functions
const createFallbackRouter = (routeName) => {
  const router = express.Router();
  
  switch(routeName) {
    case 'users':
      router.get('/me', (req, res) => {
        res.json({
          success: true,
          data: {
            user: {
              _id: 'demo-user-id',
              email: 'demo@example.com',
              name: 'Demo User',
              role: 'admin',
              isActive: true,
              organization: {
                _id: 'demo-org-id',
                name: 'Demo Organization'
              }
            }
          }
        });
      });
      
      router.get('/', (req, res) => {
        res.json({
          success: true,
          data: {
            users: [
              {
                _id: 'demo-user-1',
                email: 'demo@example.com',
                name: 'Demo User',
                role: 'admin'
              }
            ],
            pagination: {
              current: 1,
              pages: 1,
              total: 1,
              limit: 10
            }
          }
        });
      });
      break;
      
    case 'dashboard':
      router.get('/stats', (req, res) => {
        res.json({
          success: true,
          data: {
            totalAssets: 150,
            availableAssets: 45,
            assignedAssets: 85,
            totalValue: 250000,
            totalUsers: 25,
            recentActivity: [
              {
                id: 1,
                name: 'Asset Assignment',
                description: 'Laptop assigned to John Doe',
                timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
              }
            ]
          }
        });
      });
      break;
      
    case 'organizations':
      router.get('/', (req, res) => {
        res.json({
          success: true,
          data: {
            organization: {
              _id: 'demo-org-id',
              name: 'Demo Organization',
              description: 'This is a demo organization'
            }
          }
        });
      });
      break;
      
    default:
      router.get('/', (req, res) => {
        res.json({
          success: true,
          message: `Demo endpoint for ${routeName}`
        });
      });
  }
  
  console.log(`✅ Created fallback router for ${routeName}`);
  return router;
};

const importRoute = async (routePath, routeName) => {
  try {
    const module = await import(routePath);
    console.log(`✅ ${routeName} routes imported successfully`);
    return module.default;
  } catch (err) {
    console.error(`❌ Failed to import ${routeName} routes:`, {
      message: err.message,
      code: err.code,
      path: err.path
    });
    return createFallbackRouter(routeName);
  }
};

// Import all routes
console.log('\n🚀 Importing routes...');
const routes = {
  auth: await importRoute('./routes/AuthRoute.js', 'auth'),
  users: await importRoute('./routes/UsersRoute.js', 'users'),
  dashboard: await importRoute('./routes/Dashboard.js', 'dashboard'),
  assets: await importRoute('./routes/Assets.js', 'assets'),
  organizations: await importRoute('./routes/Organizations.js', 'organizations'),
  categories: await importRoute('./routes/CategoriesRoute.js', 'categories'),
  reports: await importRoute('./routes/ReportsRoute.js', 'reports'),
};

// Mount all routes
app.use('/api/auth', routes.auth);
app.use('/api/users', routes.users);
app.use('/api/dashboard', routes.dashboard);
app.use('/api/assets', routes.assets);
app.use('/api/organizations', routes.organizations);
app.use('/api/categories', routes.categories);
app.use('/api/reports', routes.reports);
console.log('🎯 All routes mounted successfully\n');

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Asset Manager API',
    version: '1.0.0',
    status: 'running',
    endpoints: [
      '/api/health',
      '/api/auth',
      '/api/users',
      '/api/assets',
      '/api/dashboard',
      '/api/test/test-firebase'
    ],
    docs: process.env.API_DOCS_URL || 'Not configured'
  });
});

// 404 handler
app.use((req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.originalUrl,
    availableEndpoints: [
      'GET /api/health',
      'GET /api/users/me',
      'GET /api/dashboard/stats',
      'GET /api/assets',
      'GET /api/organizations',
      'GET /api/categories',
      'GET /api/reports',
      'GET /api/auth/login',
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('🚨 Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  
  res.status(err.status || 500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server with async Firebase initialization
const startServer = async () => {
  try {
    await initializeFirebaseAdmin();
    console.log('🚀 Starting Express server...');
    app.listen(5000, () => {
      console.log(`\n🚀 Server running on port 5000 in ${process.env.NODE_ENV || 'development'} mode`);
      console.log(`📍 API Base URL: http://localhost:5000/api`);
      console.log(`🏥 Health Check: http://localhost:5000/api/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();

export default app;