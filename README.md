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
npm install
npm run dev
```

## Option 2. You can use AWS S3 as a data store:

You'll have to put your trove data in place. See [DATA.md](./DATA.md) for some info in this. If you need help go ahead and contact me!

Once this is done, you'll need to set your AWS credentials, then do the same as a canned data run with tow extra pieces of configuration:
```
SPRING_PROFILES_ACTIVE=prod MOOCHO_BUCKET_NAME=your-bucket ./gradlew bootRun
```

See [envrc-template](./envrc-template) for a description of the configuration environment variables.

## Deploy to Heroku

1. **Install the [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)** and log in: `heroku login`.

2. **Create the app** (from the project root):
   ```bash
   heroku create your-app-name
   ```

3. **Use two buildpacks** so Node is available when Gradle builds the frontend:
   ```bash
   heroku buildpacks:add heroku/nodejs
   heroku buildpacks:add heroku/java
   ```
   Order matters: Node first, then Java.

4. **Optional – use canned data (dev profile)**  
   Nothing else required. The app will use the JSON files in `src/main/resources/data/` (bundled in the jar).

5. **Optional – use S3 (prod profile)**  
   Set config vars:
   ```bash
   heroku config:set SPRING_PROFILES_ACTIVE=prod
   heroku config:set MOOCHO_BUCKET_NAME=your-bucket-name
   ```
   Ensure the dyno can access S3 (e.g. set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, or use IAM role if you add a Heroku add-on that provides it).

6. **Deploy**:
   ```bash
   git push heroku main
   ```
   (Use `git push heroku master` if your branch is `master`.)

7. **Open the app**: `heroku open`, or visit `https://your-app-name.herokuapp.com`.

The repo includes `system.properties` (Java 21), a root `package.json` (Node 20 for the buildpack), and `server.port=${PORT:8080}` in `application.properties` so the app listens on Heroku’s port.
