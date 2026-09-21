# === build stage ===
FROM node:22-alpine AS build
WORKDIR /app
# 🔵 公司 TLS 攔截之根 CA（可選；見 infra/certs/README.md）。
# 端點防毒／網管設備對 HTTPS 做 SSL inspection 時，容器內 npm 會以
# SELF_SIGNED_CERT_IN_CHAIN 全數失敗，而 npm 只印出誤導性的
# 「Exit handler never called!」——真正的錯誤只在 /root/.npm/_logs/*-debug-0.log 裡。
#
# 🔴 **信任範圍刻意收窄到「只有 build 時的 npm registry 連線」**：本段設定的是
#    `npm_config_cafile`（npm 自己的 CA 檔），**不是** Node 行程層的額外信任錨點。
#    ⚠ 後者會留在**執行中的容器**裡，使應用程式對 Azure Blob／AAD／MSSQL 之**全部對外 TLS**
#    都信任該 MITM CA——那是真的削弱，且 F001 `AC-E8` 明文禁止**行程層的額外信任錨點**
#    （該環境變數之字面即列於 `AC-E8` 之禁用清單，故此處刻意不複述；完整說明見
#    infra/certs/README.md「為什麼不用行程層環境變數」）。🔒 **不得改回行程層環境變數。**
# ⚠ 無憑證時 bundle 為空檔 ⇒ `-s` 判定為偽 ⇒ 完全不設定，不影響無需此設定的機器。
COPY --from=corpcerts / /tmp/corpcerts/
RUN cat /tmp/corpcerts/*.crt > /tmp/corp-ca-bundle.pem 2>/dev/null || :
COPY package*.json ./
RUN CAFILE=/tmp/corp-ca-bundle.pem; \
    [ -s "$CAFILE" ] && export npm_config_cafile="$CAFILE"; \
    npm ci
COPY . .
RUN npm run build

# === runtime stage（nginx 靜態伺服）===
FROM nginx:alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
