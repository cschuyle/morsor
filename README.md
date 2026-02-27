# Morsor

A list of lists navigator

## Why?

The REAL goal: Vibe-code the whole thing. This is my first experience vibe-coding.

But, as for what the app DOES:

I'm a list-maker. I have a few dozen lists which I want to be able to easily browse, search and do some analysis on. That's what the app does.

## What's the name?

This is a re-write of a previous app I built, called Moocho.me.

I like Walruses.

I speak Spanish.

Morsa is Walrus in Spanish.

Moocho and Morsa both start with M.

I used Cursor for this.

Morsa + Cursor = Morsor.

I like Lord of the Rings. If you do too you know what Mordor is.

There is a distance of 1 between Mordor and Morsor in two pretty basic measurements:
- Levenshtein
- Between keys on most keyboards

# Features

- Search all troves (that's what I call a list), or a subset of troves.
- Find duplicate items (or, near-duplicates) across troves.
    - Example: I've got a couple troves: a list of movie favorites, and a list of movies which are available on Kanopy. Find stuff I like which is available on Kanopy.
- Conversely, find unique items within a trove, with respect to other troves.
    - Example: Same troves as the previous example. Find movies which I like but which I can't get on Kanopy. Then I can rent or buy those movies instead of getting them for free on Kanopy.

## Where do I get the data?

That's another story. Short answer: scripts and manual slogging.

## Requirements for local development or running

- Java 21
- Node (npm)

## How to run

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


## Deplpoying as a Docker image

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


# Working with Postgres locally

## Install Python 3 and the bcrypt package (once)

```bash
pip install bcrypt   # or pip3 install bcrypt
```


## Start psql using the included docker-compose (when needed)

```bash
docker compose up -d
```


## Create schema and a user (once)
   ```bash
   # Load the auth tables (run once)
   PGPASSWORD=morsor psql -h localhost -U morsor -d morsor -f src/main/resources/schema.sql

   # Create a user (and optionally an API token)
   python3 scripts/create-user.py
   # Paste the printed SQL into psql, or run: PGPASSWORD=morsor psql -h localhost -U morsor -d morsor and paste.
   ```


## Create User (for production or local Postgres) (once)

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


##  Run the app against Postgres

Use the `postgres` profile so the app uses Postgres instead of H2:
```bash
SPRING_PROFILES_ACTIVE=postgres SPRING_DATASOURCE_PASSWORD=morsor ./gradlew bootRun
```


## Notes re: dev API token

The app uses an API token (not a username/password) for authentication in dev mode (which is the default). The token is hardwired and cannot be used when the **postgres** profile is active.

Vite dev server (npm run dev, e.g. http://localhost:5173): import.meta.env.DEV is true → token is sent → So no login screen is presented.

Production build (e.g. served from Spring Boot at http://localhost:8080): import.meta.env.DEV is false → no token → login required.

_Optional override_

To use a different dev token, add to .env.local in the frontend:
`VITE_DEV_API_TOKEN=your-dev-token`


## Summary of different "modes" and configurations

Env var `SPRING_PROFILES_ACTIVE` is a comma-delimited list of profiles to activate. Default is **dev**

- Spring profile **dev** (default): H2, classpath troves, DevDataSeeder runs (dev user + API token).
  - No env vars required

- Spring profile **postgres**: Postgres, no dev seeding (no H2, no seeded user/token).
  - Env vars: `SPRING_DATASOURCE_PASSWORD`

- Spring profile **s3troves**: Trove data loaded from S3; set `MOOCHO_BUCKET_NAME`. Use with `dev` (H2) or `postgres` (Postgres), e.g. `postgres,s3troves`.
  - Env vars: 
    - `AWS_ACCESS_KEY_ID`
    - `AWS_SECRET_ACCESS_KEY`
    - `AWS_REGION`
    - `MOOCHO_BUCKET_NAME`

So-called "Production" mode: You would normally activate **postgres** and **s3troves** profiles, which forces you to provide your own trove data in S3, and create at least one user.

Env var `MOOCHO_ONLY_TROVE_IDS` to limit troves loaded works with all profiles.
