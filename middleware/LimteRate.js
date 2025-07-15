const Redis = require('ioredis');
const { RateLimiterRedis } = require('rate-limiter-flexible');

// Create Redis client
const redisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    enableOfflineQueue: false
});

// Configuration for different endpoints
const rateLimitConfigs = {
    assets: {
        points: 200,       // 200 requests
        duration: 15 * 60, // Per 15 minutes
        blockDuration: 60 * 60 // Block for 1 hour if exceeded
    },
    reports: {
        points: 50,        // 50 requests
        duration: 60 * 60, // Per 1 hour
        blockDuration: 60 * 60 // Block for 1 hour if exceeded
    },
    default: {
        points: 100,       // 100 requests
        duration: 15 * 60, // Per 15 minutes
        blockDuration: 60 * 60 // Block for 1 hour if exceeded
    }
};

// Create rate limiter function
const createRateLimiter = (endpointType = 'default') => {
    const config = rateLimitConfigs[endpointType] || rateLimitConfigs.default;
    
    return new RateLimiterRedis({
        storeClient: redisClient,
        points: config.points,
        duration: config.duration,
        blockDuration: config.blockDuration,
        keyPrefix: `rate_limit:${endpointType}:`
    });
};

// Middleware wrapper
const endpointLimiter = (endpointType) => {
    const limiter = createRateLimiter(endpointType);
    
    return async (req, res, next) => {
        try {
            const key = req.ip; // Use IP address as the identifier
            const rateLimiterRes = await limiter.consume(key);
            
            // Set rate limit headers
            res.setHeader('X-RateLimit-Limit', limiter.points);
            res.setHeader('X-RateLimit-Remaining', rateLimiterRes.remainingPoints);
            res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimiterRes.msBeforeNext / 1000));
            
            next();
        } catch (rateLimiterRes) {
            res.setHeader('Retry-After', Math.ceil(rateLimiterRes.msBeforeNext / 1000));
            return res.status(429).json({
                success: false,
                message: 'Too many requests',
                retryAfter: Math.ceil(rateLimiterRes.msBeforeNext / 1000)
            });
        }
    };
};

module.exports = endpointLimiter;