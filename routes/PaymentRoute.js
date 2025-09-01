import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { authenticate } from '../middleware/auth.js'; 
import AuditLog from '../models/AuditLog.js'; 
import User from '../models/User.js'; 

dotenv.config();

const router = express.Router();

// Validate environment variables
if (!process.env.PAYSTACK_SECRET_KEY) {
  console.error('❌ PAYSTACK_SECRET_KEY is required in environment variables');
  process.exit(1);
}

// Initialize Paystack payment
router.post('/initialize', authenticate, async (req, res) => {
  try {
    const { amount, email, reference, callback_url, metadata } = req.body;
    
    console.log('💳 Initializing Paystack payment:', {
      amount,
      email,
      reference,
      userId: req.user?._id
    });
    
    // Validate required fields
    if (!amount || !email) {
      return res.status(400).json({ 
        success: false,
        message: 'Amount and email are required' 
      });
    }

    // Generate reference if not provided
    const paymentReference = reference || `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Validate amount (minimum 100 kobo = 1 naira)
    if (amount < 100) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be at least 100 kobo (1 naira)'
      });
    }

    // Prepare callback URL
    const finalCallbackUrl = callback_url || `${req.protocol}://${req.get('host')}/payment/callback`;

    const paymentData = {
    //This to ensure it's an integer
      amount: parseInt(amount), 
      email,
      reference: paymentReference,
      callback_url: finalCallbackUrl,
      metadata: {
        userId: req.user._id.toString(),
        userEmail: req.user.email,
        ...metadata
      }
    };

    console.log('🚀 Sending to Paystack:', paymentData);

    const paystackResponse = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      paymentData,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Paystack response received:', paystackResponse.data);

    // Log the payment initialization
    try {
      await AuditLog.create({
        userId: req.user._id.toString(),
        action: 'PAYMENT_INITIALIZED',
        resource: 'payment',
        resourceId: paymentReference,
        details: {
         // Convert to naira for logging
          amount: amount / 100, 
          email,
          metadata: paymentData.metadata
        },
        ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      });
    } catch (auditError) {
      console.warn('⚠️ Failed to create audit log:', auditError.message);
    }

    res.json({
      success: true,
      message: 'Payment initialized successfully',
      data: {
        authorization_url: paystackResponse.data.data.authorization_url,
        access_code: paystackResponse.data.data.access_code,
        reference: paymentReference
      }
    });

  } catch (error) {
    console.error('❌ Paystack initialization error:', error);
    
    let errorMessage = 'Failed to initialize payment';
    let statusCode = 500;

    if (error.response) {
      errorMessage = error.response.data?.message || errorMessage;
      statusCode = error.response.status;
      
      console.error('Paystack API Error:', {
        status: error.response.status,
        data: error.response.data
      });
    }

    res.status(statusCode).json({ 
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Verify Paystack payment
router.post('/verify', authenticate, async (req, res) => {
  try {
    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: 'Payment reference is required'
      });
    }

    console.log('🔍 Verifying payment:', reference);

    const paystackResponse = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );

    const transaction = paystackResponse.data.data;
    
    console.log('✅ Payment verification response:', transaction);

    // Check if payment was successful
    if (transaction.status !== 'success') {
      return res.json({
        success: false,
        message: `Payment ${transaction.status}`,
        data: {
          status: transaction.status,
          reference: transaction.reference
        }
      });
    }

    // Process successful payment
    try {
      //This is where i will update user subscription ,create records.
      
      // Updating user's subscription status
      if (transaction.metadata?.userId) {
        await User.findByIdAndUpdate(
          transaction.metadata.userId,
          {
            $set: {
              subscriptionStatus: 'active',
              subscriptionPlan: transaction.metadata.plan,
              subscriptionUpdatedAt: new Date(),
              lastPaymentAt: new Date(transaction.paid_at)
            }
          }
        );
      }

      // Log successful payment
      await AuditLog.create({
        userId: transaction.metadata?.userId || req.user._id.toString(),
        action: 'PAYMENT_SUCCESSFUL',
        resource: 'payment',
        resourceId: reference,
        details: {
          amount: transaction.amount / 100,
          currency: transaction.currency,
          paidAt: transaction.paid_at,
          metadata: transaction.metadata
        },
        ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      });

    } catch (processingError) {
      console.error('❌ Error processing successful payment:', processingError);
    // Don't fail the verification, but log the error
    }

    res.json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        status: transaction.status,
    // Convert from kobo to naira
        amount: transaction.amount / 100, 
        currency: transaction.currency,
        reference: transaction.reference,
        paid_at: transaction.paid_at,
        metadata: transaction.metadata,
        transactionId: transaction.id
      }
    });

  } catch (error) {
    console.error('❌ Paystack verification error:', error);
    
    let errorMessage = 'Failed to verify payment';
    let statusCode = 500;

    if (error.response) {
      errorMessage = error.response.data?.message || errorMessage;
      statusCode = error.response.status;
      
      console.error('Paystack Verification API Error:', {
        status: error.response.status,
        data: error.response.data
      });
    }

    // Log failed verification attempt
    try {
      await AuditLog.create({
        userId: req.user._id.toString(),
        action: 'PAYMENT_VERIFICATION_FAILED',
        resource: 'payment',
        resourceId: req.body.reference,
        details: {
          error: errorMessage,
          statusCode
        },
        ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown'
      });
    } catch (auditError) {
      console.warn('⚠️ Failed to create audit log:', auditError.message);
    }

    res.status(statusCode).json({ 
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Paystack webhook handler for automatic payment notifications
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const hash = crypto
      .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash === req.headers['x-paystack-signature']) {
      const event = req.body;
      
      console.log('📢 Paystack webhook received:', event.event);

      switch (event.event) {
        case 'charge.success':
          console.log('✅ Payment successful via webhook:', event.data.reference);
          
          // Update user subscription
          if (event.data.metadata?.userId) {
            await User.findByIdAndUpdate(
              event.data.metadata.userId,
              {
                $set: {
                  subscriptionStatus: 'active',
                  subscriptionPlan: event.data.metadata.plan,
                  subscriptionUpdatedAt: new Date(),
                  lastPaymentAt: new Date(event.data.paid_at)
                }
              }
            );
          }

          // Log webhook event
          await AuditLog.create({
            userId: event.data.metadata?.userId || 'system',
            action: 'WEBHOOK_PAYMENT_SUCCESS',
            resource: 'payment',
            resourceId: event.data.reference,
            details: {
              amount: event.data.amount / 100,
              currency: event.data.currency,
              paidAt: event.data.paid_at,
              metadata: event.data.metadata
            },
            ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
            userAgent: req.get('User-Agent') || 'paystack-webhook'
          });
          
          break;

        case 'charge.failed':
          console.log('❌ Payment failed via webhook:', event.data.reference);
          
          await AuditLog.create({
            userId: event.data.metadata?.userId || 'system',
            action: 'WEBHOOK_PAYMENT_FAILED',
            resource: 'payment',
            resourceId: event.data.reference,
            details: {
              amount: event.data.amount / 100,
              currency: event.data.currency,
              failureReason: event.data.gateway_response,
              metadata: event.data.metadata
            },
            ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
            userAgent: req.get('User-Agent') || 'paystack-webhook'
          });
          
          break;

        default:
          console.log('ℹ️ Unhandled webhook event:', event.event);
      }

      res.status(200).send('OK');
    } else {
      console.error('❌ Invalid webhook signature');
      res.status(400).send('Invalid signature');
    }
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    res.status(500).send('Webhook processing failed');
  }
});

// Get payment history for authenticated user
router.get('/history', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const auditLogs = await AuditLog.find({
      userId: req.user._id.toString(),
      action: { $in: ['PAYMENT_SUCCESSFUL', 'PAYMENT_INITIALIZED', 'PAYMENT_VERIFICATION_FAILED'] }
    })
    .sort({ createdAt: -1 })
    .limit(parseInt(limit) * 1)
    .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await AuditLog.countDocuments({
      userId: req.user._id.toString(),
      action: { $in: ['PAYMENT_SUCCESSFUL', 'PAYMENT_INITIALIZED', 'PAYMENT_VERIFICATION_FAILED'] }
    });

    res.json({
      success: true,
      data: auditLogs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('❌ Error fetching payment history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment history'
    });
  }
});

// Test endpoint to check Paystack connection
router.get('/test', authenticate, async (req, res) => {
  try {
    const response = await axios.get('https://api.paystack.co/bank', {
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
      }
    });

    res.json({
      success: true,
      message: 'Paystack connection successful',
      data: {
        connected: true,
        bankCount: response.data.data.length
      }
    });
  } catch (error) {
    console.error('❌ Paystack connection test failed:', error);
    res.status(500).json({
      success: false,
      message: 'Paystack connection failed',
      error: error.response?.data?.message || error.message
    });
  }
});

export default router;