import dotenv from 'dotenv';
dotenv.config()

import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

// Import routes with error handling
let authRoutes, dashboardRoutes, assetRoutes, organizationRoutes, userRoutes, categoryRoutes, reportRoutes;

try {
  authRoutes = (await import('./routes/Auth.js')).default;
  console.log('✅ Auth routes imported successfully');
} catch (err) {
  console.error('❌ Failed to import Auth routes:', err.message);
}

try {
  dashboardRoutes = (await import('./routes/Dashboard.js')).default;
  console.log('✅ Dashboard routes imported successfully');
} catch (err) {
  console.error('❌ Failed to import Dashboard routes:', err.message);
}

try {
  assetRoutes = (await import('./routes/Assets.js')).default;
  console.log('✅ Asset routes imported successfully');
} catch (err) {
  console.error('❌ Failed to import Asset routes:', err.message);
}

try {
  organizationRoutes = (await import('./routes/Organizations.js')).default;
  console.log('✅ Organization routes imported successfully');
} catch (err) {
  console.error('❌ Failed to import Organization routes:', err.message);
  // Create a simple fallback route
  organizationRoutes = express.Router();
  organizationRoutes.get('/', (req, res) => {
    res.json({
      success: true,
      message: 'Organizations route is working (fallback)',
      organization: {
        id: 1,
        name: "Demo Organization",
        description: "This is a demo organization",
        industry: "Technology",
        size: "50-200 employees",
        email: "demo@example.com",
        phone: "+1 (555) 123-4567",
        website: "https://example.com",
        address: "123 Demo Street, Demo City, DC 12345",
        foundedDate: "2020-01-01",
        logo: null,
        settings: {
          allowPublicProfile: true,
          requireApprovalForMembers: false,
          enableTwoFactor: false,
          allowDataExport: true,
          enableApiAccess: false
        }
      }
    });
  });
  organizationRoutes.get('/members', (req, res) => {
    res.json({
      success: true,
      members: [
        {
          id: 1,
          name: "Demo User",
          email: "demo@example.com",
          role: "admin",
          department: "IT",
          joinDate: "2023-01-01",
          status: "active",
          avatar: null
        }
      ]
    });
  });
}

try {
  userRoutes = (await import('./routes/users.js')).default;
  console.log('✅ User routes imported successfully');
} catch (err) {
  console.error('❌ Failed to import User routes:', err.message);
}

try {
  categoryRoutes = (await import('./routes/categories.js')).default;
  console.log('✅ Category routes imported successfully');
} catch (err) {
  console.error('❌ Failed to import Category routes:', err.message);
}

try {
  reportRoutes = (await import('./routes/reports.js')).default;
  console.log('✅ Report routes imported successfully');
} catch (err) {
  console.error('❌ Failed to import Report routes:', err.message);
}

//Import middleware
import errorHandler from './middleware/ErrorHandler.js';

const app = express();

// Security middleware
app.use(helmet());

// Updated CORS configuration to allow multiple origins
const corsOptions = {
    origin: [
        process.env.FRONTEND_URL || 'http://localhost:3000',
        'http://localhost:5173',     // Vite
        'http://localhost:8080',     // Vue CLI
        'http://127.0.0.1:5500',     // Live Server
        'http://localhost:5500',     // Live Server
        'http://127.0.0.1:8080',     // Alternative ports
        'http://localhost:4200',     // Angular
        'null'                       // For file:// protocol
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Apply CORS
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Rate limiting - apply to all API routes
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
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

// Database connection with updated options
mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.error('MongoDB connection error:', err));

// Add middleware to log all requests
app.use((req, res, next) => {
  console.log(`📝 ${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Routes mounting with error handling
console.log('\n🚀 Mounting routes...');

if (authRoutes) {
  app.use('/api/auth', authRoutes);
  console.log('✅ Mounted: /api/auth');
}

if (assetRoutes) {
  app.use('/api/assets', assetRoutes);
  console.log('✅ Mounted: /api/assets');
}

if (dashboardRoutes) {
  app.use('/api/dashboard', dashboardRoutes);
  console.log('✅ Mounted: /api/dashboard');
}

if (organizationRoutes) {
  app.use('/api/organizations', organizationRoutes);
  console.log('✅ Mounted: /api/organizations');
} else {
  console.log('❌ Failed to mount: /api/organizations');
}

if (userRoutes) {
  app.use('/api/users', userRoutes);
  console.log('✅ Mounted: /api/users');
}

if (categoryRoutes) {
  app.use('/api/categories', categoryRoutes);
  console.log('✅ Mounted: /api/categories');
}

if (reportRoutes) {
  app.use('/api/reports', reportRoutes);
  console.log('✅ Mounted: /api/reports');
}

console.log('🎯 Routes mounting completed\n');

// Health check
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        routes: {
          auth: !!authRoutes,
          assets: !!assetRoutes,
          dashboard: !!dashboardRoutes,
          organizations: !!organizationRoutes,
          users: !!userRoutes,
          categories: !!categoryRoutes,
          reports: !!reportRoutes
        }
    });
});

// Basic route for testing
app.get('/', (req, res) => {
    res.json({ 
        message: 'Asset Manager API is running!',
        version: '1.0.0',
        status: 'OK',
        endpoints: [
            '/api/health',
            '/api/auth/*',
            '/api/assets/*',
            '/api/dashboard/*',
            '/api/organizations/*',
            '/api/users/*',
            '/api/categories/*',
            '/api/reports/*'
        ],
        documentation: {
            'Setup Development Data': 'npm run setup-dev',
            'Health Check': 'GET /api/health',
            'Demo Credentials': {
                'Admin Token': 'demo-admin-token',
                'User Token': 'demo-user-token',
                'Usage': 'Add "Authorization: Bearer {token}" header'
            }
        }
    });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler - use a more specific pattern instead of '*'
app.use((req, res) => {
    console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        success: false,
        message: 'API endpoint not found',
        path: req.originalUrl,
        method: req.method,
        availableRoutes: [
            'GET /api/health',
            'GET /api/organizations',
            'GET /api/organizations/members',
            'GET /api/assets',
            'POST /api/auth/login'
        ]
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    console.log(`📍 API Base URL: http://localhost:${PORT}/api`);
    console.log(`🏥 Health Check: http://localhost:${PORT}/api/health`);
});

export default app;