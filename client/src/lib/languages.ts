export type Language = 'en' | 'tr';

export const translations = {
  en: {
    auth: {
      login: 'Login',
      register: 'Register',
      username: 'Username',
      password: 'Password',
      welcomeTitle: 'Welcome to VoiceChat',
      welcomeDescription: 'Connect with friends and communities through voice chat channels. Create your own servers, join voice rooms, and start talking!',
    },
    home: {
      welcome: 'Welcome',
      selectServer: 'Select a server to get started',
    },
    server: {
      channels: 'Channels',
      textChannels: 'TEXT CHANNELS',
      voiceChannels: 'VOICE CHANNELS',
      createServer: 'Create a new server',
      serverName: 'Server Name',
      createChannel: 'Create a new channel',
      channelName: 'Channel Name',
      voiceChannel: 'Voice Channel',
      members: 'Members',
      join: 'Join',
      leave: 'Leave',
    },
  },
  tr: {
    auth: {
      login: 'Giriş Yap',
      register: 'Kayıt Ol',
      username: 'Kullanıcı Adı',
      password: 'Şifre',
      welcomeTitle: 'VoiceChat\'e Hoş Geldiniz',
      welcomeDescription: 'Sesli sohbet kanalları aracılığıyla arkadaşlarınız ve topluluklarla bağlantı kurun. Kendi sunucularınızı oluşturun, sesli odalara katılın ve sohbete başlayın!',
    },
    home: {
      welcome: 'Hoş Geldiniz',
      selectServer: 'Başlamak için bir sunucu seçin',
    },
    server: {
      channels: 'Kanallar',
      textChannels: 'METİN KANALLARI',
      voiceChannels: 'SESLİ KANALLAR',
      createServer: 'Yeni sunucu oluştur',
      serverName: 'Sunucu Adı',
      createChannel: 'Yeni kanal oluştur',
      channelName: 'Kanal Adı',
      voiceChannel: 'Sesli Kanal',
      members: 'Üyeler',
      join: 'Katıl',
      leave: 'Ayrıl',
    },
  },
};
