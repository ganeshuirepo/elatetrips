# Deploying ElateTrips to AWS EC2

One EC2 instance runs everything: Nginx (port 80) → Next.js frontend (:3000) + Express API (:4000),
both managed by PM2. The frontend calls the API on the **same origin** (`/api/v1`), so there is no
CORS in production. Every push to `main` auto-deploys via GitHub Actions.

```
Browser ──▶ Nginx :80 ──▶ /        ──▶ Next.js :3000  (pm2: elate-frontend)
                     └──▶ /api/... ──▶ Express :4000  (pm2: elate-backend) ──▶ MongoDB Atlas
```

## What you need (checklist)

| # | Item | Notes |
|---|------|-------|
| 1 | AWS account + EC2 instance | Ubuntu 22.04/24.04. **t3.small recommended** (2 GB RAM). t2/t3.micro works — the setup script adds 2 GB swap for builds. |
| 2 | Security group | Inbound: 22 (SSH, your IP only), 80 (HTTP, anywhere), 443 (HTTPS, if using a domain). |
| 3 | Elastic IP | Attach one so the public IP survives restarts. |
| 4 | Key pair (.pem) | For SSH; its private key also goes into GitHub secrets for auto-deploy. |
| 5 | MongoDB Atlas whitelist | Add the EC2 Elastic IP under Network Access (same issue we hit locally). |
| 6 | Backend secrets | `MONGODB_URI`, `JWT_SECRET` (generate a long random one), `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, SMS keys when you have them. |
| 7 | GitHub repo secrets | `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY` (see step 3). |
| 8 | (Optional) Domain + HTTPS | Point an A record at the Elastic IP, then run certbot (step 5). |

## 1. Launch the instance

EC2 → Launch instance → Ubuntu 22.04 LTS, t3.small, your key pair, the security group above.
Attach an Elastic IP. Then SSH in:

```bash
ssh -i your-key.pem ubuntu@<ELASTIC_IP>
```

## 2. Bootstrap the server (one time)

```bash
curl -fsSL https://raw.githubusercontent.com/ganeshuirepo/elatetrips/main/deploy/ec2-setup.sh | bash
```

This installs Node 20, PM2, Nginx, adds swap, clones the repo to `~/elatetrips`, writes
`.env.production` (`NEXT_PUBLIC_API_BASE=/api/v1`), copies the backend env example, and wires
Nginx + PM2 boot. Then fill in the real backend secrets:

```bash
nano ~/elatetrips/elatetrips-node/.env
# set: NODE_ENV=production, MONGODB_URI, JWT_SECRET, BREVO_API_KEY, BREVO_FROM_EMAIL
# set: CORS_ORIGINS=http://<ELASTIC_IP>   (or https://yourdomain.com)
```

And run the first deploy:

```bash
bash ~/elatetrips/deploy/deploy.sh
```

Open `http://<ELASTIC_IP>` — the app should be live.

## 3. Automatic deploys (GitHub Actions)

The workflow at `.github/workflows/deploy.yml` runs on every push to `main`:
typecheck + tests for both apps, then SSH into EC2 and run `deploy/deploy.sh`
(pull → build both → PM2 reload → health checks; a failed health check fails the run).

Add three secrets in GitHub → repo → Settings → Secrets and variables → Actions:

| Secret | Value |
|--------|-------|
| `EC2_HOST` | The Elastic IP (or domain) |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | Full contents of your `.pem` private key |

That's the whole pipeline: `git push origin main` → tests → live on EC2 in ~3–5 minutes.
You can also trigger it manually from the Actions tab (workflow_dispatch).

## 4. Day-2 operations

```bash
pm2 status                        # both apps green?
pm2 logs elate-backend --lines 50 # API logs (OTP codes appear here in console mode)
pm2 logs elate-frontend
bash ~/elatetrips/deploy/deploy.sh  # manual redeploy
pm2 restart all                   # restart without redeploying
```

Env changes: edit `elatetrips-node/.env` → `pm2 restart elate-backend`.
Changing `NEXT_PUBLIC_API_BASE` requires a frontend rebuild (it's baked in at build time) — just rerun deploy.sh.

## 5. Optional: domain + HTTPS

```bash
sudo sed -i 's/server_name _;/server_name yourdomain.com;/' /etc/nginx/sites-available/elatetrips
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com   # auto-configures SSL + renewal
```

Then update `CORS_ORIGINS=https://yourdomain.com` in the backend env and restart it.

## Costs (ballpark)

- t3.small: ~$15/mo (or t3.micro ~$7.5/mo — free tier eligible for 12 months)
- Elastic IP: free while attached; MongoDB Atlas M0: free; Brevo: free tier.
