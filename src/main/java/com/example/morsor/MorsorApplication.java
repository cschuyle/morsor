package com.example.morsor;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.core.annotation.Order;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class MorsorApplication {

    private static final Logger log = LoggerFactory.getLogger(MorsorApplication.class);

    public static void main(String[] args) {
        SpringApplication.run(MorsorApplication.class, args);
    }

    @Bean
    @Order(1)
    ApplicationRunner readyLog() {
        return (ApplicationArguments args) -> log.info("READY FOR CONNECTIONS");
    }
}
