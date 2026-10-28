# Pinned build inputs (exact Caddy release and plugin commit) so a rebuild produces the same proxy.
# Upgrade deliberately: change the versions here, rebuild, and run the acceptance suite.
FROM caddy:2.11.7-builder AS builder
RUN xcaddy build v2.11.7 --with github.com/caddyserver/replace-response@v0.0.0-20250618171559-80962887e4c6

FROM caddy:2.11.7
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
