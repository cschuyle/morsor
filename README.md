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

I used Cursor for this.

Morsa + Cursor = Morsor.

## Features

- Search all troves (that's what I call a list), or a subset of troves.
- Find duplicate items (or, near-duplicates) across troves.
- Conversely, find unique items within a trove, with respect to other troves.
    - Example: a list of movie favorites, and a list of movies which are available on Kanopy. Find movies which I like but whih I can't get on Kanopy. Then I can rent or buy those movies instead of getting them for free on Kanopy.

## Where do I get the data?

That's another story. Short answer: scripts and manual slogging.

## Requirements for local development or running

- Java 21
- Node (npm)

## How to run

Using the canned data:
```
./gradlew bootRun
```

You can also use AWS S3 as a data store:
```
SPRING_PROFILES_ACTIVE=prod MOOCHO_BUCKET_NAME=your-bucket ./gradlew bootRun
```

See `envrc-template` for a description of the configuration environment variables.