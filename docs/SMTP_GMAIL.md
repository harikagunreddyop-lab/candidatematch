# Custom SMTP (Gmail) for Supabase Auth

Invites and password reset emails are sent by **Supabase Auth** using the SMTP settings configured in your Supabase project. If invites or reset emails are not arriving, the most common cause is **Gmail rejecting the SMTP password**.

## Fix: Use a Google App Password

1. **Enable 2-Step Verification** (if not already):
   - Go to [Google Account → Security](https://myaccount.google.com/security)
   - Turn on **2-Step Verification**

2. **Create an App Password**:
   - In Security, find **App passwords** (or open [App passwords](https://myaccount.google.com/apppasswords))
   - Click **Select app** → **Mail** (or **Other** and name it e.g. "Orion CMOS")
   - Click **Generate**
   - Copy the **16-character password** (no spaces)

3. **Configure Supabase**:
   - Supabase Dashboard → **Project** → **Authentication** → **SMTP Settings**
   - Enable **Custom SMTP**
   - **Sender email:** `vinayvasamsetty01@gmail.com`
   - **Sender name:** e.g. `vinay vasamsetty`
   - **Host:** `smtp.gmail.com`
   - **Port:** `587`
   - **Username:** `vinayvasamsetty01@gmail.com`
   - **Password:** paste the **App Password** (not your normal Gmail password)
   - Save

4. **Test**:
   - Send an invite from Admin → Users, or use "Forgot password" on the login page.
   - Check spam/junk the first time; mark as "Not spam" if needed.

## Notes

- **Do not** use your regular Gmail password in the SMTP password field — Google blocks it for third-party apps.
- Gmail free accounts: ~500 emails/day limit.
- Supabase uses this SMTP for: **invite emails**, **password reset**, and **email confirmation** (if enabled).
