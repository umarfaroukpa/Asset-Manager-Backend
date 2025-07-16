import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

// Configure dotenv
dotenv.config();

// Import routes
// import authRoutes from './routes/Auth.js';
// import dashboardRoutes from './routes/Dashboard.js';
// import assetRoutes from './routes/Assets.js';
// import organizationRoutes from './routes/Organizations.js';
// // import userRoutes from './routes/users.js';
// import categoryRoutes from './routes/categories.js';
// // import reportRoutes from './routes/reports.js';

// Import middleware
// import errorHandler from './middleware/ErrorHandler.js';

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

// Routes
// app.use('/api/auth', authRoutes);
// app.use('/api/assets', assetRoutes);
// app.use('/api/dashboard', dashboardRoutes);
// app.use('/api/organizations', organizationRoutes);
// // app.use('/api/users', userRoutes);
// app.use('/api/categories', categoryRoutes);
// // app.use('/api/reports', reportRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV
    });
});

// Basic route for testing
app.get('/', (req, res) => {
    res.json({ 
        message: 'Asset Manager API is running!',
        version: '1.0.0',
        endpoints: [
            '/api/health',
            '/api/auth/',
            '/api/assets/',
            '/api/categories/*'
        ]
    });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found'
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});

export default app;