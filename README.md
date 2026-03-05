# Ticket CRM – Professional SLA-Driven Support Platform

A complete, role-based Ticket Management System with automated SLA tracking, multi-level escalation, and  CSV import tools.

## 🚀 Key Features
- **SLA Engine**: Automated tracking of resolution times (P1 to P5) with business-hour awareness.
- **Role Hierarchy**: Structured access for Agents, TLs, Managers, GMs, and Superadmins.
- **Escalation Loop**: Automatic and manual ticket escalation based on pre-defined SLAs.
- **Smart CSV Import**: Bulk upload tickets with de-duplication and automatic email/SMS notifications.
- **Dynamic Dashboard**: Real-time analytics on ticket statuses, volumes, and team performance.
- **Premium UI**: Clean, responsive layout with independent scrolling and professional SVG iconography.

---

## 🛠️ Prerequisites
- **Node.js**: v18 or higher
- **MySQL**: v8.0 or higher
- **NPM**: v9 or higher

---

## 🏗️ End-to-End Setup Guide

### 1. Clone the Repository
```bash
git clone <https://github.com/khushboodaryani/Ticket-CRM.git>
cd Ticket_CRM
```

### 2. MySQL Database Setup
1. **Startup MySQL**: Ensure your MySQL server is running.
2. **Access MySQL Shell**:
   ```bash
   mysql -u root -p
   ```
3. **Execute Setup Script**:
   Inside the MySQL shell, run the schema file located in the backend:
   ```sql
   SOURCE backend/src/db/schema.sql;
   ```
   *Note: This will create the `ticket_crm` database and all necessary tables.*

### 3. Backend Configuration
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Setup environment variables:
   Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```
   - Update `MYSQL_PASSWORD` with your local password.
   - Update `EMAIL_USER` and `EMAIL_PASSWORD` (App Password) for notifications.

### 4. Frontend Configuration
1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

---

## 🏃 Running the Application

### Start Backend
```bash
cd backend
npm run dev
```
The backend server will run on `http://localhost:8450`.

### Start Frontend
```bash
cd frontend
npm run dev
```
The Vite development server will run on `http://localhost:4455`.

---

## 🔐 Default Credentials
Logout and login with the superadmin account for first-time setup:
- **Email**: `admin@ticketcrm.com`
- **Password**: `Admin@1234`

---

## 📂 Project Structure
- **/backend**: Express.js REST API, MySQL migrations, node-cron SLA engine.
- **/frontend**: React.js (Vite), CSS3 (Modern/Glassmorphism theme), Context API.

## 📄 License
ISC
