# Asset Management Backend

A comprehensive Node.js backend for asset management with Firebase authentication, multi-tenant organizations, and comprehensive reporting.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- MongoDB
- Redis (optional, for rate limiting)

### Installation

1. **Clone and install dependencies**
```bash
npm install
```

2. **Environment Setup**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Database Setup**
```bash
# Start MongoDB (if running locally)
# Make sure MongoDB is running on mongodb://localhost:27017

# Create development data
npm run setup-dev
```

4. **Start the server**
```bash
# Development
npm run dev

# Production
npm start
```

## 🔑 Authentication Options

### Option 1: Development Mode (Recommended for testing)
Use the demo tokens created by `npm run setup-dev`:

```bash
# Admin access
Authorization: Bearer demo-admin-token

# User access  
Authorization: Bearer demo-user-token
```

### Option 2: Firebase Authentication
1. Set up Firebase project
2. Configure environment variables:
```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### Option 3: JWT Tokens
Set `JWT_SECRET` in your environment and create tokens programmatically.

## 📋 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `GET /api/auth/me` - Get current user
- `PUT /api/auth/profile` - Update profile

### Assets
- `GET /api/assets` - List assets with filtering/pagination
- `POST /api/assets` - Create new asset
- `GET /api/assets/:id` - Get asset details
- `PUT /api/assets/:id` - Update asset
- `DELETE /api/assets/:id` - Delete asset
- `GET /api/assets/:id/history` - Get asset history

### Organizations
- `GET /api/organizations` - List organizations
- `POST /api/organizations` - Create organization
- `PUT /api/organizations/:id` - Update organization
- `POST /api/organizations/:id/members` - Add member
- `DELETE /api/organizations/:id/members/:userId` - Remove member

### Users
- `GET /api/users` - List users (Admin/Manager)
- `GET /api/users/:id` - Get user details
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Deactivate user
- `POST /api/users/:id/activate` - Reactivate user
- `GET /api/users/search` - Search users

### Categories
- `GET /api/categories` - List categories
- `POST /api/categories` - Create category
- `PUT /api/categories/:id` - Update category
- `DELETE /api/categories/:id` - Delete category

### Reports
- `GET /api/reports/assets` - Asset reports with grouping
- `GET /api/reports/maintenance` - Maintenance reports
- `GET /api/reports/audit` - Audit trail (Admin/Manager)
- `GET /api/reports/utilization` - Utilization statistics
- `GET /api/reports/export` - Export data

### Dashboard
- `GET /api/dashboard/stats` - Dashboard statistics

## 🏗️ Project Structure

```
asset-backend/
├── config/           # Configuration files
├── middleware/       # Express middleware
├── models/          # Mongoose models
├── routes/          # API routes
├── scripts/         # Utility scripts
├── server.js        # Main server file
└── package.json
```

## 🔧 Configuration

### Environment Variables
See `.env.example` for all available configuration options.

### Database Models
- **User**: User accounts and authentication
- **Organization**: Multi-tenant organizations
- **Company**: Enterprise-level company management
- **Asset**: Core asset management
- **Category**: Asset categorization
- **AssetsLog**: Audit trail for assets
- **AuditLog**: System-wide audit logging
- **Maintenance**: Maintenance scheduling

## 🛡️ Security Features

- Firebase Authentication integration
- JWT token support
- Role-based access control (User, Admin, Manager, Owner)
- Permission-based authorization
- Rate limiting
- Audit logging
- Input validation
- CORS protection

## 📊 Features

- **Multi-tenant Architecture**: Support for multiple organizations
- **Role-based Access**: Granular permissions system
- **Asset Lifecycle**: Complete asset tracking from acquisition to disposal
- **Maintenance Management**: Scheduling and tracking
- **Comprehensive Reporting**: Assets, maintenance, audit trails
- **Real-time Dashboard**: Key metrics and statistics
- **Audit Trail**: Complete history of all actions
- **Category Management**: Hierarchical asset categorization

## 🔍 Development

### Demo Data
The `npm run setup-dev` command creates:
- Demo organization
- Admin user (admin@demo.com)
- Regular user (user@demo.com)  
- Sample categories
- Demo tokens for testing

### Testing API
1. Start the server: `npm run dev`
2. Visit: `http://localhost:5000`
3. Use demo tokens in Authorization header
4. Test endpoints with Postman/curl

### Example Request
```bash
curl -H "Authorization: Bearer demo-admin-token" \
     http://localhost:5000/api/dashboard/stats
```

## 🚨 Troubleshooting

### Firebase Errors
If you see Firebase configuration errors:
1. The system will automatically fall back to JWT/demo authentication
2. Set up Firebase credentials in `.env` for full functionality
3. Or use demo tokens for development

### Database Connection
- Ensure MongoDB is running
- Check MONGODB_URI in .env
- Default: `mongodb://localhost:27017/asset-manager`

### Permission Errors
- Check user roles and permissions
- Admin users have all permissions
- Use demo-admin-token for full access during development

## 📝 License

This project is licensed under the ISC License.
