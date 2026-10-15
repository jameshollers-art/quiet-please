# Quiet, Please: TestFlight and over-the-air updates

This project turns the game into an iPhone and iPad app. You don't need a Mac:
GitHub builds the app in the cloud and uploads it to TestFlight.

There are two ways to get changes to testers:

| What changed | How it ships | Time to testers |
|---|---|---|
| The game itself (anything in `www/`) | **Over-the-air update.** Push to `main`. | Next time they open the app |
| App-level things: icon, iOS settings, plugins, version number | **New TestFlight build.** Run the TestFlight workflow. | 20 to 45 minutes |

Almost every change you'll make is the first kind.

---

## One-time setup (about 30 minutes)

### 1. Pick the bundle ID (do this first, it's permanent)

The bundle ID is the app's permanent identifier with Apple. It's currently
`com.jimhollers.quietplease`. If you'd rather it belong to your studio, for
example `com.yourstudio.quietplease`, change it now in two places:

- `capacitor.config.json` → `"appId"`
- `ios/App/App.xcodeproj/project.pbxproj` → `PRODUCT_BUNDLE_IDENTIFIER`

You can't change it after you create the app in App Store Connect.

### 2. Put the project on GitHub

1. Create a new repository on GitHub named **`quiet-please`**.
   - **Public** is free and works as-is.
   - **Private** needs GitHub Pro ($4/month), because the update files are hosted on GitHub
     Pages, and Pages on a private repository is a paid feature. The update files contain the
     same game anyone could already pull out of the app, so public is a reasonable choice.
2. Upload this folder to it. From a terminal in this folder:
   ```
   git init
   git add .
   git commit -m "Quiet, Please iOS app"
   git branch -M main
   git remote add origin https://github.com/jameshollers-art/quiet-please.git
   git push -u origin main
   ```
   GitHub Desktop works too: **File → Add local repository**, then **Publish**.

If you use a different repository name or account, update `UPDATE_MANIFEST_URL` at the
top of `www/app.js` to `https://<your-account>.github.io/<repo-name>/latest.json`.

### 3. Register the app with Apple

1. Go to [developer.apple.com/account](https://developer.apple.com/account) → **Certificates, IDs & Profiles** → **Identifiers** → **+**.
   Choose **App IDs** → **App**, enter the description *Quiet Please* and your bundle ID from step 1 (Explicit). Click Register.
2. Go to [App Store Connect](https://appstoreconnect.apple.com) → **Apps** → **+** → **New App**.
   - Platform: iOS
   - Name: *Quiet, Please*. App Store names must be unique. If it's taken, try something like
     *Quiet, Please: Library Sim*. The name under the icon on the phone stays *Quiet, Please* either way.
   - Bundle ID: the one you just registered
   - SKU: anything, for example `quietplease`
3. While you're in Apple's developer site, note your **Team ID**: **Account → Membership details**.

### 4. Create an App Store Connect API key

This lets GitHub sign and upload builds for you.

1. App Store Connect → **Users and Access** → **Integrations** → **App Store Connect API** → **Team Keys** → **+**.
2. Name it *GitHub builds* and give it **Admin** access. Admin is required so the build can
   create and renew the signing certificate on its own.
3. Download the `.p8` file. **Apple only lets you download it once.** Keep it somewhere safe.
4. Note the **Key ID** (in the key's row) and the **Issuer ID** (above the table).

### 5. Add the secrets to GitHub

In your repository: **Settings → Secrets and variables → Actions → New repository secret**. Add four:

| Name | Value |
|---|---|
| `APPLE_TEAM_ID` | Team ID from step 3 (10 characters) |
| `ASC_KEY_ID` | Key ID from step 4 |
| `ASC_ISSUER_ID` | Issuer ID from step 4 |
| `ASC_KEY_P8` | Open the `.p8` file in a text editor and paste **everything**, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines |

### 6. Turn on GitHub Pages for updates

Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.

### 7. Make the first build

1. Repository **Actions** tab → **TestFlight build** → **Run workflow**.
2. It takes 15 to 25 minutes. A green check means it uploaded.
3. Apple then processes the build for another 5 to 30 minutes. You'll get an email when it's ready.

### 8. Install it on your phone

1. App Store Connect → your app → **TestFlight** → **Internal Testing** → **+** to create a group
   (for example *Me*), and add yourself. Turn on automatic distribution so new builds reach the group without extra clicks.
2. Install the **TestFlight** app from the App Store on your iPhone, open the invite email, and install *Quiet, Please*.

To invite friends who aren't on your Apple team, use **External Testing**. Apple reviews the
first external build (usually a day). After that you can share a public TestFlight link.

### 9. Publish the first over-the-air update

**Actions → Publish game update → Run workflow.** From then on it runs automatically every
time you push a change to `www/`.

---

## Day to day

**Changing the game:** replace `www/index.html` with the new version, then commit and push.
The **Publish game update** workflow packages it in about a minute. Testers' apps download it
in the background. Between shifts, a green **Update ready · Restart** button appears in the
bottom-left corner. If they don't tap it, the update applies the next time they reopen the app.

The day card shows which version is running, for example *App 1.0.0 · game 1.0.0-ota.12*,
so testers can tell you what they're on.

**Shipping a new app build:** bump `"version"` in `package.json` when you want a new version number,
commit, then run **TestFlight build** (or push a tag like `v1.0.1`). A new app build always starts
on the game bundled inside it, and then picks up later over-the-air updates as usual.

**When you must ship a build instead of an update:** adding native plugins, changing the icon,
splash screen, bundle ID or iOS settings, or anything in `ios/`.

**Safety net:** if a downloaded update fails to start, the app rolls back to the last version that
worked. A broken update can't brick testers' phones.

**Apple's rules:** updating the game's HTML and JavaScript over the air is allowed, as long as the
app stays the same kind of app it was reviewed as. Bug fixes, balance tweaks, new days and content
are all fine. Use a full build for anything that changes what the app fundamentally is.

---

## What's different from the web version

- **Co-op is hidden in the app.** It runs through claude.ai, which the app doesn't use. Online co-op
  in the app would need its own connection service (Firebase, Game Center or similar).
- Everything else works offline: the 3D library, save progress, graphics settings,
  keyboard and controller support (a Bluetooth controller paired to an iPhone or iPad works).

## If a build fails

| Error in the Actions log | Fix |
|---|---|
| `Missing repository secret …` | Add that secret (step 5). |
| `No Account for Team` or `No signing certificate` | The API key needs **Admin** access (step 4). Make a new key with Admin and update the three `ASC_` secrets. |
| `No profiles for '<bundle id>' were found` | The App ID from step 3 doesn't exactly match `capacitor.config.json` and the Xcode project. |
| `The bundle version must be higher` | Re-run the workflow; each run uses a higher build number automatically. |
| Upload works but the app doesn't appear in TestFlight | Wait for Apple's processing email, and check you added yourself to an internal group. |

| Update problem | Fix |
|---|---|
| `latest.json` shows a 404 | Turn on Pages (step 6) and run **Publish game update** once. |
| Testers never see the update | Check `UPDATE_MANIFEST_URL` in `www/app.js` matches your repository, then fully close and reopen the app. |

## Working on a Mac (optional)

```
npm install
npx cap sync ios
npx cap open ios
```

That opens the project in Xcode, where you can run it in the simulator or on a plugged-in iPhone.
