# Pet Fund — one-time setup

About 15 minutes. You need your personal Google account (<your-gmail>).
Keep this Pet Fund project separate from any RB Supabase project.

## 1. Create the Supabase project

1. Go to <https://supabase.com/dashboard> and sign in (use your personal account, not RB's).
2. **New project** → Name: `pet-fund` → choose a strong database password (save it in your password manager) → Region: **Southeast Asia (Singapore)** → Create.
3. When it's ready: left menu **SQL Editor** → **New query** → paste the whole of `supabase/schema.sql` → **Run**. You should see "Success. No rows returned".

## 2. Turn on Google sign-in

**In Google Cloud (creates the "Sign in with Google" button's identity):**

1. Go to <https://console.cloud.google.com/> → project picker → **New project** → name `Pet Fund` → Create, and make sure it's selected.
2. **APIs & Services → OAuth consent screen** (may be called **Google Auth Platform**) → Get started:
   - App name `Pet Fund`, support email = your Gmail → Audience **External** → contact email = your Gmail → Create.
   - **Audience** → leave Publishing status on **Testing** → **Test users → + Add users** → add each family Gmail.
     Only listed test users can sign in (a second lock on top of the database allowlist). On first sign-in Google shows
     "Google hasn't verified this app" → tap **Continue**; that's expected.
   - Google Cloud requires 2-Step Verification on your Google account before it lets you in.
3. **Clients** (or **Credentials → Create credentials → OAuth client ID**) → Application type **Web application** → Name `Pet Fund web`.
   - **Authorised redirect URIs** → add `https://<your-project-ref>.supabase.co/auth/v1/callback`
     (find it in Supabase → **Authentication → Sign In / Providers → Google** — it shows the exact Callback URL to copy).
   - Create → copy the **Client ID** and **Client secret**.

**In Supabase:**

4. **Authentication → Sign In / Providers → Google** → Enable → paste Client ID and Client secret → Save.
5. **Authentication → Sign In / Providers**: turn **off** Email (and make sure Phone and Anonymous sign-ins are off).
   Google is the only way in; leaving email sign-up on would let strangers create accounts.
6. **Authentication → URL Configuration**:
   - Site URL: `http://localhost:5173` (we change this to the live GitHub Pages address at the end).
   - Redirect URLs → Add: `http://localhost:5173/**`

## 3. Add the family's emails (never put these in the code)

SQL Editor → New query → edit and run:

```sql
update members set email = '<your-gmail>' where name = 'Kelvin';
update members set email = '<vincent gmail>'        where name = 'Vincent';
update members set email = '<desmond gmail>'        where name = 'Desmond';
update members set email = '<jolyn gmail>'          where name = 'Jolyn';
update members set email = '<dickson gmail>'        where name = 'Dickson';
select name, email from members order by sort;
```

You can do just your own row now and add the others later (also possible from the app's Settings screen).

## 4. Give Claude the two public values

Supabase → **Project Settings → API Keys** (or **Data API**):

- **Project URL** — `https://<ref>.supabase.co`
- **Publishable key** (`sb_publishable_…`) — or, on older projects, the **anon public** key.

Both are designed to be public; the database rules protect the data. **Never share the `service_role` / secret key.**

## 5. (Later, at publish time) GitHub

Covered in the final step: create the repo, enable Pages, add two repository secrets
(`SUPABASE_URL`, `SUPABASE_ANON_KEY` = the same two values above) for the keep-alive job, then add the Pages address to Supabase step 2.6 and set it as the Site URL.
