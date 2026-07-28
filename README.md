# Doctor Patient Token System

A minimal receptionist-facing token system built with Node.js, Express, MongoDB Atlas, Mongoose, EJS, Bootstrap 5, and vanilla JavaScript.

## Features

- Fully automatic daily token numbers reset to `001`
- Unique yearly medical record numbers such as `MR-2026-000001`
- Patient relationship details using S/O, W/O, or D/O
- Complete visit history grouped by permanent MR number
- Follow-up token generation from an existing patient's MR history
- Atomic daily counters and duplicate-token protection
- Patient registration, search, date filtering, pagination, editing, and deletion
- Physician management and quick physician creation from the patient form
- CNIC normalization, validation, formatting, and partial search
- 80mm thermal-printer token layout
- Editable printable token header and footer under Physician Management
- Server-side validation and friendly form errors
- Session-based access control for authorized staff
- Automatic submit-button locking to prevent accidental double posting

## Installation

1. Install Node.js 18 or newer.
2. Clone or download this project.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Copy `.env.example` to `.env`:

   ```bash
   copy .env.example .env
   ```

5. Put your MongoDB Atlas connection string in `.env`. Ensure the Atlas network access and database user settings allow your machine to connect.
6. Start the development server:

   ```bash
   npm run dev
   ```

7. Open `http://localhost:3000`.

## Deploying to Vercel

1. Import the repository into Vercel.
2. In **Project Settings → Environment Variables**, add:

   - `MONGODB_URI`
   - `CLINIC_TIMEZONE`
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD`
   - `SESSION_SECRET`

3. Add the variables to the Production environment (and Preview if you use preview deployments).
4. In MongoDB Atlas, allow connections from your deployment environment. For a simple setup, add `0.0.0.0/0` under Network Access and use a strong database username and password. For stricter production security, use an appropriate private networking option.
5. Redeploy after adding or changing environment variables.

Vercel imports `app.js` as an Express application. MongoDB connections are cached within each warm serverless instance.

## Environment variables

```env
MONGODB_URI=your_mongodb_atlas_connection_string
PORT=3000
CLINIC_TIMEZONE=Asia/Karachi
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change_this_to_a_strong_password
SESSION_SECRET=replace_with_a_long_random_secret
```

`CLINIC_TIMEZONE` must be a valid IANA time-zone name. Token dates and dashboard totals use this timezone.

The application name in the navbar, login page, footer, browser title, and printed receipt comes from the saved **Printable Header** under Physician Management.

## Notes

- CNIC values are stored as 13-digit strings and displayed with dashes.
- Token numbers are generated automatically and cannot be edited by users.
- Every physician has an independent daily token sequence beginning at `001`.
- MR numbers are permanent, system-generated, and reset to sequence `000001` each year.
- The patient-list search checks MR number, patient name, CNIC, contact number, token number, physician name, and address.
- For an 80mm printer, choose the printer's 80mm paper size and disable browser headers and footers in the print dialog.
