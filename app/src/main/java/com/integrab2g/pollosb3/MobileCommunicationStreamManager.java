package com.integrab2g.pollosb3;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Optional per-interaction SSE socket to the authorized B3 backend.
 * Does NOT call TU VERSO directly and never stores its S2S bearer.
 * Stops the physical HTTP connection on client cancellation, activity
 * suspension, agent's terminal event, stream interruption or destruction.
 */
final class MobileCommunicationStreamManager {
    interface ClosedListener { void onClosed(String interactionId); }

    private final ConcurrentHashMap<String, Session> sessions = new ConcurrentHashMap<>();
    private static final String UUID = "(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

    void start(String origin, String interactionId, String appId, String storeId,
               String accessKey, ClosedListener listener) {
        if (interactionId == null || !interactionId.matches(UUID) ||
            storeId == null || !storeId.matches(UUID) ||
            accessKey == null || !accessKey.matches(UUID) ||
            appId == null || !appId.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,149}") ||
            listener == null) return;
        try {
            URI uri = URI.create(origin);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null ||
                uri.getUserInfo() != null || uri.getRawQuery() != null ||
                uri.getRawFragment() != null ||
                (uri.getRawPath() != null && !uri.getRawPath().isEmpty())) return;
        } catch (Exception invalid) { return; }
        Session session = new Session(origin, interactionId, appId, storeId, accessKey, listener);
        if (sessions.putIfAbsent(interactionId, session) != null) return;
        Thread worker = new Thread(() -> run(session), "b3-mobile-communication");
        worker.setDaemon(true);
        session.worker = worker;
        worker.start();
    }

    void stop(String interactionId) {
        if (interactionId == null) return;
        Session current = sessions.remove(interactionId);
        if (current != null) current.stop();
    }

    void closeAll() {
        for (String interactionId : new ArrayList<>(sessions.keySet())) stop(interactionId);
    }

    int activeCount() { return sessions.size(); }

    private void run(Session session) {
        try {
            if (session.stopped) return;
            String path = session.origin + "/api/v1/mobile/interactions/" +
                session.interactionId + "/stream?appId=" +
                URLEncoder.encode(session.appId, "UTF-8") + "&storeId=" +
                URLEncoder.encode(session.storeId, "UTF-8");
            HttpURLConnection connection = (HttpURLConnection) new URL(path).openConnection();
            session.connection = connection;
            if (session.stopped) return;
            connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(30000); // TU VERSO sends heartbeat every 15 s.
            connection.setRequestProperty("Accept", "text/event-stream");
            connection.setRequestProperty("Cache-Control", "no-store");
            connection.setRequestProperty("X-Order-Access-Key", session.accessKey);
            if (connection.getResponseCode() != 200 ||
                !String.valueOf(connection.getContentType()).toLowerCase(java.util.Locale.ROOT)
                    .startsWith("text/event-stream")) return;

            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                String eventName = "";
                while (!session.stopped && (line = reader.readLine()) != null) {
                    if (line.length() > 4096) break; // Never buffer unbounded frames.
                    if (line.startsWith("event:")) {
                        eventName = line.substring(6).trim();
                    } else if (line.isEmpty()) {
                        if ("communication.closed".equals(eventName)) {
                            if (!session.stopped) session.listener.onClosed(session.interactionId);
                            break;
                        }
                        eventName = "";
                    }
                }
            }
        } catch (Exception ignored) {
            // Socket loss is not an operational conversation close.
            // The next authorized status read may reopen the stream.
        } finally {
            sessions.remove(session.interactionId, session);
            session.stop();
        }
    }

    private static final class Session {
        final String origin, interactionId, appId, storeId, accessKey;
        final ClosedListener listener;
        volatile boolean stopped;
        volatile Thread worker;
        volatile HttpURLConnection connection;
        Session(String origin, String interactionId, String appId, String storeId,
                String accessKey, ClosedListener listener) {
            this.origin=origin; this.interactionId=interactionId; this.appId=appId;
            this.storeId=storeId; this.accessKey=accessKey; this.listener=listener;
        }
        void stop() {
            stopped=true;
            HttpURLConnection active=connection;
            if (active!=null) active.disconnect();
            Thread current=worker;
            if (current!=null && current!=Thread.currentThread()) current.interrupt();
        }
    }
}
