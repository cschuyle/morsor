package com.example.morsor.cli;

import java.io.IOException;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.HttpCookie;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Minimal HTTP client for the Morsor backend. All endpoints are documented in {@link #usage()}.
 */
public final class MorsorApiCli {

    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(30))
            .build();

    private static final String DEV_DEFAULT_TOKEN = "dev-token";
    private static final Pattern TOKEN_JSON = Pattern.compile("\"token\"\\s*:\\s*\"([^\"]+)\"");

    private MorsorApiCli() {}

    public static void main(String[] args) {
        if (args.length == 0) {
            printUsageAndExit(0);
        }
        List<String> extraHeaders = new ArrayList<>();
        String base = "http://localhost:8080";
        boolean baseFromOption = false;
        String bearerToken = null;
        String bodyFile = null;
        boolean showHeaders = false;
        boolean debug = false;

        int i = 0;
        while (i < args.length) {
            String a = args[i];
            if (a.equals("-h") || a.equals("--help") || a.equals("help")) {
                printUsageAndExit(0);
            }
            if (a.equals("-b") || a.equals("--base")) {
                if (i + 1 >= args.length) {
                    die("missing value for " + a);
                }
                base = stripTrailingSlash(args[++i]);
                baseFromOption = true;
                i++;
                continue;
            }
            if (a.equals("-t") || a.equals("--token")) {
                if (i + 1 >= args.length) {
                    die("missing value for " + a);
                }
                bearerToken = args[++i];
                i++;
                continue;
            }
            if (a.equals("-H") || a.equals("--header")) {
                if (i + 1 >= args.length) {
                    die("missing value for " + a);
                }
                extraHeaders.add(args[++i]);
                i++;
                continue;
            }
            if (a.equals("-d") || a.equals("--data")) {
                if (i + 1 >= args.length) {
                    die("missing value for " + a);
                }
                bodyFile = args[++i];
                i++;
                continue;
            }
            if (a.equals("-i") || a.equals("--include-headers")) {
                showHeaders = true;
                i++;
                continue;
            }
            if (a.equals("-v") || a.equals("--debug")) {
                debug = true;
                i++;
                continue;
            }
            if (a.startsWith("-")) {
                die("unknown option: " + a);
            }
            break;
        }
        if (i < args.length) {
            String maybeBase = args[i];
            if (maybeBase.startsWith("http://") || maybeBase.startsWith("https://")) {
                if (baseFromOption) {
                    die("use either -b/--base or a leading base URL, not both");
                }
                base = stripTrailingSlash(maybeBase);
                i++;
            }
        }
        if (i >= args.length) {
            printUsageAndExit(0);
        }

        if (args[i].equalsIgnoreCase("login")) {
            if (i + 1 < args.length) {
                die("login takes no arguments (use -b for base URL)");
            }
            if (bodyFile != null) {
                die("--data is not valid with login");
            }
            if (bearerToken != null) {
                die("--token is not valid with login");
            }
            if (!extraHeaders.isEmpty()) {
                die("-H is not valid with login");
            }
            if (showHeaders) {
                die("-i is not valid with login");
            }
            runLogin(base);
            return;
        }

        String method = args[i++].toUpperCase(Locale.ROOT);
        if (!method.equals("GET") && !method.equals("POST") && !method.equals("HEAD")) {
            die("method must be GET, POST, or HEAD, or use login, got: " + method);
        }
        if (i >= args.length) {
            die("missing path");
        }
        String path = args[i++];
        if (path.startsWith("http://") || path.startsWith("https://")) {
            die("path must be relative (e.g. /api/status), not a full URL");
        }
        if (!path.startsWith("/")) {
            path = "/" + path;
        }

        String query = "";
        if (i < args.length) {
            if (args[i].equals("--")) {
                i++;
                StringBuilder sb = new StringBuilder();
                while (i < args.length) {
                    if (sb.length() > 0) {
                        sb.append('&');
                    }
                    sb.append(args[i++]);
                }
                query = sb.toString();
            } else {
                die("unexpected arguments after path (use -- for query string)");
            }
        }

        if (bodyFile != null && !method.equals("POST")) {
            die("--data is only valid for POST");
        }

        URI uri;
        try {
            if (query.isEmpty()) {
                uri = URI.create(base + path);
            } else {
                uri = URI.create(base + path + "?" + query);
            }
        } catch (IllegalArgumentException e) {
            die("bad URL: " + e.getMessage());
            return;
        }

        String effectiveBearerToken = bearerToken;
        if ((effectiveBearerToken == null || effectiveBearerToken.isBlank()) && isLikelyLocalDevBase(base)) {
            effectiveBearerToken = DEV_DEFAULT_TOKEN;
        }

        HttpRequest.Builder rb = HttpRequest.newBuilder(uri).timeout(Duration.ofMinutes(10));
        if (effectiveBearerToken != null && !effectiveBearerToken.isBlank()) {
            rb.header("Authorization", "Bearer " + effectiveBearerToken.trim());
        }
        for (String h : extraHeaders) {
            int eq = h.indexOf(':');
            if (eq <= 0) {
                die("header must be Name: value, got: " + h);
            }
            String name = h.substring(0, eq).trim();
            String value = h.substring(eq + 1).trim();
            rb.header(name, value);
        }

        HttpRequest.BodyPublisher bodyPublisher;
        if (method.equals("POST")) {
            if (bodyFile != null) {
                Path p = Path.of(bodyFile);
                byte[] bytes;
                try {
                    bytes = Files.readAllBytes(p);
                } catch (IOException e) {
                    die("cannot read body file: " + e.getMessage());
                    return;
                }
                bodyPublisher = HttpRequest.BodyPublishers.ofByteArray(bytes);
                if (!hasHeader(extraHeaders, "Content-Type")) {
                    rb.header("Content-Type", "application/json");
                }
            } else {
                bodyPublisher = HttpRequest.BodyPublishers.noBody();
            }
            rb.method(method, bodyPublisher);
        } else {
            rb.method(method, HttpRequest.BodyPublishers.noBody());
        }

        HttpRequest request = rb.build();
        if (debug) {
            printRequestDebug(request);
        }
        try {
            HttpResponse<String> response = HTTP.send(request, HttpResponse.BodyHandlers.ofString());
            if (debug) {
                printResponseDebug(response);
            }
            if (showHeaders) {
                System.out.println(response.version() + " " + response.statusCode());
                response.headers().map().forEach((name, values) -> {
                    for (String v : values) {
                        System.out.println(name + ": " + v);
                    }
                });
                System.out.println();
            } else {
                System.err.println(response.statusCode() + " " + response.uri());
            }
            System.out.print(response.body());
            if (!response.body().isEmpty() && !response.body().endsWith("\n")) {
                System.out.println();
            }
            if (response.statusCode() >= 400) {
                System.exit(1);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            die("request interrupted: " + formatThrowable(e) + " (" + request.method() + " " + request.uri() + ")");
        } catch (IOException e) {
            die("request failed: " + formatThrowable(e) + " (" + request.method() + " " + request.uri() + ")");
        }
    }

    /**
     * Form login (session cookie) then create an API token. Prints a shell {@code export} line for eval.
     */
    private static void runLogin(String base) {
        java.io.Console console = System.console();
        if (console == null) {
            die("no console available; cannot read password securely (use a TTY)");
        }
        String username = console.readLine("Username: ");
        if (username == null) {
            username = "";
        }
        username = username.trim();
        char[] passwordChars = console.readPassword("Password: ");
        String password = passwordChars == null ? "" : new String(passwordChars);
        if (passwordChars != null) {
            Arrays.fill(passwordChars, '\0');
        }
        if (username.isEmpty() || password.isEmpty()) {
            die("username and password are required");
        }

        CookieManager cookieManager = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        HttpClient client = HttpClient.newBuilder()
                .cookieHandler(cookieManager)
                .connectTimeout(Duration.ofSeconds(30))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();

        URI baseUri = URI.create(base);
        try {
            primeCsrf(client, baseUri);
            String xsrf = requireXsrfToken(cookieManager, baseUri);
            HttpResponse<String> loginRes = postFormLogin(client, baseUri, xsrf, username, password);
            if (loginRes.statusCode() == 401 || loginRes.statusCode() == 403) {
                primeCsrf(client, baseUri);
                xsrf = requireXsrfToken(cookieManager, baseUri);
                loginRes = postFormLogin(client, baseUri, xsrf, username, password);
            }
            if (loginRes.statusCode() == 401 || loginRes.statusCode() == 403) {
                die("login failed: invalid username or password (HTTP " + loginRes.statusCode() + ")");
            }
            if (!sessionAuthenticated(client, baseUri)) {
                die("login failed: session not authenticated (check credentials and server)");
            }

            HttpRequest tokenReq = HttpRequest.newBuilder(baseUri.resolve("/api/tokens"))
                    .timeout(Duration.ofMinutes(2))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString("{}"))
                    .build();
            HttpResponse<String> tokenRes = client.send(tokenReq, HttpResponse.BodyHandlers.ofString());
            if (tokenRes.statusCode() >= 400) {
                die("token creation failed: HTTP " + tokenRes.statusCode() + " " + tokenRes.body());
            }
            String token = extractTokenJson(tokenRes.body());
            if (token == null || token.isEmpty()) {
                die("token creation failed: no token in response");
            }
            System.out.println("export MORSOR_CLI_TOKEN=" + shellSingleQuoted(token));
        } catch (IOException e) {
            die("login failed: " + e.getMessage());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            die("login interrupted");
        }
    }

    private static void primeCsrf(HttpClient client, URI baseUri) throws IOException, InterruptedException {
        URI prime = baseUri.resolve("/api/auth/csrf-prime");
        HttpRequest req = HttpRequest.newBuilder(prime)
                .timeout(Duration.ofMinutes(2))
                .GET()
                .build();
        client.send(req, HttpResponse.BodyHandlers.discarding());
    }

    private static String requireXsrfToken(CookieManager cookieManager, URI baseUri) {
        List<HttpCookie> scoped = cookieManager.getCookieStore().get(baseUri);
        String from = findXsrfInList(scoped);
        if (from != null) {
            return from;
        }
        List<HttpCookie> all = cookieManager.getCookieStore().getCookies();
        from = findXsrfInList(all);
        if (from != null) {
            return from;
        }
        die("missing XSRF-TOKEN cookie after CSRF prime; is the server reachable?");
        return "";
    }

    private static String findXsrfInList(List<HttpCookie> cookies) {
        if (cookies == null) {
            return null;
        }
        for (HttpCookie c : cookies) {
            if ("XSRF-TOKEN".equalsIgnoreCase(c.getName()) && c.getValue() != null && !c.getValue().isEmpty()) {
                return c.getValue();
            }
        }
        return null;
    }

    private static HttpResponse<String> postFormLogin(
            HttpClient client,
            URI baseUri,
            String xsrfToken,
            String username,
            String password
    ) throws IOException, InterruptedException {
        String form = "username=" + urlEncode(username) + "&password=" + urlEncode(password);
        HttpRequest req = HttpRequest.newBuilder(baseUri.resolve("/login"))
                .timeout(Duration.ofMinutes(2))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .header("X-XSRF-TOKEN", xsrfToken)
                .POST(HttpRequest.BodyPublishers.ofString(form))
                .build();
        return client.send(req, HttpResponse.BodyHandlers.ofString());
    }

    private static boolean sessionAuthenticated(HttpClient client, URI baseUri) throws IOException, InterruptedException {
        HttpRequest req = HttpRequest.newBuilder(baseUri.resolve("/api/auth/session"))
                .timeout(Duration.ofMinutes(2))
                .GET()
                .build();
        HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() != 200) {
            return false;
        }
        String body = res.body();
        return body != null && body.contains("\"authenticated\":true");
    }

    private static String urlEncode(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    /** Safe for bash: wrap in single quotes, escape embedded single quotes. */
    static String shellSingleQuoted(String s) {
        return "'" + s.replace("'", "'\\''") + "'";
    }

    private static String extractTokenJson(String json) {
        if (json == null) {
            return null;
        }
        Matcher m = TOKEN_JSON.matcher(json);
        return m.find() ? m.group(1) : null;
    }

    private static boolean hasHeader(List<String> extraHeaders, String name) {
        String prefix = name + ":";
        for (String h : extraHeaders) {
            if (h.regionMatches(true, 0, prefix, 0, prefix.length())) {
                return true;
            }
        }
        return false;
    }

    private static String stripTrailingSlash(String s) {
        if (s.endsWith("/") && s.length() > 1) {
            return s.substring(0, s.length() - 1);
        }
        return s;
    }

    private static void printRequestDebug(HttpRequest request) {
        System.err.println("[debug] request: " + request.method() + " " + request.uri());
        request.headers().map().forEach((name, values) -> {
            for (String v : values) {
                if ("authorization".equalsIgnoreCase(name)) {
                    System.err.println("[debug] " + name + ": <redacted>");
                } else {
                    System.err.println("[debug] " + name + ": " + v);
                }
            }
        });
    }

    private static void printResponseDebug(HttpResponse<String> response) {
        System.err.println("[debug] response: " + response.statusCode() + " " + response.uri());
        response.headers().map().forEach((name, values) -> {
            for (String v : values) {
                System.err.println("[debug] " + name + ": " + v);
            }
        });
    }

    private static String formatThrowable(Throwable t) {
        StringBuilder sb = new StringBuilder(t.getClass().getSimpleName());
        if (t.getMessage() != null && !t.getMessage().isBlank()) {
            sb.append(": ").append(t.getMessage());
        }
        Throwable cause = t.getCause();
        if (cause != null) {
            sb.append(" (cause: ").append(cause.getClass().getSimpleName());
            if (cause.getMessage() != null && !cause.getMessage().isBlank()) {
                sb.append(": ").append(cause.getMessage());
            }
            sb.append(")");
        }
        return sb.toString();
    }

    private static boolean isLikelyLocalDevBase(String base) {
        try {
            URI uri = URI.create(base);
            String host = uri.getHost();
            if (host == null) {
                return false;
            }
            return "localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host);
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private static void die(String msg) {
        System.err.println("morsor-api-cli: " + msg);
        System.exit(2);
    }

    private static void printUsageAndExit(int code) {
        System.out.print(usage());
        System.exit(code);
    }

    /** Full USAGE text: all backend routes and observability. */
    static String usage() {
        return """
                USAGE
                  morsor-api-cli [OPTIONS] login
                  morsor-api-cli [OPTIONS] [<baseUrl>] <METHOD> <path> [-- <query>]

                OPTIONS
                  -b, --base URL     Base URL without trailing slash (default: http://localhost:8080)
                                     (same as optional leading <baseUrl> http:// or https:// …; do not use both)
                  -t, --token TOKEN  Authorization: Bearer <TOKEN> (API token; most /api routes require auth)
                                     If omitted for localhost/127.0.0.1, defaults to dev token "dev-token"
                  -H, --header LINE  Extra header "Name: value" (repeatable)
                  -d, --data FILE    POST body from FILE (POST only; default Content-Type: application/json)
                  -i, --include-headers  Print response status line and headers before body
                  -v, --debug        Print request and response diagnostics to stderr
                  -h, --help         Show this message

                login
                  Prompts for username and password (password is not echoed). Performs form login against
                  /login (with CSRF), then POST /api/tokens and prints one line for your shell:

                    export MORSOR_CLI_TOKEN='…'

                  Example:  eval "$(./scripts/morsor-api login)"

                METHOD
                  GET | POST | HEAD

                path
                  Must start with /. Examples: /api/status, /actuator/health

                query
                  Optional, after --. Raw query string, e.g. query=*&page=0&size=10
                  (repeat trove= for multiple troves: trove=a&trove=b)

                AUTHENTICATION
                  Most /api/** endpoints require a logged-in session or API token.
                  Anonymous: GET /api/auth/csrf-prime, GET /api/auth/session only (see SecurityConfig).

                ENDPOINTS (application)

                  GET    /api/troves
                  POST   /api/troves/reload
                  POST   /api/troves/reload/stream     (NDJSON progress)

                  GET    /api/status                 (app status + search cache stats)
                  POST   /api/cache/clear

                  GET    /api/search
                         ?query=&trove=&boostTrove=&fileTypes=&thumbs=&page=&size=&sortBy=&sortDir=

                  GET    /api/search/duplicates
                         ?primaryTrove=&compareTrove=&query=&page=&size=&maxMatches=&sortBy=&sortDir=

                  GET    /api/search/duplicates/stream   (NDJSON: progress then result)
                         (same query params as /search/duplicates)

                  GET    /api/search/uniques
                         ?primaryTrove=&compareTrove=&query=&page=&size=&sortBy=&sortDir=

                  GET    /api/search/uniques/stream
                         (same query params as /search/uniques)

                  GET    /api/auth/csrf-prime         (204, no body)
                  GET    /api/auth/session            (JSON authenticated flag)
                  POST   /api/tokens                  (JSON body optional { "name": "..." }; requires auth)

                OBSERVABILITY (Spring Boot Actuator)

                  Default management path: /actuator
                  This app exposes (see application.properties):
                    GET    /actuator/health

                  Other actuator endpoints (e.g. /actuator/info, /actuator/metrics) are not exposed unless
                  you add them via management.endpoints.web.exposure.include.

                EXAMPLES

                  ./scripts/morsor-api http://localhost:8080 login
                  ./scripts/morsor-api -v -b http://localhost:8080 GET /api/search -- 'query=*&page=0&size=10'
                  ./scripts/morsor-api GET /actuator/health
                  ./scripts/morsor-api https://example.com GET /actuator/health
                  ./scripts/morsor-api -t "$MORSOR_CLI_TOKEN" GET /api/status
                  ./scripts/morsor-api https://example.com login
                  ./scripts/morsor-api login
                  ./scripts/morsor-api -t "$MORSOR_CLI_TOKEN" GET /api/search -- query=*&page=0&size=10
                  ./scripts/morsor-api -t "$MORSOR_CLI_TOKEN" POST /api/troves/reload
                  ./scripts/morsor-api -t "$MORSOR_CLI_TOKEN" GET /api/search/duplicates -- primaryTrove=my-trove&query=*

                """;
    }
}
