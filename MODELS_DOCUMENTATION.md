# Asset Management System - Models Documentation

## Overview
This document describes the complete data models for the asset management backend system. All models use MongoDB with Mongoose ODM and ES6 modules.

## Models Structure

### 1. User Model (`User.js`)
**Purpose**: Manages user accounts and authentication via Firebase

**Key Features**:
- Firebase integration for authentication
- Role-based access control (user, admin, manager, owner)
- Organization membership
- Permission system
- Profile management

**Relationships**:
- Belongs to Organization (many-to-one)
- Can own/create multiple assets
- Can perform maintenance tasks

### 2. Organization Model (`Organizations.js`)
**Purpose**: Manages organizational units and their members

**Key Features**:
- Multi-tenant organization structure
- Member management with roles and permissions
- Organization settings and configuration
- Subscription management
- Asset limits and restrictions

**Relationships**:
- Has many Users
- Has many Assets
- Has many Categories
- Belongs to Company (optional)

### 3. Company Model (`Company.js`)
**Purpose**: Manages company-level information and multi-organization hierarchy

**Key Features**:
- Corporate information and legal details
- Multi-organization management
- Subscription and billing management
- Feature access control
- Company hierarchy (parent/subsidiary)

**Relationships**:
- Has many Organizations
- Can have parent Company
- Can have subsidiary Companies

### 4. Asset Model (`Asset.js`)
**Purpose**: Core asset management with comprehensive tracking

**Key Features**:
- Complete asset lifecycle management
- QR code and barcode support
- Depreciation calculation
- Maintenance scheduling
- Assignment tracking
- Custom fields support

**Relationships**:
- Belongs to Organization
- Belongs to Category
- Can be assigned to User
- Has many AssetsLog entries
- Has many Maintenance records

### 5. Category Model (`Category.js`)
**Purpose**: Asset categorization and hierarchical organization

**Key Features**:
- Hierarchical category structure
- Visual customization (icons, colors)
- Organization-specific categories
- Asset counting
- Sorting and ordering

**Relationships**:
- Belongs to Organization
- Can have parent Category
- Can have multiple subcategories
- Has many Assets

### 6. AssetsLog Model (`AssetsLog.js`)
**Purpose**: Comprehensive audit trail for all asset operations

**Key Features**:
- Complete action logging
- Change tracking (before/after values)
- Severity and category classification
- Metadata capture (IP, user agent, etc.)
- Automated logging helpers

**Log Actions**:
- created, updated, assigned, unassigned
- moved, maintenance_started, maintenance_completed
- status_changed, retired, deleted, restored

### 7. AuditLog Model (`AuditLog.js`)
**Purpose**: System-wide audit logging for security and compliance

**Key Features**:
- User action tracking
- Resource access logging
- IP and user agent capture
- Timestamp tracking

### 8. Maintenance Model (`Maintenance.js`)
**Purpose**: Maintenance scheduling and tracking

**Key Features**:
- Scheduled and emergency maintenance
- Cost tracking (labor, parts, external)
- Duration estimation and tracking
- Assignment to technicians
- Parts and supplier management
- File attachments support

**Maintenance Types**:
- Scheduled, Emergency, Preventive, Corrective

**Status Tracking**:
- Scheduled, In Progress, Completed, Cancelled, Overdue

## Key Relationships Diagram

```
Company (1) ─── (n) Organization (1) ─── (n) User
    │                    │                    │
    │                    │                    │
    └─ (n) Subsidiary    ├─ (n) Asset ──── (n) AssetsLog
                         │     │              │
                         │     └─ (n) Maintenance
                         │
                         └─ (n) Category
```

## Missing Content That Was Added

### 1. **Empty Model Files**
- `Organizations.js` - Was empty, now has complete organization management
- `Category.js` - Was empty, now has hierarchical category system
- `Company.js` - Was empty, now has company and subscription management
- `AssetsLog.js` - Was empty, now has comprehensive audit logging
- `index.js` - Was empty, now exports all models

### 2. **Module System Inconsistency Fixed**
- Converted `Asset.js` from CommonJS to ES6 modules
- Updated category reference from string enum to ObjectId reference
- Ensured all models use consistent ES6 import/export syntax

### 3. **Enhanced Existing Models**
- **User.js**: Added organization relationship, permissions, enhanced roles
- **Asset.js**: Updated category to reference Category model instead of enum

### 4. **New Model Added**
- **Maintenance.js**: Complete maintenance management system

### 5. **Improved Relationships**
- Added proper foreign key relationships between all models
- Added virtual fields for computed values
- Added indexes for performance optimization
- Added validation and business logic methods

## Features Added

### Security & Audit
- Comprehensive logging system
- Permission-based access control
- IP and user agent tracking
- Before/after change tracking

### Business Logic
- Automatic depreciation calculation
- Maintenance scheduling
- Subscription limit checking
- Role-based permissions

### Performance
- Strategic database indexes
- Virtual fields for computed values
- Efficient querying methods

### Scalability
- Multi-tenant architecture
- Company → Organization → User hierarchy
- Flexible permission system
- Subscription-based feature access

This complete model structure provides a robust foundation for an enterprise-level asset management system with proper audit trails, multi-tenancy, and comprehensive business logic.
