# Sesli Sohbet Uygulaması

Bu proje, gerçek zamanlı sesli iletişim ve müzik/video paylaşımı özelliklerine sahip bir web uygulamasıdır.

## Özellikler

- Sesli kanallar ve gerçek zamanlı iletişim
- YouTube üzerinden müzik/video oynatma
- Çoklu dil desteği (Türkçe ve İngilizce)
- Kanal yönetimi ve kullanıcı yetkilendirme
- WebSocket tabanlı gerçek zamanlı iletişim

## Gereksinimler

- Node.js (v20 önerilen)
- PostgreSQL veritabanı
- YouTube Data API anahtarı

## Kurulum

1. Bağımlılıkları yükleyin:
```bash
npm install
```

2. `.env` dosyası oluşturun ve aşağıdaki değişkenleri ekleyin:
```
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
YOUTUBE_API_KEY=your_youtube_api_key
REPL_ID=any_random_string
```

3. Veritabanı şemasını oluşturun:
```bash
npm run db:push
```

4. Uygulamayı başlatın:
```bash
# Geliştirme modu
npm run dev

# Veya production modu
npm run build
npm start
```

## Portlar

- Web uygulaması: 5000
- RTMP sunucusu: 1935
- Media sunucusu: 8000

## Lisans

MIT
