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
    private static final Pattern TEXT_ROW_JSON = Pattern.compile(
            "\"title\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\".*?\"troveId\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\".*?\"score\"\\s*:\\s*([-+]?\\d+(?:\\.\\d+)?(?:[eE][-+]?\\d+)?)",
            Pattern.DOTALL
    );
    private static final Pattern TROVE_TEXT_ROW_JSON = Pattern.compile(
            "\"id\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\".*?\"name\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\".*?\"count\"\\s*:\\s*(\\d+)",
            Pattern.DOTALL
    );

    private MorsorApiCli() {}

    public static void main(String[] args) {
        if (args.length == 0) {
            printSummaryUsageAndExit(0);
        }
        List<String> extraHeaders = new ArrayList<>();
        String base = "http://localhost:8080";
        String bearerToken = null;
        String bodyFile = null;
        String outputMode = "text";
        boolean showHeaders = false;
        boolean debug = false;
        List<String> positional = new ArrayList<>();
        int idx = 0;
        while (idx < args.length) {
            String a = args[idx];
            if (a.equals("--man")) {
                printUsageAndExit(0);
            }
            if (a.equals("-h") || a.equals("--help") || a.equals("help")) {
                printSummaryUsageAndExit(0);
            }
            if (a.equals("-b") || a.equals("--base")) {
                if (idx + 1 >= args.length) {
                    die("missing value for " + a);
                }
                base = stripTrailingSlash(args[++idx]);
                idx++;
                continue;
            }
            if (a.equals("-T") || a.equals("--token")) {
                if (idx + 1 >= args.length) {
                    die("missing value for " + a);
                }
                bearerToken = args[++idx];
                idx++;
                continue;
            }
            if (a.equals("-H") || a.equals("--header")) {
                if (idx + 1 >= args.length) {
                    die("missing value for " + a);
                }
                extraHeaders.add(args[++idx]);
                idx++;
                continue;
            }
            if (a.equals("-F") || a.equals("--file")) {
                if (idx + 1 >= args.length) {
                    die("missing value for " + a);
                }
                bodyFile = args[++idx];
                idx++;
                continue;
            }
            if (a.equals("-o") || a.equals("--output")) {
                if (idx + 1 >= args.length) {
                    die("missing value for " + a);
                }
                outputMode = normalizeOutputMode(args[++idx]);
                idx++;
                continue;
            }
            if (a.equals("-i") || a.equals("--include-headers")) {
                showHeaders = true;
                idx++;
                continue;
            }
            if (a.equals("-v") || a.equals("--debug")) {
                debug = true;
                idx++;
                continue;
            }
            if (a.equals("--")) {
                positional.add(a);
                idx++;
                while (idx < args.length) {
                    positional.add(args[idx++]);
                }
                break;
            }
            positional.add(a);
            idx++;
        }

        int i = 0;
        if (i >= positional.size()) {
            printUsageAndExit(0);
        }

        String envBase = System.getenv("MORSOR_CLI_BASE_URL");
        if (envBase != null && !envBase.isBlank()) {
            base = stripTrailingSlash(envBase.trim());
        }

        if (positional.get(i).equalsIgnoreCase("login")) {
            if (i + 1 < positional.size()) {
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

        String method;
        String path;
        String query = "";

        String first = positional.get(i);
        if (isHttpMethod(first)) {
            method = positional.get(i++).toUpperCase(Locale.ROOT);
            if (i >= positional.size()) {
                die("missing path");
            }
            path = positional.get(i++);
            if (path.startsWith("http://") || path.startsWith("https://")) {
                die("path must be relative (e.g. /api/status), not a full URL");
            }
            if (!path.startsWith("/")) {
                path = "/" + path;
            }

            if (i < positional.size()) {
                if (positional.get(i).equals("--")) {
                    i++;
                    StringBuilder sb = new StringBuilder();
                    while (i < positional.size()) {
                        if (sb.length() > 0) {
                            sb.append('&');
                        }
                        sb.append(positional.get(i++));
                    }
                    query = sb.toString();
                } else {
                    die("unexpected arguments after path (use -- for query string)");
                }
            }
        } else {
            ActionSpec action = resolveActionSpec(first);
            if (action != null) {
                method = action.method;
                path = action.path;
                i++;
            } else {
                method = "GET";
                path = "/api/search";
            }
            query = parseShorthandQuery(positional.toArray(new String[0]), i);
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
            } else if (debug) {
                System.err.println(response.statusCode() + " " + response.uri());
            }
            if ("text".equals(outputMode)) {
                printTextRowsFromJson(response.body(), path);
            } else {
                System.out.print(response.body());
                if (!response.body().isEmpty() && !response.body().endsWith("\n")) {
                    System.out.println();
                }
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

    private static String normalizeOutputMode(String raw) {
        String v = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        return switch (v) {
            case "json", "j" -> "json";
            case "text", "txt", "t" -> "text";
            default -> {
                die("invalid output mode: " + raw + " (expected json/j or text/txt/t)");
                yield "json";
            }
        };
    }

    private static void printTextRowsFromJson(String json, String path) {
        if ("/api/troves".equals(path)) {
            printTroveTextRowsFromJson(json);
            return;
        }
        printSearchTextRowsFromJson(json);
    }

    private static void printSearchTextRowsFromJson(String json) {
        if (json == null || json.isBlank()) {
            return;
        }
        Matcher m = TEXT_ROW_JSON.matcher(json);
        List<TextRow> rows = new ArrayList<>();
        int maxTroveLen = 0;
        while (m.find()) {
            String title = unescapeJsonString(m.group(1));
            String troveId = unescapeJsonString(m.group(2));
            double score = Double.parseDouble(m.group(3));
            rows.add(new TextRow(score, troveId, title));
            if (troveId.length() > maxTroveLen) {
                maxTroveLen = troveId.length();
            }
        }
        for (TextRow row : rows) {
            String paddedTrove = padRight(row.troveId, maxTroveLen);
            System.out.println(String.format(Locale.ROOT, "%.2f", row.score) + "\t" + paddedTrove + "\t" + row.title);
        }
    }

    private static void printTroveTextRowsFromJson(String json) {
        if (json == null || json.isBlank()) {
            return;
        }
        Matcher m = TROVE_TEXT_ROW_JSON.matcher(json);
        List<TroveTextRow> rows = new ArrayList<>();
        int maxIdLen = 0;
        int maxCountLen = 0;
        while (m.find()) {
            String id = unescapeJsonString(m.group(1));
            String name = unescapeJsonString(m.group(2));
            String count = m.group(3);
            rows.add(new TroveTextRow(id, count, name));
            if (id.length() > maxIdLen) {
                maxIdLen = id.length();
            }
            if (count.length() > maxCountLen) {
                maxCountLen = count.length();
            }
        }
        for (TroveTextRow row : rows) {
            System.out.println(padRight(row.id, maxIdLen) + "\t" + padRight(row.count, maxCountLen) + "\t" + row.name);
        }
    }

    private static String unescapeJsonString(String s) {
        String out = s;
        out = out.replace("\\\"", "\"");
        out = out.replace("\\\\", "\\");
        out = out.replace("\\n", "\n");
        out = out.replace("\\r", "\r");
        out = out.replace("\\t", "\t");
        return out;
    }

    private static String padRight(String s, int len) {
        if (s.length() >= len) {
            return s;
        }
        return s + " ".repeat(len - s.length());
    }

    private static final class TextRow {
        final double score;
        final String troveId;
        final String title;

        TextRow(double score, String troveId, String title) {
            this.score = score;
            this.troveId = troveId;
            this.title = title;
        }
    }

    private static final class TroveTextRow {
        final String id;
        final String count;
        final String name;

        TroveTextRow(String id, String count, String name) {
            this.id = id;
            this.count = count;
            this.name = name;
        }
    }

    private static boolean isHttpMethod(String s) {
        String m = s.toUpperCase(Locale.ROOT);
        return m.equals("GET") || m.equals("POST") || m.equals("HEAD");
    }

    private static ActionSpec resolveActionSpec(String token) {
        String t = token.toLowerCase(Locale.ROOT);
        if (t.endsWith(":")) {
            t = t.substring(0, t.length() - 1);
        }
        return switch (t) {
            case "troves" -> new ActionSpec("GET", "/api/troves");
            case "status" -> new ActionSpec("GET", "/api/status");
            case "search" -> new ActionSpec("GET", "/api/search");
            case "dups", "duplicates", "dupliicates" -> new ActionSpec("GET", "/api/search/duplicates");
            case "unique", "uniques" -> new ActionSpec("GET", "/api/search/uniques");
            default -> null;
        };
    }

    private static String parseShorthandQuery(String[] args, int startIdx) {
        List<QueryParam> params = new ArrayList<>();
        List<String> nakedTerms = new ArrayList<>();
        int i = startIdx;
        while (i < args.length) {
            String a = args[i];
            if (a.equals("--man")) {
                printUsageAndExit(0);
            }
            if (a.equals("--help") || a.equals("-h") || a.equals("help")) {
                printSummaryUsageAndExit(0);
            }
            if (a.equals("--")) {
                i++;
                while (i < args.length) {
                    String raw = args[i++];
                    int eq = raw.indexOf('=');
                    if (eq <= 0) {
                        die("raw query items after -- must be key=value, got: " + raw);
                    }
                    params.add(new QueryParam(raw.substring(0, eq), raw.substring(eq + 1)));
                }
                break;
            }
            if (a.startsWith("--")) {
                String nameValue = a.substring(2);
                if (nameValue.isEmpty()) {
                    die("empty parameter name: " + a);
                }
                String key;
                String value;
                int eq = nameValue.indexOf('=');
                if (eq >= 0) {
                    key = nameValue.substring(0, eq);
                    value = nameValue.substring(eq + 1);
                } else {
                    key = nameValue;
                    if (i + 1 >= args.length) {
                        die("missing value for --" + key);
                    }
                    value = args[++i];
                }
                addShorthandParam(params, key, value);
            } else if (a.startsWith("-")) {
                // Single-dash shorthand, e.g. -q alien or -q=alien.
                String nameValue = a.substring(1);
                if (nameValue.isEmpty()) {
                    die("unknown parameter: " + a + " (use --man for usage)");
                }
                String key;
                String value;
                int eq = nameValue.indexOf('=');
                if (eq >= 0) {
                    key = nameValue.substring(0, eq);
                    value = nameValue.substring(eq + 1);
                } else {
                    key = nameValue;
                    if (i + 1 >= args.length) {
                        die("missing value for -" + key);
                    }
                    value = args[++i];
                }
                addShorthandParam(params, key, value);
            } else {
                nakedTerms.add(a);
            }
            i++;
        }
        if (!nakedTerms.isEmpty()) {
            addOrAppendQuery(params, String.join(" ", nakedTerms));
        }
        return encodeQuery(params);
    }

    private static void addShorthandParam(List<QueryParam> params, String key, String value) {
        String k = mapShorthandKey(key);
        if (k.equals("trove")) {
            String[] parts = value.split(",");
            for (String p : parts) {
                String trimmed = p.trim();
                if (!trimmed.isEmpty()) {
                    params.add(new QueryParam("trove", trimmed));
                }
            }
            return;
        }
        params.add(new QueryParam(k, value));
    }

    private static String mapShorthandKey(String key) {
        return switch (key) {
            case "q" -> "query";
            case "p", "primary" -> "primaryTrove";
            case "c", "compare" -> "compareTrove";
            case "P", "page" -> "page";
            case "S", "pageSize", "size" -> "size";
            case "s", "sortBy" -> "sortBy";
            case "d", "sortDir" -> "sortDir";
            case "t", "trove" -> "trove";
            default -> key;
        };
    }

    private static void addOrAppendQuery(List<QueryParam> params, String value) {
        for (int j = 0; j < params.size(); j++) {
            QueryParam p = params.get(j);
            if (p.key.equals("query")) {
                params.set(j, new QueryParam("query", p.value + " " + value));
                return;
            }
        }
        params.add(new QueryParam("query", value));
    }

    private static String encodeQuery(List<QueryParam> params) {
        if (params.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (QueryParam p : params) {
            if (sb.length() > 0) {
                sb.append('&');
            }
            sb.append(urlEncode(p.key)).append('=').append(urlEncode(p.value));
        }
        return sb.toString();
    }

    private static final class ActionSpec {
        final String method;
        final String path;

        ActionSpec(String method, String path) {
            this.method = method;
            this.path = path;
        }
    }

    private static final class QueryParam {
        final String key;
        final String value;

        QueryParam(String key, String value) {
            this.key = key;
            this.value = value;
        }
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
        System.err.println("morsor-cli: " + msg);
        System.exit(2);
    }

    private static void printUsageAndExit(int code) {
        System.out.print(usage());
        System.exit(code);
    }

    private static void printSummaryUsageAndExit(int code) {
        System.out.print(summaryUsage());
        System.exit(code);
    }

    static String summaryUsage() {
        return """
                USAGE SUMMARY
                  
                  morsor-cli --help      # Short usage message (this message)
                  morsor-cli --man       # Full manual page

                  morsor-cli [OPTIONS] login
                      Prompts for username/password and Generates a login token. Then, tells you where to put it:
                      export MORSOR_CLI_TOKEN='...'

                  morsor-cli [OPTIONS] [<action>] [--<key> <value> ...] [query text]

                ACTIONS

                  search                           Search troves. This is the default.
                  dups | duplicates | dupliicates  Search for duplicates.
                  unique | uniques                 Search for unique items within a trove.

                  troves                           Get list of troves
                  status                           Get server status
                  
                OPTIONS

                        -o, --output json|text|txt  Response output format (default: txt)
                    
                    ENV:
                        MORSOR_CLI_BASE_URL env var overrides -b/--base when set

                    --KEY VALUE / --KEY=VALUE, or -k VALUE / -k=VALUE for single-char keys (e.g. -q query)

                    Options for action = search: 
                        -q --query : Query text (multiple space-delimited words OK).
                                     NOTE: You can use the named parameter or not - ONLY for this option.
                      Paging, sorting:
                        -P --page : Page number (0-based)
                        -S --size : Page size (default: 10)
                        -s --sortBy : Sort by field (default: score)
                        -d --sortDir : Sort direction (asc or desc; default: desc) 
                        -t --trove : Comma-separated list of trove IDs (use trove IDs, not names)
                
                    Options for action = duplicates / uniques:
                        -p --primaryTrove : Primary trove ID (use trove ID, not name)
                        -c --compareTrove : Comma-separated list of trove IDs (use trove IDs, not names)
            
                EXAMPLES
                  morsor-cli alien
                  morsor-cli search -q alien -P 0 -S 10
                """;
    }

    /** Full USAGE text: all backend routes and observability. */
    static String usage() {
        return """
                USAGE
                  morsor-cli [OPTIONS] login
                  morsor-cli [OPTIONS] <METHOD> <path> [-- <query>]
                  morsor-cli [OPTIONS] [<action>] [--<key> <value> ...] [query text]

                OPTIONS
                  -b, --base URL     Base URL without trailing slash (default: http://localhost:8080)
                  -T, --token TOKEN  Authorization: Bearer <TOKEN> (API token; most /api routes require auth)
                                     If omitted for localhost/127.0.0.1, defaults to dev token "dev-token"
                  -o, --output MODE  Output format: text/txt (default) or json
                                     text prints tab-delimited: title, troveId, score(2dp)
                  -H, --header LINE  Extra header "Name: value" (repeatable)
                  -F, --file FILE    POST body from FILE (POST only; default Content-Type: application/json)
                  -i, --include-headers  Print response status line and headers before body
                  -v, --debug        Print request and response diagnostics to stderr
                  -h, --help        Show short summary
                  --man             Show full manual

                ENVIRONMENT
                  MORSOR_CLI_BASE_URL  If set and non-empty, overrides -b/--base.

                login
                  Prompts for username and password (password is not echoed). Performs form login against
                  /login (with CSRF), then POST /api/tokens and prints one line for your shell:

                    export MORSOR_CLI_TOKEN='…'

                  Example:  eval "$(morsor-cli login)"

                METHOD
                  GET | POST | HEAD

                action (shorthand)
                  troves                -> GET /api/troves
                  status                -> GET /api/status
                  search                -> GET /api/search
                  dups | duplicates | dupliicates -> GET /api/search/duplicates
                  unique | uniques      -> GET /api/search/uniques
                  If no METHOD and no action are provided, defaults to search.

                path
                  Must start with /. Examples: /api/status, /actuator/health

                query
                  Optional, after --. Raw query string, e.g. query=*&page=0&size=10
                  (repeat trove= for multiple troves: trove=a&trove=b)
                  For shorthand/default-search mode, you can pass params as:
                    --KEY VALUE / --KEY=VALUE, or -k VALUE / -k=VALUE for single-char keys
                  Key aliases:
                    -q query, -p primaryTrove, -c compareTrove, -P page, -S size,
                    -s sortBy, -d sortDir, -t trove (comma-separated values supported)

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

                  morsor-cli --help
                  morsor-cli -b http://localhost:8080 login
                  morsor-cli -v -b http://localhost:8080 GET /api/search -- 'query=*&page=0&size=10'
                  morsor-cli alien
                  morsor-cli search -q alien -P 0 -S 10
                  morsor-cli dups -p my-trove -c other-trove -q alien
                  morsor-cli GET /actuator/health
                  morsor-cli https://example.com GET /actuator/health
                  morsor-cli -t "$MORSOR_CLI_TOKEN" GET /api/status
                  morsor-cli https://example.com login
                  morsor-cli login
                  morsor-cli -t "$MORSOR_CLI_TOKEN" GET /api/search -- query=*&page=0&size=10
                  morsor-cli -t "$MORSOR_CLI_TOKEN" POST /api/troves/reload
                  morsor-cli -t "$MORSOR_CLI_TOKEN" GET /api/search/duplicates -- primaryTrove=my-trove&query=*

                """;
    }
}
