# Morsor

A list of lists navigator

## Why?

The REAL goal: Vibe-code the whole thing. This is my first experience vibe-coding.

But, as for what the app DOES:

I'm a list-maker. I have a few dozen lists which I want to be able to easily search and do some analysis on. That's what the app does.

## What's the name?

This is a re-implementation of a previous app I called Moocho.me.

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

Once this is done, you'll need to set your AWS credentials, then do the same as a canned data run with two extra pieces of configuration:
```
SPRING_PROFILES_ACTIVE=prod MOOCHO_BUCKET_NAME=your-bucket ./gradlew bootRun
```

See [envrc-template](./envrc-template) for a description of the configuration environment variables.

## Build Docker Image

1. Build and run with canned data (dev profile):

```bash
docker build -t morsor .
# or if you need a different architecture (which if you're on a Mac, your PROBABLY DO), maybe something like this:
docker build --platform linux/amd64 -t morsor .
```

This may not work because of "buildx / multi-platform issues" (sorry, no further details here).

A symptom of this would be your web host telling you that the architecture is incorrect. If this happens, AND the default builder supports multi-platform, you can use it:
```
docker buildx create --use --name multiarch  # only if needed
docker buildx build --platform linux/amd64 -t cschuyle/morsor:latest --push .
```

_Note_: The image is a multi-stage build: Node builds the frontend, then Gradle builds the Spring Boot jar (with `-PskipFrontendBuild=true` so the pre-built static is used), and the final image runs only the JAR on Eclipse Temurin 21 JRE.

2. Test it

To use the canned data:
```
docker run -p 8080:8080 morsor
```

To use S3 (prod profile) insteead of canned data, then pass env vars:

```bash
docker run -p 8080:8080 \
  -e SPRING_PROFILES_ACTIVE=prod \
  -e MOOCHO_BUCKET_NAME=your-bucket \
  -e AWS_ACCESS_KEY_ID=... \
  -e AWS_SECRET_ACCESS_KEY=... \
  morsor
```

After you run the image, open http://localhost:8080.

## Build and Push Docker Image all at a\once
```
docker buildx build --platform linux/amd64 -t ypour-usernname/morsor:latest --push .
```