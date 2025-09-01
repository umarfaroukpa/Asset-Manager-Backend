// Simple memory-based rate limiter (fallback when Redis is not available)
// Note: This won't work across multiple server instances, but fine for single instance or development

const rateLimitStore = new Map();

// Configuration for different endpoints
const rateLimitConfigs = {
    assets: {
        points: 200,       // 200 requests
        duration: 15 * 60 * 1000, // 15 minutes in ms
    },
    reports: {
        points: 50,        // 50 requests
        duration: 60 * 60 * 1000, // 1 hour in ms
    },
    default: {
        points: 100,       // 100 requests
        duration: 15 * 60 * 1000, // 15 minutes in ms
    }
};

// Clean up old entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, data] of rateLimitStore.entries()) {
        if (now - data.resetTime > data.duration) {
            rateLimitStore.delete(key);
        }
    }
}, 60000); // Clean every minute

// Create rate limiter function
const createRateLimiter = (endpointType = 'default') => {
    const config = rateLimitConfigs[endpointType] || rateLimitConfigs.default;
    
    return {
        points: config.points,
        duration: config.duration,
        checkLimit: (key) => {
            const now = Date.now();
            const storeKey = `${endpointType}:${key}`;
            
            if (!rateLimitStore.has(storeKey)) {
                rateLimitStore.set(storeKey, {
                    count: 1,
                    resetTime: now,
                    duration: config.duration
                });
                return { allowed: true, remaining: config.points - 1 };
            }
            
            const data = rateLimitStore.get(storeKey);
            
            // Reset if duration has passed
            if (now - data.resetTime > config.duration) {
                data.count = 1;
                data.resetTime = now;
                rateLimitStore.set(storeKey, data);
                return { allowed: true, remaining: config.points - 1 };
            }
            
            // Check if limit exceeded
            if (data.count >= config.points) {
                return { 
                    allowed: false, 
                    remaining: 0,
                    retryAfter: Math.ceil((data.resetTime + config.duration - now) / 1000)
                };
            }
            
            // Increment count
            data.count++;
            rateLimitStore.set(storeKey, data);
            
            return { allowed: true, remaining: config.points - data.count };
        }
    };
};

// Middleware wrapper
const endpointLimiter = (endpointType) => {
    const limiter = createRateLimiter(endpointType);
    
    return async (req, res, next) => {
        try {
            const key = req.ip || 'unknown'; // Use IP address as the identifier
            const result = limiter.checkLimit(key);
            
            // Set rate limit headers
            res.setHeader('X-RateLimit-Limit', limiter.points);
            res.setHeader('X-RateLimit-Remaining', result.remaining);
            
            if (!result.allowed) {
                res.setHeader('Retry-After', result.retryAfter);
                return res.status(429).json({
                    success: false,
                    message: 'Too many requests',
                    retryAfter: result.retryAfter
                });
            }
            
            next();
        } catch (error) {
            console.error('Rate limiter error:', error);
            // If rate limiter fails, allow the request to continue
            next();
        }
    };
};

export default endpointLimiter;