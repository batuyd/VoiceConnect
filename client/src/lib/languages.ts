export type Language = 'en' | 'tr';

export const translations = {
  en: {
    auth: {
      login: 'Login',
      register: 'Register',
      username: 'Username',
      password: 'Password',
      phone: 'Phone Number',
      welcomeTitle: 'Welcome to OZBA',
      welcomeDescription: 'Connect with friends and communities through voice chat channels. Create your own servers, join voice rooms, and start talking!',
      errors: {
        usernameRequired: 'Username is required',
        usernameTooShort: 'Username must be at least 3 characters',
        passwordRequired: 'Password is required',
        passwordTooShort: 'Password must be at least 6 characters',
        emailRequired: 'Email is required',
        invalidEmail: 'Invalid email address',
        phoneRequired: 'Phone number is required',
        invalidPhone: 'Invalid phone number',
        registrationFailed: 'Registration failed. Please try again.',
        loginFailed: 'Invalid username or password',
        logoutFailed: 'Failed to logout'
      }
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
      invite: 'Invite Friends',
      generateInvite: 'Generate Invite Link',
      mute: 'Mute',
      unmute: 'Unmute',
      kick: 'Kick User',
      ban: 'Ban User',
      makeAdmin: 'Make Admin',
      removeAdmin: 'Remove Admin',
      volume: 'Volume',
    },
    settings: {
      title: 'Settings',
      language: 'Language',
      security: 'Security',
      profile: 'Profile',
      audio: {
        title: 'Audio Settings',
        inputDevice: 'Input Device',
        outputDevice: 'Output Device',
        inputVolume: 'Input Volume',
        outputVolume: 'Output Volume',
        test: 'Test Audio',
      },
    },
    profile: {
      title: 'Profile Settings',
      avatarUrl: 'Avatar URL',
      bio: 'About Me',
      age: 'Age',
      saveChanges: 'Save Changes',
      updateSuccess: 'Success',
      profileUpdated: 'Your profile has been updated',
      updateError: 'Update Failed',
      viewProfile: 'View Profile',
      nickname: 'Nickname',
      status: 'Status',
      statusPlaceholder: 'What are you up to?',
      socialLinks: 'Social Links',
      discord: 'Discord',
      twitter: 'Twitter',
      instagram: 'Instagram',
      website: 'Website',
      privacy: 'Privacy Settings',
      privateProfile: 'Private Profile',
      showLastSeen: 'Show Last Seen',
      level: {
        title: 'Level',
        experience: 'Experience',
        nextLevel: 'Next Level',
        currentTitle: 'Current Title',
      },
      gifts: {
        title: 'Gifts',
        send: 'Send Gift',
        history: 'Gift History',
        received: 'Received',
        sent: 'Sent',
        selectGift: 'Select a Gift',
        message: 'Message (Optional)',
        sendGift: 'Send Gift',
        insufficientCoins: 'Insufficient coins',
        giftSent: 'Gift sent successfully',
        from: 'From',
        to: 'To',
        cost: 'Cost',
        experiencePoints: 'Experience Points',
      },
    },
    chat: {
      welcome: 'Welcome to',
      messagePlaceholder: 'Message',
      send: 'Send',
      addReaction: 'Add Reaction',
      removeReaction: 'Remove Reaction',
      reactions: 'Reactions',
      reactionAdded: 'Reaction added',
      reactionRemoved: 'Reaction removed',
    },
    coins: {
      title: 'Ozba Coins',
      balance: 'Current Balance',
      lifetimeEarned: 'Lifetime Earned',
      dailyReward: {
        title: 'Daily Reward',
        claim: 'Claim Daily Reward',
        claimed: 'Claimed',
        nextIn: 'Next reward in',
        success: 'Daily reward claimed!',
        error: 'Already claimed today',
      },
      store: {
        title: 'Coin Store',
        buyCoins: 'Buy Coins',
        popular: 'Popular',
        bonus: 'Bonus',
      },
      achievements: {
        title: 'Achievements',
        progress: 'Progress',
        completed: 'Completed',
        reward: 'Reward',
        types: {
          voice_time: 'Voice Chat Time',
          referrals: 'Referrals',
          reactions: 'Reactions',
          messages: 'Messages Sent',
        },
      },
      transaction: {
        daily_reward: 'Daily Reward',
        purchase: 'Purchase',
        achievement: 'Achievement',
        voice_activity: 'Voice Activity',
        referral: 'Referral Bonus',
      },
    },
    friends: {
      title: 'Friends',
      add: 'Add Friend',
      remove: 'Remove Friend',
      addSuccess: 'Friend Added',
      addSuccessDescription: '{username} has been added to your friends list.',
      addError: 'Could not add friend',
      removeSuccess: 'Friend Removed',
      removeSuccessDescription: '{username} has been removed from your friends list.',
      removeError: 'Could not remove friend',
      empty: 'No friends yet. Add some friends to get started!',
      searchPlaceholder: 'Enter username to add friend',
      sendMessage: 'Send Message',
    },
    blocks: {
      add: 'Block User',
      remove: 'Unblock User',
      addSuccess: 'User Blocked',
      addSuccessDescription: '{username} has been blocked.',
      addError: 'Could not block user',
      removeSuccess: 'User Unblocked',
      removeSuccessDescription: '{username} has been unblocked.',
      removeError: 'Could not unblock user',
    },
    media: {
      urlPlaceholder: 'Enter YouTube URL or music URL',
      play: 'Play',
      nowPlaying: 'Now Playing',
      queue: 'Queue',
      addedToQueue: 'Added to queue',
      skip: 'Skip',
      clearQueue: 'Clear Queue',
      errorPlayback: 'Error playing media',
      joinChannel: 'Join channel to listen',
      addMusic: 'Add Music',
      addVideo: 'Add Video',
      searchMusic: 'Search Music',
      searchVideo: 'Search Video',
      searchPlaceholder: 'Search for songs or videos...',
      searchError: 'Error searching YouTube',
    },
    voice: {
      streamError: 'Failed to access microphone',
      deviceAccessError: 'Could not access audio devices',
      testSoundError: 'Failed to play test sound',
      unmute: 'Unmute',
      mute: 'Mute',
      connecting: 'Connecting...',
      connected: 'Connected',
      disconnected: 'Disconnected',
      reconnecting: 'Reconnecting...',
      connectionError: 'Connection error occurred',
      connectionFailed: 'Connection failed',
    },
    audio: {
      deviceAccessError: 'Could not access audio devices. Please check your permissions.',
      testSoundError: 'Could not play test sound',
      title: 'Audio Settings',
      inputDevice: 'Input Device',
      outputDevice: 'Output Device',
      inputVolume: 'Input Volume',
      outputVolume: 'Output Volume',
      test: 'Test Audio',
      noDevices: 'No audio devices found',
      defaultDevice: 'Default Device',
    },
  },
  tr: {
    auth: {
      login: 'Giriş Yap',
      register: 'Kayıt Ol',
      username: 'Kullanıcı Adı',
      password: 'Şifre',
      phone: 'Telefon Numarası',
      welcomeTitle: 'OZBA\'ya Hoş Geldiniz',
      welcomeDescription: 'Sesli sohbet kanalları aracılığıyla arkadaşlarınız ve topluluklarla bağlantı kurun. Kendi sunucularınızı oluşturun, sesli odalara katılın ve sohbete başlayın!',
      errors: {
        usernameRequired: 'Kullanıcı adı zorunludur',
        usernameTooShort: 'Kullanıcı adı en az 3 karakter olmalıdır',
        passwordRequired: 'Şifre zorunludur',
        passwordTooShort: 'Şifre en az 6 karakter olmalıdır',
        emailRequired: 'E-posta adresi zorunludur',
        invalidEmail: 'Geçersiz e-posta adresi',
        phoneRequired: 'Telefon numarası zorunludur',
        invalidPhone: 'Geçersiz telefon numarası',
        registrationFailed: 'Kayıt işlemi başarısız oldu. Lütfen tekrar deneyin.',
        loginFailed: 'Geçersiz kullanıcı adı veya şifre',
        logoutFailed: 'Çıkış yapılamadı'
      },
      loginSuccess: 'Başarıyla giriş yapıldı',
      registrationSuccess: 'Kayıt işlemi başarılı',
      logoutSuccess: 'Başarıyla çıkış yapıldı'
    },
    home: {
      welcome: 'Hoş Geldiniz',
      selectServer: 'Başlamak için bir sunucu seçin'
    },
    server: {
      channels: 'Kanallar',
      textChannels: 'METİN KANALLARI',
      voiceChannels: 'SESLİ KANALLAR',
      createServer: 'Yeni sunucu oluştur',
      serverName: 'Sunucu Adı',
      createChannel: 'Yeni kanal oluştur',
      channelName: 'Kanal Adı',
      channelNamePlaceholder: 'Kanal adını girin',
      voiceChannel: 'Sesli Kanal',
      members: 'Üyeler',
      join: 'Katıl',
      leave: 'Ayrıl',
      invite: 'Arkadaşlarını Davet Et',
      generateInvite: 'Davet Linki Oluştur',
      selectFriend: 'Arkadaş Seç',
      sendInvite: 'Davet Gönder',
      inviteFriend: 'Arkadaş Davet Et',
      mute: 'Sustur',
      unmute: 'Susturmayı Kaldır',
      kick: 'Kullanıcıyı At',
      ban: 'Kullanıcıyı Yasakla',
      makeAdmin: 'Admin Yap',
      removeAdmin: 'Admin Yetkisini Kaldır',
      volume: 'Ses Seviyesi'
    },
    settings: {
      title: 'Ayarlar',
      general: 'Genel Ayarlar',
      language: 'Dil',
      theme: {
        title: 'Tema Ayarları',
        light: 'Aydınlık',
        dark: 'Karanlık',
        system: 'Sistem'
      },
      audio: {
        title: 'Ses Ayarları',
        input: 'Mikrofon',
        output: 'Hoparlör',
        volume: 'Ses Seviyesi',
        selectInput: 'Mikrofon seçin',
        selectOutput: 'Hoparlör seçin',
        defaultDevice: 'Varsayılan Cihaz',
        test: 'Sesi Test Et',
        quality: 'Ses Kalitesi',
        selectQuality: 'Kalite seçin',
        qualityLow: 'Düşük',
        qualityMedium: 'Orta',
        qualityHigh: 'Yüksek'
      },
      effects: {
        title: 'Efekt Ayarları',
        voice: 'Ses Efekti',
        selectVoice: 'Efekt seçin',
        voiceNone: 'Normal',
        voicePitchUp: 'Tiz Ses',
        voicePitchDown: 'Bas Ses',
        voiceRobot: 'Robot',
        voiceEcho: 'Yankı',
        noiseSuppression: 'Gürültü Engelleme',
        selectNoiseSuppression: 'Seviye seçin',
        noiseSuppressionOff: 'Kapalı',
        noiseSuppressionLow: 'Düşük',
        noiseSuppressionMedium: 'Orta',
        noiseSuppressionHigh: 'Yüksek'
      }
    },
    channel: {
      joinVoice: 'Sesli Kanala Katıl',
      voiceChannelDesc: 'Sesli sohbete katılmak için tıklayın',
      selectChannel: 'Bir Kanal Seçin',
      channelDesc: 'Sohbete başlamak için bir kanal seçin'
    },
    error: {
      connectionLost: 'Bağlantı Kesildi',
      refreshPage: 'Lütfen sayfayı yenileyin',
      connectionError: 'Bağlantı Hatası',
      tryAgainLater: 'Lütfen daha sonra tekrar deneyin'
    }
  }
};