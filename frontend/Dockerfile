# === build stage ===
FROM node:22-alpine AS build
WORKDIR /app
# 🔵 公司 TLS 攔截之根 CA（可選；見 infra/certs/README.md）。
# 端點防毒／網管設備對 HTTPS 做 SSL inspection 時，容器內 npm 會以
# SELF_SIGNED_CERT_IN_CHAIN 全數失敗，而 npm 只印出誤導性的
# 「Exit handler never called!」——真正的錯誤只在 /root/.npm/_logs/*-debug-0.log 裡。
# 🔴 只把憑證裝進 OS 信任存放區（update-ca-certificates）**沒有用**：
#    Node.js 用的是自己內建的根憑證清單，不看 OS 的，必須走 NODE_EXTRA_CA_CERTS。
# ⚠ mkdir 與 touch 缺一不可：node:22-alpine 無 /usr/local/share/ca-certificates 目錄
#   （cat 的重導向建不出檔），而該檔一旦不存在，npm 每次都會噴
#   `Warning: Ignoring extra certs ... No such file or directory`。
#   無憑證時 bundle 為空檔，npm 靜默忽略 ⇒ 不影響無需此設定的機器。
COPY --from=corpcerts / /tmp/corpcerts/
RUN mkdir -p /usr/local/share/ca-certificates \
    && touch /usr/local/share/ca-certificates/corp-bundle.pem \
    && cat /tmp/corpcerts/*.crt > /usr/local/share/ca-certificates/corp-bundle.pem 2>/dev/null || :
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/corp-bundle.pem
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# === runtime stage（nginx 靜態伺服）===
FROM nginx:alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
