package com.example.morsor;

import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

import java.io.IOException;

/**
 * Ensures REST endpoints like /troves and /search are handled by controllers,
 * not by the default static resource handler (which would return 404 for unknown paths).
 * Static files (with extensions or under /assets/) are still served from classpath:static.
 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**")
                .addResourceLocations("classpath:/static/")
                .resourceChain(true)
                .addResolver(new PathResourceResolver() {
                    @Override
                    protected Resource getResource(String resourcePath, Resource location) throws IOException {
                        Resource resource = location.createRelative(resourcePath);
                        // Only serve if the resource exists (real file) or is index.html for SPA root
                        if (resource.exists() && resource.isReadable()) {
                            return resource;
                        }
                        if ("".equals(resourcePath) || "index.html".equals(resourcePath)
                                || "login".equals(resourcePath)
                                || "mobile".equals(resourcePath) || resourcePath.startsWith("mobile/")) {
                            resource = location.createRelative("index.html");
                            if (resource.exists() && resource.isReadable()) {
                                return resource;
                            }
                        }
                        return null; // let DispatcherServlet try controllers (e.g. /api/troves, /api/search)
                    }
                });
    }
}
