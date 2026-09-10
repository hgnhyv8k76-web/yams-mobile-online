#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "=== Yam's Sandra d'amour V9 — Créé par Loïc Bordier ==="
mkdir -p data

echo "[1/2] Dépendances Go..."
go mod tidy

echo "[2/2] Serveur local..."
echo ""
echo "Mac : http://localhost:8080"
echo "iPhone même Wi-Fi : http://IP_DU_MAC:8080"
echo ""
go run .
