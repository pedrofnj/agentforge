package example;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

public class AuditController {
    private static final Logger log = LogManager.getLogger(AuditController.class);

    public void record(String userAgent) {
        log.info("Request from " + userAgent);
    }
}
