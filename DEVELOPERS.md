# Notes for development

## Components

There are 4 pieces

- Server
- Web app
- CLI
- Data

  - Speaking of the last bit - _where_ and _how_ do I get me some data?

    That's another story. Short answer: scripts and manual slogging. Long answer will come when people start to want it.

# Running

## Requirements for local development or running

- Java 21
- Node (npm)
- Python 3 (for `morsor-cli` only; stdlib only)

## Web app: How to run

### Option 1. Using the canned data:

In a terminal:
```
./gradlew bootRun
```

In another terminal:
```
cd frontend
npm install # Needed on the first run, or if dependencies change
npm run dev
```

### Frontend tests

From the project root or from `frontend`:
```
cd frontend
npm run test
```
Watch mode (re-run on file changes): `npm run test:watch`. Run a single test file: `npm run test -- src/RequireAuth.test.jsx`.

**Tests with canned data:** To run frontend tests against the same data shape as the dev backend (e.g. Little Prince trove, "The Little Prince, in Ancient Greek"), use the fixture-based mocks. Fixtures live in `frontend/src/fixtures/` (troves, search response, health). In tests, call `mockFetchWithCannedData()` and stub `fetch` with it so requests return that data without starting the backend. See `App.cannedData.test.jsx` and `mockFetchWithCannedData.js`. Trove JSON for the backend lives in **`fixtures/data/`** at the repo root; run `./gradlew bootRun` from the project root so the app loads from `file:./fixtures/data/*.json`. Override with `moocho.data.location` if needed.


## Option 2. You can use AWS S3 as a data store:

You'll have to put your trove data in place. See [DATA.md](./DATA.md) for some info in this. If you need help go ahead and contact me!

Once this is done, you'll need to set your AWS credentials, then do the same as a canned data run with two extra pieces of configuration. Use the **s3troves** profile so trove data is loaded from S3 (use **postgres,s3troves** for Postgres + S3):
```
SPRING_PROFILES_ACTIVE=postgres,s3troves MOOCHO_BUCKET_NAME=your-bucket ./gradlew bootRun
```

See [envrc-template](./envrc-template) for a description of the configuration environment variables.

## Build Docker Image

1. Build docker image

Tag with morsor

```bash
docker build -t morsor .
```

Or, if you need a different architecture (which if you're on a Mac, you PROBABLY DO to deploy on a web host), maybe something like this:
```
docker build --platform linux/amd64 -t morsor .
```

This may not work because of "buildx / multi-platform issues" (sorry, no further details here).

A symptom of this would be your web host telling you that the architecture is incorrect. If this happens, AND the default builder supports multi-platform, you can use it:
```
docker buildx create --use --name multiarch  # only if needed
docker buildx build --platform linux/amd64 -t morsor --push .
```

_Note_: The image is a multi-stage build: Node builds the frontend, then Gradle builds the Spring Boot jar (with `-PskipFrontendBuild=true` so the pre-built static is used), and the final image runs only the JAR on Eclipse Temurin 21 JRE.

2. Test it

To use the canned data:
```
docker run -p 8080:8080 morsor
```

# Run in Non-Embedded-SQL mode, and/or Production Mode

## Production-like mode

To use S3-backed troves with Postgres, use profiles **postgres,s3troves** and pass env vars:

```bash
docker run -p 8080:8080 \
  -e SPRING_PROFILES_ACTIVE=postgres,s3troves \
  -e MOOCHO_BUCKET_NAME=your-bucket \
  -e AWS_ACCESS_KEY_ID=... \
  -e AWS_SECRET_ACCESS_KEY=... \
  -e AWS_REGION=... \
  morsor
```

After you run the image, open [http://localhost:8080](http://localhost:8080).

# Deploying

## Deploying as a Docker image

Build and Push Docker Image all at once
```
docker buildx build --platform linux/amd64 -t artifact-repo-username/morsor:latest --push .
```

Or tag then push

```
docker tag morsor artifact-repo-username/morsor:latest
docker push artifact-repo-username/morsor:latest
```

That should get you on your way to deploying on a webhost which can host Docker images.

## Deploying the Docker image to a container registry

The script `deploy-container-to-registry.sh` builds the image and pushes it to a registry. You can configure it with these environment variables (all prefixed with `MOOCHO_`):

| Variable | Default | Description |
|----------|---------|-------------|
| `MOOCHO_REGISTRY` | `cschuyle/morsor` | Image repository used for tagging and push (e.g. `myregistry.io/user/morsor`). |
| `MOOCHO_VERSION` | `latest` | Image tag (e.g. `1.0.0` or `latest`). |
| `MOOCHO_ARCHITECTURE` | *(unset)* | Docker build platform (e.g. `linux/amd64`, `linux/arm64`). If unset or empty, `docker build` is run without `--platform` (host default). |

Example:

```bash
MOOCHO_REGISTRY=myregistry.io/me/morsor MOOCHO_VERSION=1.2.3 MOOCHO_ARCHITECTURE=linux/amd64 ./deploy-container-to-registry.sh
```


# CLI (`morsor-cli`)

The project includes a **Python 3** command-line client (stdlib only; no `pip install`).

## Run from repo

```bash
./scripts/morsor-cli --help
# or:
python3 scripts/morsor-cli --help
```

## Install globally

Copy the script onto your `PATH` (it is a single Python 3 file):

```bash
cp scripts/morsor-cli /usr/local/bin/morsor-cli
chmod +x /usr/local/bin/morsor-cli
morsor-cli --help
```

## CLI Examples:

**List all the troves**

```
➜ ./scripts/morsor-cli troves
...
vinyl                                                                                         	98   	Vinyl
```

**Search the `vinyl` trove for anything by King Gizzard and the Lizard Mizard**
```
➜ ./scripts/morsor-cli search --trove=vinyl --query='King Gizzard'
9.14	vinyl	King Gizzard and the Lizard Wizard - Murder of the Universe
```

**Create an ephemeral trove in preapration for findin interesting things in a directory**
```
➜ ./scripts/morsor-cli local-trove /path/to/local/directory
troveId	local-568fbc8c-acc1-447a-9e3e-389bbf6a338f
name	/Volumes/cschuyle/Noncloud-Data/video/_Handbreakme
```

_Notice that the output contains the ID of the new ephemeral trove created by the command_

Use the ephemeral trove to find files/directories in my `/path/to/local/directory` which are in the existing troves `vinyl` or `CDs`
```
➜ ./scripts/morsor-cli dups -S 10000 --primaryTrove=local-e980f196-ae1c-4c82-9f9f-a3e5b8e06920 --compareTrove=vinyl --compare-trove=CDs -o json | jq -r '.rows[].primary.title'
```

# Misc Details

## Working with Postgres locally

### Install Python 3 and the bcrypt package (once)

```bash
pip install bcrypt   # or pip3 install bcrypt
```


### Start psql using the included docker-compose (when needed)

```bash
docker compose up -d
```


### Database schema (Flyway)

Migrations live under `src/main/resources/db/migration/h2+postgres/` (one script set for H2 dev and PostgreSQL).

- **New empty Postgres:** start the app with the `postgres` profile; Flyway applies `db/migration/h2+postgres/V1__auth_baseline.sql` then `V2__saved_queries.sql` (and later versions) on startup—the same scripts as H2 dev.
- **Existing Postgres** that already has auth tables but no `flyway_schema_history`: `application-postgres.properties` sets `spring.flyway.baseline-on-migrate=true` and `spring.flyway.baseline-version=1` so the first run baselines at V1 (skips re-creating users/tokens) and applies **V2** if `saved_queries` is still missing.
- **Manual SQL** (without starting the app): run those two files in order in `psql` (see `src/main/resources/schema.sql`).

### Create a user (Postgres, once)

   ```bash
   python3 scripts/create-user.py
   # Paste the printed SQL into psql, or run: PGPASSWORD=morsor psql -h localhost -U morsor -d morsor and paste.
   ```


### Create User (for production or local Postgres) (once)

```
python3 scripts/create_user.py
```

Paste the printed SQL into your database (e.g. via `psql`).

```
PGPASSWORD=morsor psql -h localhost -U morsor -d morsor
morsor=# INSERT INTO users (username, password_hash, enabled)
VALUES ('username', 'hashed-password', true);
INSERT 0 1
```


###  Run the app against Postgres

Use the `postgres` profile so the app uses Postgres instead of H2:
```bash
SPRING_PROFILES_ACTIVE=postgres SPRING_DATASOURCE_PASSWORD=morsor ./gradlew bootRun
```


### Notes re: dev API token

The app uses an API token (not a username/password) for authentication in dev mode (which is the default). The token is hardwired and cannot be used when the **postgres** profile is active.

Vite dev server (npm run dev, e.g. http://localhost:5173): import.meta.env.DEV is true → token is sent → So no login screen is presented.

Production build (e.g. served from Spring Boot at http://localhost:8080): import.meta.env.DEV is false → no token → login required.

_Optional override_

To use a different dev token, add to .env.local in the frontend:
`VITE_DEV_API_TOKEN=your-dev-token`


### Summary of different "modes" and configurations

Env var `SPRING_PROFILES_ACTIVE` is a comma-delimited list of profiles to activate. Default is **dev**

- Spring profile **dev** (default): H2, classpath troves, Flyway applies `db/migration/h2+postgres`, DevDataSeeder inserts dev user + API token.
  - No env vars required

- Spring profile **postgres**: Postgres, same Flyway scripts (`h2+postgres`), no dev seeding (no seeded user/token).
  - Env vars: `SPRING_DATASOURCE_PASSWORD`

- Spring profile **s3troves**: Trove data loaded from S3; set `MOOCHO_BUCKET_NAME`. Use with `dev` (H2) or `postgres` (Postgres), e.g. `postgres,s3troves`.
  - Env vars: 
    - `AWS_ACCESS_KEY_ID`
    - `AWS_SECRET_ACCESS_KEY`
    - `AWS_REGION`
    - `MOOCHO_BUCKET_NAME`

So-called "Production" mode: You would normally activate **postgres** and **s3troves** profiles, which forces you to provide your own trove data in S3, and create at least one user.

**Other env vars:** 

- `MOOCHO_INCLUDE_TROVE_IDS` limits which troves are loaded (all profiles). If not set, all troves are loaded except those listed in MOOCHO_EXCLUDE_TROVE_IDS.
- `MOOCHO_EXCLUDE_TROVE_IDS` excludes troves from loading (all profiles), even if those troves are listed in `MOOCHO_INCLUDE_TROVE_IDS`.
- `MOOCHO_DATA_LOCATION` overrides where trove JSON files are loaded from when not using S3 (default: `file:./fixtures/data/*.json`; run from project root). 

Search result cache ( See [envrc-template](./envrc-template) )
- `MOOCHO_CACHE_TTL_MINUTES` (default 720 = 12 hours) 
- `MOOCHO_CACHE_MAX_BYTES` (default 1073741824 = 1GB); when the cache is full, results are still returned but not cached and the UI shows a warning. 

Login session (See [envrc-template](./envrc-template))
- `MOOCHO_SESSION_TIMEOUT` (default `12h`; Spring Boot duration such as `30m`, `12h`, `1d`)