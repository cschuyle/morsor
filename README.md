How to run
Local (classpath): Use the dev profile (default), e.g.
./gradlew bootRun
or explicitly: SPRING_PROFILES_ACTIVE=dev ./gradlew bootRun
Production (S3): Use the prod profile and set the bucket, e.g.
SPRING_PROFILES_ACTIVE=prod MOOCHO_BUCKET_NAME=your-bucket ./gradlew bootRun
or set SPRING_PROFILES_ACTIVE=prod and MOOCHO_BUCKET_NAME in the prod environment.
