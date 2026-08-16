package com.example.morsor;

import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.webmvc.error.ErrorController;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Replaces Spring Boot's default error handling (an empty body for API clients that ask for
 * JSON, or the HTML Whitelabel page for those that don't) so every error response — including
 * a completely unmapped path — is JSON with a real status/message/path, parseable by any client.
 */
@RestController
public class ApiErrorController implements ErrorController {

    @RequestMapping("/error")
    public ResponseEntity<Map<String, Object>> handleError(HttpServletRequest request) {
        Object statusAttr = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE);
        int statusCode = statusAttr instanceof Integer i ? i : HttpStatus.INTERNAL_SERVER_ERROR.value();
        HttpStatus httpStatus = HttpStatus.resolve(statusCode);
        if (httpStatus == null) {
            httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
        }

        Object message = request.getAttribute(RequestDispatcher.ERROR_MESSAGE);
        Object path = request.getAttribute(RequestDispatcher.ERROR_REQUEST_URI);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", statusCode);
        body.put("error", httpStatus.getReasonPhrase());
        body.put(
                "message",
                message != null && !String.valueOf(message).isBlank() ? message : httpStatus.getReasonPhrase());
        if (path != null) {
            body.put("path", path);
        }
        return ResponseEntity.status(httpStatus).contentType(MediaType.APPLICATION_JSON).body(body);
    }
}
