FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends asterisk gettext-base ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY pjsip.conf.tmpl extensions.conf.tmpl rtp.conf /templates/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
