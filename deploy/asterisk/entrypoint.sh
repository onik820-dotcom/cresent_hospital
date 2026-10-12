#!/bin/sh
# Render Asterisk config from environment variables, then run Asterisk in the foreground.
set -eu
for v in IPTSP_HOST IPTSP_USER IPTSP_PASSWORD PUBLIC_IP; do
  eval "val=\${$v:-}"
  [ -n "$val" ] || { echo "FATAL: $v is not set (see deploy/.env.example)" >&2; exit 1; }
done
: "${IPTSP_PORT:=5060}" "${IPTSP_ALLOWED_IP:=$IPTSP_HOST}" "${CALLED_NUMBER:=}" "${OUTBOUND_PREFIX=0}"
export IPTSP_PORT IPTSP_ALLOWED_IP CALLED_NUMBER OUTBOUND_PREFIX

# Only these variables are substituted; Asterisk's own ${EXTEN} etc. are left intact.
VARS='${IPTSP_HOST} ${IPTSP_PORT} ${IPTSP_USER} ${IPTSP_PASSWORD} ${IPTSP_ALLOWED_IP} ${PUBLIC_IP} ${CALLED_NUMBER} ${OUTBOUND_PREFIX}'
envsubst "$VARS" < /templates/pjsip.conf.tmpl      > /etc/asterisk/pjsip.conf
envsubst "$VARS" < /templates/extensions.conf.tmpl > /etc/asterisk/extensions.conf
cp /templates/rtp.conf /etc/asterisk/rtp.conf
chown asterisk:asterisk /etc/asterisk/pjsip.conf /etc/asterisk/extensions.conf /etc/asterisk/rtp.conf
chmod 640 /etc/asterisk/pjsip.conf

exec asterisk -f -U asterisk -G asterisk -vvv
