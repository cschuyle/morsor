package com.example.morsor.auth;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationResult;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.authorization.AuthenticatedAuthorizationManager;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;

import java.util.function.Supplier;

/**
 * For API requests, allows the request when the response is already committed
 * so we don't throw Access Denied mid-stream (e.g. on async dispatch for streaming endpoints).
 */
public class StreamAwareAuthorizationManager implements AuthorizationManager<RequestAuthorizationContext> {

    private static final AuthenticatedAuthorizationManager<RequestAuthorizationContext> AUTHENTICATED =
            AuthenticatedAuthorizationManager.authenticated();

    @Override
    public AuthorizationResult authorize(Supplier<? extends Authentication> authentication,
                                        RequestAuthorizationContext context) {
        Object resp = context.getRequest().getAttribute(ResponseCapturingFilter.REQUEST_ATTR_RESPONSE);
        if (resp instanceof HttpServletResponse httpResponse && httpResponse.isCommitted()) {
            return new AuthorizationDecision(true);
        }
        return AUTHENTICATED.authorize(authentication, context);
    }
}
