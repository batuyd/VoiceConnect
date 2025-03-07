# Node.js LTS sürümünü kullan
FROM node:lts

# OpenSSL Legacy Mode'u aktif et
ENV NODE_OPTIONS="--openssl-legacy-provider"

# Çalışma dizinini belirle
WORKDIR /usr/src/app

# Paket yöneticisi dosyalarını kopyala
COPY package*.json ./

# Bağımlılıkları yükle
RUN npm install

# Tüm dosyaları kopyala
COPY . .

# Backend'i (server/) build et
RUN cd server && npm run build

# Frontend'i (client/) build et
RUN cd client && npm run build

# Uygulamayı başlat (Backend + Frontend)
CMD ["npm", "run", "start"]
