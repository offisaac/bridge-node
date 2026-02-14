#!/bin/bash
# BridgeNode SSH Tunnel Generator
# Usage: ./generate_ssh.sh -u user -h host -p 8080

LOCAL_PORT=8080
REMOTE_PORT=8080
USER=""
HOST=""

while getopts "u:h:p:r:" opt; do
    case $opt in
        u) USER="$OPTARG";;
        h) HOST="$OPTARG";;
        p) LOCAL_PORT="$OPTARG";;
        r) REMOTE_PORT="$OPTARG";;
    esac
done

if [ -z "$USER" ] || [ -z "$HOST" ]; then
    echo "Usage: $0 -u <user> -h <host> [-p <local_port>] [-r <remote_port>]"
    echo ""
    echo "Options:"
    echo "  -u  SSH username (required)"
    echo "  -h  SSH host (required)"
    echo "  -p  Local port (default: 8080)"
    echo "  -r  Remote port (default: 8080)"
    exit 1
fi

echo "SSH Tunnel Command:"
echo "==================="
echo "ssh -L ${LOCAL_PORT}:localhost:${REMOTE_PORT} ${USER}@${HOST} -N -f"
echo ""
echo "Or add to ~/.ssh/config:"
echo "Host bridge-node"
echo "    HostName ${HOST}"
echo "    User ${USER}"
echo "    LocalForward ${LOCAL_PORT} localhost:${REMOTE_PORT}"
echo "    IdentityFile ~/.ssh/id_rsa"
echo "    ServerAliveInterval 60"
