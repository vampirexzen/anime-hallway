# Slime Park — starter project

A responsive HTML/CSS/JavaScript browser app using Supabase Auth, Postgres, RLS, and Realtime.

## Deploy to GitHub Pages

1. Put `index.html`, `styles.css`, and `app.js` in the root of your `anime-hallway` repository (or copy this folder's contents into the published folder).
2. In Supabase Dashboard → SQL Editor, run `supabase.sql`.
3. In Supabase → Authentication → URL Configuration, set the Site URL to `https://vampirexzen.github.io/anime-hallway/` and add that URL to Redirect URLs.
4. Ensure email confirmation settings match your desired sign-up flow.
5. Confirm `SUPABASE_URL` and the **anon/publishable** key at the top of `app.js` match Project Settings → API. The key pasted into the original request appears malformed in the URL/key pair; double-check both values before deploying.
6. Commit and push the files. GitHub Pages will serve the static site.

## Current implementation

- Sign-up/sign-in/sign-out with Supabase Auth
- User profile, username search, avatar emoji, points
- Realtime-backed shared park chat and presence refresh
- Friend requests, acceptance, unfriend, friend-only DMs
- Marketplace catalog, live preview, server-side purchase RPC
- Slime Memories and Catch the Patels mini-games with reward RPCs
- Lobby reward attempt every 15 minutes
- Responsive layout, bouncing slime, mobile move/jump controls
- Staff moderation RPC scaffolding and music setting

## Important production work still required

This is a functional starter, not a fully production-hardened game. Before opening it to the public:

- **Developer bootstrap:** never put the developer secret in browser code. Configure the server-only setting as documented in `supabase.sql`, or better use a Supabase Edge Function and secret. Bootstrap the first developer securely; don't allow anyone to self-assign admin/developer.
- **Username login:** Supabase Auth supports email/password by default. To sign in with username, create a secure Edge Function that resolves username to email without leaking emails. The placeholder `email_for_username` function intentionally returns null.
- **Bans:** banning a profile does not by itself block Supabase Auth login. Enforce it with an Auth Hook / Edge Function or custom access flow.
- **Account deletion:** use an Edge Function with the service-role key on the server. Never expose service-role keys in frontend code.
- **Rewards:** server RPCs prevent simple browser-side point editing, but mini-game scores are still client-submitted. Add server-validated game sessions, rate limits, and anti-cheat before real deployment.
- **Lobby reward timer:** the client requests a reward every 15 minutes; production should validate continuous presence server-side rather than trust a browser timer.
- **Profile cosmetics:** add an equip-cosmetic RPC and UI to persist equipped inventory. Current market preview is local and purchase adds the item to inventory.
- **Realtime:** enable Realtime for `park_messages`, `profiles`, `friendships`, and `direct_messages` in Supabase replication settings if you want instant subscriptions.
- **Security review:** test every RLS policy with separate user accounts. Keep the service-role key private. Public anon/publishable keys are expected in browser apps only when RLS is correctly configured.
- **Audio:** paste a royalty-free HTTPS MP3 URL as an admin/developer; browser autoplay requires a user gesture.

## Notes

The requested rewards are implemented as 1 point per 15 minutes, 3 for a completed memory round, and 5 for catching 10 Patels / 25 for all 50. The latter follows “up to 5 points if all 50” ambiguously; change the `complete_minigame` reward branch to `5` if you want 5 points for 50, rather than 25.
