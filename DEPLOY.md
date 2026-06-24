# Deploy — Cloud Run backend + Netlify frontend

Production mirrors the dashboard: the React app is a static site on **Netlify**;
the BigQuery proxy runs on **Cloud Run**; Netlify rewrites `/api/*` to it
server-side, so the browser only ever calls same-origin `/api/*` and never
touches BigQuery directly.

```
Browser ──/api/*──► Netlify (static + rewrite) ──► Cloud Run proxy ──read-only──► BigQuery MVs
```

---

## 1. Deploy the backend to Cloud Run

The proxy authenticates via its **attached service account** (ADC through the
Cloud Run metadata server) — no key file. Create a least-privilege, read-only SA:

```bash
PROJECT=drivn-project-1
REGION=asia-south1          # match the dashboard's region

# Read-only BigQuery service account
gcloud iam service-accounts create operator-report-bq \
  --project "$PROJECT" --display-name "Operator Report proxy (read-only BQ)"

SA="operator-report-bq@$PROJECT.iam.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member "serviceAccount:$SA" --role roles/bigquery.dataViewer   # read tables/views
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member "serviceAccount:$SA" --role roles/bigquery.jobUser      # run query jobs
# (To scope reads to just the dataset instead of the whole project, grant
#  dataViewer on drivn-project-1.dashboard_kpis via a dataset IAM binding.)
```

Deploy from the `server/` folder (builds the Dockerfile via Cloud Build):

```bash
cd server
gcloud run deploy operator-report-proxy \
  --source . \
  --project "$PROJECT" \
  --region "$REGION" \
  --service-account "$SA" \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_CLOUD_PROJECT=$PROJECT,BQ_LOCATION=US,BQ_KPI_DATASET_FQ=$PROJECT.dashboard_kpis,BQ_MAX_BYTES_BILLED=2000000000,CACHE_TTL_MS=600000
```

Get the service URL and verify:

```bash
URL=$(gcloud run services describe operator-report-proxy --region "$REGION" --format 'value(status.url)')
echo "$URL"
curl -s "$URL/api/health"          # {"ok":true,...}
curl -s "$URL/api/report/meta"     # operators + window
```

> `--allow-unauthenticated` is required so Netlify's rewrite can reach it. The
> proxy is read-only (SELECT/WITH guard) and only reads the `dashboard_kpis` MVs.
> Optionally lock it down by adding `CORS_ORIGINS=https://<your-netlify-domain>`
> to the env vars (the rewrite is server-side, so CORS isn't strictly needed).

## 2. Point Netlify at the Cloud Run URL

Edit [netlify.toml](netlify.toml) and replace the placeholder host in the
`/api/*` redirect with the `$URL` from step 1, e.g.:

```toml
[[redirects]]
  from = "/api/*"
  to = "https://operator-report-proxy-xxxxxxxxxx.asia-south1.run.app/api/:splat"
  status = 200
  force = true
```

Commit the change.

## 3. Deploy the frontend to Netlify (connected Git repo)

This folder is already a git repo with an initial commit. Push it to GitHub/GitLab:

```bash
# from the operator/ folder
git remote add origin <your-repo-url>
git push -u origin main
```

Then in the Netlify dashboard:
1. **Add new site → Import an existing project** → pick the repo.
2. Build settings are read from `netlify.toml` (command `npm run build`, publish `dist`, Node 20) — no changes needed.
3. **No environment variables** are required on Netlify (the app calls same-origin
   `/api/*`, which the rewrite forwards to Cloud Run).
4. Deploy. Every push to `main` now auto-deploys.

## 4. Verify the live site

- Open the Netlify URL → the report loads for the default operator.
- `https://<netlify-domain>/api/health` returns `{"ok":true}` (rewrite works).
- Pick an operator / date range / toggles; export PDF + Excel.

---

## Notes

- **Data exposure:** the site is public (like the dashboard) and serves the same
  BigQuery-derived data. Add Netlify password protection / access control if it
  should be private.
- **Rolling window:** reports cover the dates currently loaded in the
  `dashboard_kpis` MVs (refreshed daily by the existing scheduled query). No
  separate data pipeline is needed for this app.
- **Redeploys:** push to update the frontend; re-run `gcloud run deploy` (step 1,
  without re-creating the SA) to update the backend.
