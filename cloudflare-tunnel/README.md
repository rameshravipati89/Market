# Cloudflare Tunnel — Public URL for RecruitIQ Pro

Exposes the local RecruitIQ Pro site to the internet via a free Cloudflare Tunnel.
No account or token needed — generates a temporary public URL automatically.

## How it works
- cloudflared container connects to Cloudflare's network
- Cloudflare gives a public URL like: https://random-words.trycloudflare.com
- Anyone on the internet can access RecruitIQ Pro via that URL

## Find the public URL
After running the full build, check the tunnel logs:

    podman logs cloudflare_tunnel

Look for a line like:
    Your quick Tunnel has been created! Visit it at: https://xxx-xxx.trycloudflare.com

## Notes
- The URL changes every time the container restarts
- For a permanent URL, sign up at https://cloudflare.com and use a named tunnel
