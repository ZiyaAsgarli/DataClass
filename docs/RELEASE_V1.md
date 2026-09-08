# DataClass V1.0 Release Inventory

## Release status

DataClass V1.0 has passed application, production UI, responsive, localization, accessibility, routing, and non-storage functional QA. Public release and tagging remain on hold while the external Neon identity blocker is open and final production storage validation is blocked. The canonical production application is [dataclass-two.vercel.app](https://dataclass-two.vercel.app).

The current production release candidate is commit `fa5ccfa4860dd02dd65fd5a71416f87b3bf880e3`. The locked frontend toolchain includes Node.js 24.x, Vite 8.2.1, React 19.2.8, TypeScript 6.0.3, and `@neondatabase/neon-js` 0.7.0-beta.

## Production architecture

### Frontend

- Vite, React, and TypeScript single-page application
- Vercel hosting with SPA route rewrites
- Azerbaijani and English interface, light and dark themes, responsive navigation, and accessible dialogs and controls

### Database and authentication

- Neon PostgreSQL database
- Neon Auth with Google OAuth
- Neon Data API for browser and Worker database calls
- `pg_session_jwt` 0.5.0 in the production database identity path
- Authenticated teacher and student roles derived by the database
- RLS and RPC authorization for class ownership, participating instructors, module instructors, memberships, lessons, assignments, submissions, and resources

### Private storage

- Private Backblaze B2 bucket
- Cloudflare Worker as the authorization, signing, and lifecycle-orchestration boundary
- Short-lived signed upload and download URLs
- Direct browser-to-B2 and B2-to-browser file transfer; the Worker does not proxy normal file bytes
- B2 credentials remain available only to the Worker

### Video

- OBS recordings are hosted as YouTube Unlisted videos
- DataClass stores validated YouTube metadata and renders privacy-enhanced embeds
- Video hosting and private file storage remain separate

## Shipped capabilities

- Google authentication
- Teacher and student roles with role-separated navigation and actions
- Class creation and management
- Invitations and membership
- Ordered modules and lessons
- YouTube lesson recordings
- Private lesson and assignment resources
- Assignments
- Student submissions with immutable version history
- Teacher feedback, revision requests, and review completion
- Azerbaijani and English localization
- Light and dark themes
- Responsive desktop, tablet, and mobile interface
- Keyboard and dialog accessibility improvements
- Contextual Help interface
- Real Data Analytics production class
- Excel module with 14 published lessons

## Current production content

The real production class is **Data Analytics**. Its modules are:

1. Excel — completed
2. SQL — upcoming
3. Power BI — upcoming
4. Python — upcoming

Excel contains exactly 14 published lessons in order and 14 YouTube recordings. No real Lesson 1 resource has reached finalized status. Archived Storage E2E records are operational history and are not real course content.

## Release boundary

No unfinished product capability is included in the V1.0 claim. The open Neon identity issue, frozen storage state, and release gates are recorded in [Known issues](KNOWN_ISSUES.md), [Release checklist](RELEASE_CHECKLIST.md), and [Release status](RELEASE_STATUS.md).
